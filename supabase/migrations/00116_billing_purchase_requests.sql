-- Lightweight sales-led billing purchase requests.
-- Operators can request plan/top-up purchases; admins handle payment and entitlement manually.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'billing_purchase_request_type'
    ) THEN
        CREATE TYPE public.billing_purchase_request_type AS ENUM (
            'plan',
            'plan_change',
            'topup',
            'custom'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'billing_purchase_request_status'
    ) THEN
        CREATE TYPE public.billing_purchase_request_status AS ENUM (
            'new',
            'seen',
            'handled',
            'dismissed'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'billing_purchase_request_email_status'
    ) THEN
        CREATE TYPE public.billing_purchase_request_email_status AS ENUM (
            'not_configured',
            'sent',
            'failed'
        );
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.billing_purchase_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    request_type public.billing_purchase_request_type NOT NULL,
    requested_plan_id TEXT CHECK (
        requested_plan_id IS NULL OR requested_plan_id IN ('starter', 'growth', 'scale')
    ),
    requested_topup_pack_id TEXT CHECK (
        requested_topup_pack_id IS NULL OR requested_topup_pack_id IN ('topup_250', 'topup_500', 'topup_1000')
    ),
    requested_credits NUMERIC(14, 1) CHECK (requested_credits IS NULL OR requested_credits >= 0),
    requested_amount NUMERIC(14, 2) CHECK (requested_amount IS NULL OR requested_amount >= 0),
    requested_currency TEXT CHECK (
        requested_currency IS NULL OR requested_currency IN ('TRY', 'USD')
    ),
    status public.billing_purchase_request_status NOT NULL DEFAULT 'new',
    email_status public.billing_purchase_request_email_status NOT NULL DEFAULT 'not_configured',
    email_error TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT billing_purchase_requests_plan_shape_chk CHECK (
        (request_type IN ('plan', 'plan_change') AND requested_plan_id IS NOT NULL AND requested_topup_pack_id IS NULL)
        OR (request_type = 'topup' AND requested_topup_pack_id IS NOT NULL AND requested_plan_id IS NULL)
        OR (request_type = 'custom')
    )
);

CREATE INDEX IF NOT EXISTS billing_purchase_requests_org_created_idx
    ON public.billing_purchase_requests (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS billing_purchase_requests_status_created_idx
    ON public.billing_purchase_requests (status, created_at DESC);

ALTER TABLE public.billing_purchase_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_purchase_requests_member_insert ON public.billing_purchase_requests;
CREATE POLICY billing_purchase_requests_member_insert
    ON public.billing_purchase_requests
    FOR INSERT
    WITH CHECK (
        auth.uid() = requested_by
        AND EXISTS (
            SELECT 1
            FROM public.organization_members om
            WHERE om.organization_id = billing_purchase_requests.organization_id
              AND om.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS billing_purchase_requests_member_select ON public.billing_purchase_requests;
CREATE POLICY billing_purchase_requests_member_select
    ON public.billing_purchase_requests
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.organization_members om
            WHERE om.organization_id = billing_purchase_requests.organization_id
              AND om.user_id = auth.uid()
        )
        OR public.is_system_admin_secure()
    );

DROP POLICY IF EXISTS billing_purchase_requests_admin_update ON public.billing_purchase_requests;
CREATE POLICY billing_purchase_requests_admin_update
    ON public.billing_purchase_requests
    FOR UPDATE
    USING (public.is_system_admin_secure())
    WITH CHECK (public.is_system_admin_secure());
