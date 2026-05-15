-- Explicit Data API grants for Supabase's public-schema default-grant rollout.
-- RLS policies remain the tenant boundary; these grants only make PostgREST access explicit.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA public
    TO authenticated;

GRANT ALL PRIVILEGES
    ON ALL TABLES IN SCHEMA public
    TO service_role;

GRANT USAGE, SELECT
    ON ALL SEQUENCES IN SCHEMA public
    TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL PRIVILEGES ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

-- Keep unauthenticated table access closed. Signup guards are RPC-only entry points.
GRANT EXECUTE ON FUNCTION public.check_signup_trial_rate_limit(TEXT, TEXT, TEXT)
    TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_signup_trial_attempt(TEXT, TEXT, TEXT, BOOLEAN)
    TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_trial_business_identity(TEXT, TEXT, TEXT, TEXT)
    TO anon, authenticated;
