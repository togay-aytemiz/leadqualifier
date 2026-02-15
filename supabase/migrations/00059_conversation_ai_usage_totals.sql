ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS ai_usage_input_tokens_total BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ai_usage_output_tokens_total BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ai_usage_total_tokens_total BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ai_usage_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ai_usage_total_credits NUMERIC(14, 1) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.handle_conversation_ai_usage_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    conversation_id_text TEXT;
    conversation_id_value UUID;
    credit_debit NUMERIC(14, 1);
BEGIN
    conversation_id_text := btrim(COALESCE(NEW.metadata->>'conversation_id', ''));
    IF conversation_id_text = '' THEN
        RETURN NEW;
    END IF;

    IF conversation_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RETURN NEW;
    END IF;

    conversation_id_value := conversation_id_text::UUID;
    credit_debit := GREATEST(0, public.compute_credit_cost(NEW.input_tokens, NEW.output_tokens));

    UPDATE public.conversations
    SET
        ai_usage_input_tokens_total = ai_usage_input_tokens_total + GREATEST(NEW.input_tokens, 0),
        ai_usage_output_tokens_total = ai_usage_output_tokens_total + GREATEST(NEW.output_tokens, 0),
        ai_usage_total_tokens_total = ai_usage_total_tokens_total + GREATEST(NEW.total_tokens, 0),
        ai_usage_count = ai_usage_count + 1,
        ai_usage_total_credits = ai_usage_total_credits + credit_debit
    WHERE id = conversation_id_value
        AND organization_id = NEW.organization_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_ai_usage_recorded_update_conversation_totals ON public.organization_ai_usage;
CREATE TRIGGER on_ai_usage_recorded_update_conversation_totals
    AFTER INSERT ON public.organization_ai_usage
    FOR EACH ROW EXECUTE FUNCTION public.handle_conversation_ai_usage_totals();

WITH usage_by_conversation AS (
    SELECT
        organization_id,
        (metadata->>'conversation_id')::UUID AS conversation_id,
        SUM(GREATEST(input_tokens, 0))::BIGINT AS input_tokens_total,
        SUM(GREATEST(output_tokens, 0))::BIGINT AS output_tokens_total,
        SUM(GREATEST(total_tokens, 0))::BIGINT AS total_tokens_total,
        COUNT(*)::INTEGER AS usage_count,
        SUM(GREATEST(public.compute_credit_cost(input_tokens, output_tokens), 0))::NUMERIC(14, 1) AS total_credits
    FROM public.organization_ai_usage
    WHERE
        btrim(COALESCE(metadata->>'conversation_id', '')) <> ''
        AND (metadata->>'conversation_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    GROUP BY organization_id, (metadata->>'conversation_id')::UUID
)
UPDATE public.conversations
SET
    ai_usage_input_tokens_total = usage_by_conversation.input_tokens_total,
    ai_usage_output_tokens_total = usage_by_conversation.output_tokens_total,
    ai_usage_total_tokens_total = usage_by_conversation.total_tokens_total,
    ai_usage_count = usage_by_conversation.usage_count,
    ai_usage_total_credits = usage_by_conversation.total_credits
FROM usage_by_conversation
WHERE
    conversations.id = usage_by_conversation.conversation_id
    AND conversations.organization_id = usage_by_conversation.organization_id;
