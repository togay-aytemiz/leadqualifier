-- Aggregate platform-admin dashboard totals in a single DB-side query.
-- Prevents loading full organization summaries just to render top-level stat cards.

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_totals()
RETURNS TABLE (
    organization_count BIGINT,
    user_count BIGINT,
    skill_count BIGINT,
    knowledge_document_count BIGINT,
    message_count BIGINT,
    total_token_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT is_system_admin_secure() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM public.organizations)::BIGINT,
        (SELECT COUNT(*) FROM public.profiles)::BIGINT,
        (SELECT COUNT(*) FROM public.skills)::BIGINT,
        (SELECT COUNT(*) FROM public.knowledge_documents)::BIGINT,
        (SELECT COUNT(*) FROM public.messages)::BIGINT,
        (SELECT COALESCE(SUM(total_tokens), 0) FROM public.organization_ai_usage)::BIGINT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_totals() TO authenticated;
