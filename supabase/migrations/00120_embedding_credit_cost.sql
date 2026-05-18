-- Price text embedding usage separately from chat completion token usage.
-- The existing chat credit baseline is 1 credit per 3,000 gpt-4o-mini input-token
-- equivalents: 3,000 * $0.15 / 1M = $0.00045 per credit.

CREATE OR REPLACE FUNCTION public.compute_ai_usage_credit_cost(
    category TEXT,
    model TEXT,
    input_tokens INT,
    output_tokens INT
)
RETURNS NUMERIC(14, 1)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    normalized_category TEXT := lower(btrim(COALESCE(category, '')));
    normalized_model TEXT := lower(btrim(COALESCE(model, '')));
    normalized_input_tokens INT := GREATEST(COALESCE(input_tokens, 0), 0);
    normalized_output_tokens INT := GREATEST(COALESCE(output_tokens, 0), 0);
    embedding_usd_per_1m_tokens NUMERIC;
    credit_reference_usd NUMERIC := (3000.0 * 0.15) / 1000000.0;
    embedding_usd NUMERIC;
BEGIN
    IF normalized_category = 'embedding' THEN
        embedding_usd_per_1m_tokens := CASE
            WHEN normalized_model = 'text-embedding-3-small' THEN 0.02
            WHEN normalized_model = 'text-embedding-3-large' THEN 0.13
            WHEN normalized_model = 'text-embedding-ada-002' THEN 0.10
            ELSE NULL
        END;

        IF embedding_usd_per_1m_tokens IS NOT NULL THEN
            embedding_usd := (normalized_input_tokens::NUMERIC * embedding_usd_per_1m_tokens) / 1000000.0;

            RETURN CASE
                WHEN embedding_usd <= 0 THEN 0.0
                ELSE CEIL((embedding_usd / credit_reference_usd) * 10) / 10.0
            END::NUMERIC(14, 1);
        END IF;
    END IF;

    RETURN public.compute_credit_cost(normalized_input_tokens, normalized_output_tokens);
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_ai_usage_credit_cost(TEXT, TEXT, INT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_ai_usage_credit_debit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    account_row public.organization_billing_accounts%ROWTYPE;
    debit NUMERIC(14, 1);
    remaining_package NUMERIC(14, 1);
    package_debit NUMERIC(14, 1);
    topup_debit NUMERIC(14, 1);
    total_balance_after NUMERIC(14, 1);
    next_lock_reason public.billing_lock_reason;
    next_membership_state public.billing_membership_state;
BEGIN
    debit := public.compute_ai_usage_credit_cost(NEW.category, NEW.model, NEW.input_tokens, NEW.output_tokens);
    IF debit <= 0 THEN
        RETURN NEW;
    END IF;

    SELECT *
    INTO account_row
    FROM public.organization_billing_accounts
    WHERE organization_id = NEW.organization_id
    FOR UPDATE;

    IF account_row.organization_id IS NULL THEN
        PERFORM public.initialize_org_billing_account(NEW.organization_id);

        SELECT *
        INTO account_row
        FROM public.organization_billing_accounts
        WHERE organization_id = NEW.organization_id
        FOR UPDATE;
    END IF;

    IF account_row.membership_state = 'trial_active' THEN
        account_row.trial_credit_used := LEAST(account_row.trial_credit_limit, account_row.trial_credit_used + debit);

        next_membership_state := account_row.membership_state;
        next_lock_reason := account_row.lock_reason;

        IF now() > account_row.trial_ends_at THEN
            next_membership_state := 'trial_exhausted';
            next_lock_reason := 'trial_time_expired';
        ELSIF account_row.trial_credit_used >= account_row.trial_credit_limit THEN
            next_membership_state := 'trial_exhausted';
            next_lock_reason := 'trial_credits_exhausted';
        ELSE
            next_lock_reason := 'none';
        END IF;

        UPDATE public.organization_billing_accounts
        SET
            trial_credit_used = account_row.trial_credit_used,
            membership_state = next_membership_state,
            lock_reason = next_lock_reason,
            updated_at = now()
        WHERE organization_id = NEW.organization_id;

        total_balance_after := GREATEST(0, account_row.trial_credit_limit - account_row.trial_credit_used);

        INSERT INTO public.organization_credit_ledger (
            organization_id,
            entry_type,
            credit_pool,
            credits_delta,
            balance_after,
            usage_id,
            reason,
            metadata
        )
        VALUES (
            NEW.organization_id,
            'usage_debit'::public.billing_credit_ledger_type,
            'trial_pool'::public.billing_credit_pool_type,
            -debit,
            total_balance_after,
            NEW.id,
            'AI usage debit',
            jsonb_build_object(
                'category', NEW.category,
                'model', NEW.model,
                'source', NULLIF(btrim(COALESCE(NEW.metadata->>'source', '')), '')
            )
        );

        RETURN NEW;
    END IF;

    IF account_row.membership_state = 'premium_active' THEN
        IF account_row.current_period_end IS NOT NULL AND now() > account_row.current_period_end THEN
            RAISE EXCEPTION 'Premium billing period has ended';
        END IF;

        remaining_package := GREATEST(0, account_row.monthly_package_credit_limit - account_row.monthly_package_credit_used);
        topup_debit := LEAST(account_row.topup_credit_balance, debit);
        package_debit := GREATEST(0, debit - topup_debit);

        IF topup_debit > 0 THEN
            account_row.topup_credit_balance := GREATEST(0, account_row.topup_credit_balance - topup_debit);
        END IF;

        IF package_debit > 0 THEN
            account_row.monthly_package_credit_used := LEAST(
                account_row.monthly_package_credit_limit,
                account_row.monthly_package_credit_used + package_debit
            );
        END IF;

        IF
            GREATEST(0, account_row.monthly_package_credit_limit - account_row.monthly_package_credit_used) <= 0
            AND account_row.topup_credit_balance <= 0
        THEN
            next_lock_reason := 'package_credits_exhausted';
        ELSE
            next_lock_reason := 'none';
        END IF;

        UPDATE public.organization_billing_accounts
        SET
            monthly_package_credit_used = account_row.monthly_package_credit_used,
            topup_credit_balance = account_row.topup_credit_balance,
            lock_reason = next_lock_reason,
            updated_at = now()
        WHERE organization_id = NEW.organization_id;

        total_balance_after := GREATEST(0, account_row.monthly_package_credit_limit - account_row.monthly_package_credit_used)
            + account_row.topup_credit_balance;

        INSERT INTO public.organization_credit_ledger (
            organization_id,
            entry_type,
            credit_pool,
            credits_delta,
            balance_after,
            usage_id,
            reason,
            metadata
        )
        VALUES (
            NEW.organization_id,
            'usage_debit'::public.billing_credit_ledger_type,
            CASE
                WHEN package_debit > 0 AND topup_debit > 0 THEN 'mixed'::public.billing_credit_pool_type
                WHEN package_debit > 0 THEN 'package_pool'::public.billing_credit_pool_type
                ELSE 'topup_pool'::public.billing_credit_pool_type
            END,
            -debit,
            total_balance_after,
            NEW.id,
            'AI usage debit',
            jsonb_build_object(
                'category', NEW.category,
                'model', NEW.model,
                'source', NULLIF(btrim(COALESCE(NEW.metadata->>'source', '')), ''),
                'package_debit', package_debit,
                'topup_debit', topup_debit
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

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
    credit_debit := GREATEST(0, public.compute_ai_usage_credit_cost(NEW.category, NEW.model, NEW.input_tokens, NEW.output_tokens));

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

WITH usage_by_conversation AS (
    SELECT
        organization_id,
        (metadata->>'conversation_id')::UUID AS conversation_id,
        SUM(GREATEST(input_tokens, 0))::BIGINT AS input_tokens_total,
        SUM(GREATEST(output_tokens, 0))::BIGINT AS output_tokens_total,
        SUM(GREATEST(total_tokens, 0))::BIGINT AS total_tokens_total,
        COUNT(*)::INTEGER AS usage_count,
        SUM(GREATEST(public.compute_ai_usage_credit_cost(category, model, input_tokens, output_tokens), 0))::NUMERIC(14, 1) AS total_credits
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
