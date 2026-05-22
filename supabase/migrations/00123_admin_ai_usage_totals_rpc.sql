-- Aggregate admin dashboard AI usage metrics inside Postgres.
-- This avoids paging every organization_ai_usage row through the dashboard read model.

CREATE OR REPLACE FUNCTION public.get_admin_ai_usage_totals(
    target_organization_ids UUID[] DEFAULT NULL,
    range_start TIMESTAMPTZ DEFAULT NULL,
    range_end TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    total_token_count BIGINT,
    input_token_count BIGINT,
    output_token_count BIGINT,
    embedding_token_count BIGINT,
    weighted_chat_token_count BIGINT,
    total_credit_usage NUMERIC(14, 1)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    allowed_ids UUID[];
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF is_system_admin_secure() THEN
        IF target_organization_ids IS NULL OR array_length(target_organization_ids, 1) IS NULL THEN
            SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
            INTO allowed_ids
            FROM public.organizations;
        ELSE
            SELECT COALESCE(array_agg(DISTINCT requested_id), ARRAY[]::UUID[])
            INTO allowed_ids
            FROM unnest(target_organization_ids) AS requested_id
            WHERE requested_id IS NOT NULL;
        END IF;
    ELSE
        IF target_organization_ids IS NULL OR array_length(target_organization_ids, 1) IS NULL THEN
            SELECT COALESCE(array_agg(org_id), ARRAY[]::UUID[])
            INTO allowed_ids
            FROM unnest(get_user_organizations(auth.uid())) AS org_id;
        ELSE
            SELECT COALESCE(array_agg(requested_id), ARRAY[]::UUID[])
            INTO allowed_ids
            FROM unnest(target_organization_ids) AS requested_id
            WHERE requested_id = ANY(get_user_organizations(auth.uid()));
        END IF;
    END IF;

    IF allowed_ids IS NULL THEN
        allowed_ids := ARRAY[]::UUID[];
    END IF;

    RETURN QUERY
    SELECT
        COALESCE(SUM(GREATEST(COALESCE(usage_rows.total_tokens, 0), 0)), 0)::BIGINT AS total_token_count,
        COALESCE(SUM(GREATEST(COALESCE(usage_rows.input_tokens, 0), 0)), 0)::BIGINT AS input_token_count,
        COALESCE(SUM(GREATEST(COALESCE(usage_rows.output_tokens, 0), 0)), 0)::BIGINT AS output_token_count,
        COALESCE(SUM(
            CASE
                WHEN lower(btrim(COALESCE(usage_rows.category, ''))) = 'embedding'
                    THEN GREATEST(COALESCE(usage_rows.input_tokens, 0), 0)
                ELSE 0
            END
        ), 0)::BIGINT AS embedding_token_count,
        COALESCE(SUM(
            CASE
                WHEN lower(btrim(COALESCE(usage_rows.category, ''))) = 'embedding'
                    THEN 0
                ELSE GREATEST(COALESCE(usage_rows.input_tokens, 0), 0)
                    + (GREATEST(COALESCE(usage_rows.output_tokens, 0), 0) * 4)
            END
        ), 0)::BIGINT AS weighted_chat_token_count,
        COALESCE(SUM(public.compute_ai_usage_credit_cost(
            usage_rows.category,
            usage_rows.model,
            usage_rows.input_tokens,
            usage_rows.output_tokens
        )), 0)::NUMERIC(14, 1) AS total_credit_usage
    FROM public.organization_ai_usage AS usage_rows
    WHERE usage_rows.organization_id = ANY(allowed_ids)
        AND (range_start IS NULL OR usage_rows.created_at >= range_start)
        AND (range_end IS NULL OR usage_rows.created_at < range_end);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_ai_usage_totals(UUID[], TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
