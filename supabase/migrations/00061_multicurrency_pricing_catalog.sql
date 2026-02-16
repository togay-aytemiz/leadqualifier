-- Multi-currency pricing catalog fields (TRY + USD) for plans/top-ups
-- and initial pricing v1 defaults.

ALTER TABLE public.platform_billing_settings
    ADD COLUMN IF NOT EXISTS default_package_price_usd NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (default_package_price_usd >= 0),
    ADD COLUMN IF NOT EXISTS starter_plan_credits NUMERIC(14, 1) NOT NULL DEFAULT 1000 CHECK (starter_plan_credits >= 0),
    ADD COLUMN IF NOT EXISTS starter_plan_price_try NUMERIC(14, 2) NOT NULL DEFAULT 349 CHECK (starter_plan_price_try >= 0),
    ADD COLUMN IF NOT EXISTS starter_plan_price_usd NUMERIC(14, 2) NOT NULL DEFAULT 9.99 CHECK (starter_plan_price_usd >= 0),
    ADD COLUMN IF NOT EXISTS growth_plan_credits NUMERIC(14, 1) NOT NULL DEFAULT 2000 CHECK (growth_plan_credits >= 0),
    ADD COLUMN IF NOT EXISTS growth_plan_price_try NUMERIC(14, 2) NOT NULL DEFAULT 649 CHECK (growth_plan_price_try >= 0),
    ADD COLUMN IF NOT EXISTS growth_plan_price_usd NUMERIC(14, 2) NOT NULL DEFAULT 17.99 CHECK (growth_plan_price_usd >= 0),
    ADD COLUMN IF NOT EXISTS scale_plan_credits NUMERIC(14, 1) NOT NULL DEFAULT 4000 CHECK (scale_plan_credits >= 0),
    ADD COLUMN IF NOT EXISTS scale_plan_price_try NUMERIC(14, 2) NOT NULL DEFAULT 999 CHECK (scale_plan_price_try >= 0),
    ADD COLUMN IF NOT EXISTS scale_plan_price_usd NUMERIC(14, 2) NOT NULL DEFAULT 26.99 CHECK (scale_plan_price_usd >= 0),
    ADD COLUMN IF NOT EXISTS topup_250_price_try NUMERIC(14, 2) NOT NULL DEFAULT 99 CHECK (topup_250_price_try >= 0),
    ADD COLUMN IF NOT EXISTS topup_250_price_usd NUMERIC(14, 2) NOT NULL DEFAULT 2.99 CHECK (topup_250_price_usd >= 0),
    ADD COLUMN IF NOT EXISTS topup_500_price_try NUMERIC(14, 2) NOT NULL DEFAULT 189 CHECK (topup_500_price_try >= 0),
    ADD COLUMN IF NOT EXISTS topup_500_price_usd NUMERIC(14, 2) NOT NULL DEFAULT 5.49 CHECK (topup_500_price_usd >= 0),
    ADD COLUMN IF NOT EXISTS topup_1000_price_try NUMERIC(14, 2) NOT NULL DEFAULT 349 CHECK (topup_1000_price_try >= 0),
    ADD COLUMN IF NOT EXISTS topup_1000_price_usd NUMERIC(14, 2) NOT NULL DEFAULT 9.99 CHECK (topup_1000_price_usd >= 0);

INSERT INTO public.platform_billing_settings (key)
VALUES ('default')
ON CONFLICT (key) DO NOTHING;

UPDATE public.platform_billing_settings
SET
    default_trial_days = 14,
    default_trial_credits = 200.0,
    default_package_price_try = 349,
    default_package_price_usd = 9.99,
    default_package_credits = 1000,
    starter_plan_credits = 1000,
    starter_plan_price_try = 349,
    starter_plan_price_usd = 9.99,
    growth_plan_credits = 2000,
    growth_plan_price_try = 649,
    growth_plan_price_usd = 17.99,
    scale_plan_credits = 4000,
    scale_plan_price_try = 999,
    scale_plan_price_usd = 26.99,
    topup_250_price_try = 99,
    topup_250_price_usd = 2.99,
    topup_500_price_try = 189,
    topup_500_price_usd = 5.49,
    topup_1000_price_try = 349,
    topup_1000_price_usd = 9.99,
    updated_at = now()
WHERE key = 'default';

INSERT INTO public.billing_package_versions (
    monthly_price_try,
    monthly_credits,
    effective_from,
    created_by
)
SELECT
    349,
    1000,
    now(),
    NULL
WHERE NOT EXISTS (
    SELECT 1
    FROM public.billing_package_versions
    WHERE monthly_price_try = 349
      AND monthly_credits = 1000
      AND effective_to IS NULL
);
