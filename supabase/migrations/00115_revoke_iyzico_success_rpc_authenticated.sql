-- Restrict Iyzico success webhooks to server-side service role callers only.

REVOKE EXECUTE ON FUNCTION public.apply_iyzico_subscription_renewal_success(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, NUMERIC, JSONB, TIMESTAMPTZ) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_iyzico_subscription_upgrade_checkout_success(UUID, TEXT, TEXT, JSONB, JSONB, TIMESTAMPTZ) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.apply_iyzico_subscription_renewal_success(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, NUMERIC, JSONB, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_iyzico_subscription_upgrade_checkout_success(UUID, TEXT, TEXT, JSONB, JSONB, TIMESTAMPTZ) TO service_role;
