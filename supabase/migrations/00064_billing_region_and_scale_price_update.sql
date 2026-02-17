-- Add organization-level billing region and align scale baseline price.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_region TEXT NOT NULL DEFAULT 'TR'
  CHECK (billing_region IN ('TR', 'INTL'));

ALTER TABLE public.platform_billing_settings
  ALTER COLUMN scale_plan_price_try SET DEFAULT 949;

UPDATE public.platform_billing_settings
SET
  scale_plan_price_try = 949,
  updated_at = NOW()
WHERE key = 'default';
