-- Subscription-first billing foundation
-- Policy: trial -> recurring premium package -> top-up overflow
-- Top-up is not available during trial.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'billing_membership_state'
    ) THEN
        CREATE TYPE public.billing_membership_state AS ENUM (
            'trial_active',
            'trial_exhausted',
            'premium_active',
            'past_due',
            'canceled',
            'admin_locked'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'billing_lock_reason'
    ) THEN
        CREATE TYPE public.billing_lock_reason AS ENUM (
            'none',
            'trial_time_expired',
            'trial_credits_exhausted',
            'subscription_required',
            'package_credits_exhausted',
            'past_due',
            'admin_locked'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'billing_credit_ledger_type'
    ) THEN
        CREATE TYPE public.billing_credit_ledger_type AS ENUM (
            'trial_grant',
            'package_grant',
            'usage_debit',
            'purchase_credit',
            'adjustment',
            'refund',
            'reversal'
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'billing_credit_pool_type'
    ) THEN
        CREATE TYPE public.billing_credit_pool_type AS ENUM (
            'trial_pool',
            'package_pool',
            'topup_pool',
            'mixed'
        );
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.platform_billing_settings (
    key TEXT PRIMARY KEY DEFAULT 'default' CHECK (key = 'default'),
    default_trial_days INT NOT NULL DEFAULT 14 CHECK (default_trial_days > 0),
    default_trial_credits NUMERIC(14, 1) NOT NULL DEFAULT 120.0 CHECK (default_trial_credits >= 0),
    default_package_price_try NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (default_package_price_try >= 0),
    default_package_credits NUMERIC(14, 1) NOT NULL DEFAULT 0 CHECK (default_package_credits >= 0),
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_package_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monthly_price_try NUMERIC(14, 2) NOT NULL CHECK (monthly_price_try >= 0),
    monthly_credits NUMERIC(14, 1) NOT NULL CHECK (monthly_credits >= 0),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT billing_package_versions_effective_window_chk CHECK (
        effective_to IS NULL OR effective_to > effective_from
    )
);

CREATE INDEX IF NOT EXISTS billing_package_versions_effective_idx
    ON public.billing_package_versions (effective_from DESC, effective_to DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.organization_billing_accounts (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    membership_state public.billing_membership_state NOT NULL DEFAULT 'trial_active',
    lock_reason public.billing_lock_reason NOT NULL DEFAULT 'none',
    trial_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    trial_ends_at TIMESTAMPTZ NOT NULL,
    trial_credit_limit NUMERIC(14, 1) NOT NULL CHECK (trial_credit_limit >= 0),
    trial_credit_used NUMERIC(14, 1) NOT NULL DEFAULT 0 CHECK (trial_credit_used >= 0),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    monthly_package_credit_limit NUMERIC(14, 1) NOT NULL DEFAULT 0 CHECK (monthly_package_credit_limit >= 0),
    monthly_package_credit_used NUMERIC(14, 1) NOT NULL DEFAULT 0 CHECK (monthly_package_credit_used >= 0),
    topup_credit_balance NUMERIC(14, 1) NOT NULL DEFAULT 0 CHECK (topup_credit_balance >= 0),
    premium_assigned_at TIMESTAMPTZ,
    last_manual_action_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_billing_accounts_state_idx
    ON public.organization_billing_accounts (membership_state, lock_reason, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.organization_subscription_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_subscription_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'past_due', 'canceled', 'incomplete')),
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_subscription_records_provider_subscription_id_uidx
    ON public.organization_subscription_records (provider_subscription_id)
    WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS organization_subscription_records_org_idx
    ON public.organization_subscription_records (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.credit_purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_checkout_id TEXT,
    provider_payment_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'canceled', 'expired', 'refunded')),
    credits NUMERIC(14, 1) NOT NULL CHECK (credits >= 0),
    amount_try NUMERIC(14, 2) NOT NULL CHECK (amount_try >= 0),
    currency TEXT NOT NULL DEFAULT 'TRY',
    paid_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_purchase_orders_provider_checkout_id_uidx
    ON public.credit_purchase_orders (provider_checkout_id)
    WHERE provider_checkout_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS credit_purchase_orders_provider_payment_id_uidx
    ON public.credit_purchase_orders (provider_payment_id)
    WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_purchase_orders_org_idx
    ON public.credit_purchase_orders (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.organization_credit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    entry_type public.billing_credit_ledger_type NOT NULL,
    credit_pool public.billing_credit_pool_type NOT NULL,
    credits_delta NUMERIC(14, 1) NOT NULL,
    balance_after NUMERIC(14, 1) NOT NULL,
    usage_id UUID REFERENCES public.organization_ai_usage(id) ON DELETE SET NULL,
    performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_credit_ledger_org_idx
    ON public.organization_credit_ledger (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS organization_credit_ledger_usage_idx
    ON public.organization_credit_ledger (usage_id)
    WHERE usage_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.billing_admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL CHECK (
        action_type IN (
            'extend_trial',
            'credit_adjustment',
            'premium_assign',
            'premium_cancel',
            'package_config_update'
        )
    ),
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_admin_audit_log_org_idx
    ON public.billing_admin_audit_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS billing_admin_audit_log_actor_idx
    ON public.billing_admin_audit_log (actor_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.compute_credit_cost(
    input_tokens INT,
    output_tokens INT
)
RETURNS NUMERIC(14, 1)
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN (GREATEST(input_tokens, 0) + (GREATEST(output_tokens, 0) * 4)) <= 0 THEN 0.0
        ELSE CEIL((((GREATEST(input_tokens, 0) + (GREATEST(output_tokens, 0) * 4))::NUMERIC) / 3000.0) * 10) / 10.0
    END::NUMERIC(14, 1)
$$;

CREATE OR REPLACE FUNCTION public.initialize_org_billing_account(
    target_organization_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    defaults_row public.platform_billing_settings%ROWTYPE;
BEGIN
    INSERT INTO public.platform_billing_settings (key)
    VALUES ('default')
    ON CONFLICT (key) DO NOTHING;

    SELECT *
    INTO defaults_row
    FROM public.platform_billing_settings
    WHERE key = 'default'
    LIMIT 1;

    IF defaults_row.key IS NULL THEN
        RAISE EXCEPTION 'Missing platform billing defaults';
    END IF;

    INSERT INTO public.organization_billing_accounts (
        organization_id,
        membership_state,
        lock_reason,
        trial_started_at,
        trial_ends_at,
        trial_credit_limit,
        trial_credit_used,
        monthly_package_credit_limit,
        monthly_package_credit_used,
        topup_credit_balance
    )
    VALUES (
        target_organization_id,
        'trial_active',
        'none',
        now(),
        now() + (defaults_row.default_trial_days * interval '1 day'),
        defaults_row.default_trial_credits,
        0,
        defaults_row.default_package_credits,
        0,
        0
    )
    ON CONFLICT (organization_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_org_entitlement(
    target_organization_id UUID
)
RETURNS TABLE (
    is_usage_allowed BOOLEAN,
    is_topup_allowed BOOLEAN,
    membership_state public.billing_membership_state,
    lock_reason public.billing_lock_reason,
    remaining_trial_credits NUMERIC(14, 1),
    remaining_package_credits NUMERIC(14, 1),
    topup_credit_balance NUMERIC(14, 1),
    trial_ends_at TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    account_row public.organization_billing_accounts%ROWTYPE;
    remaining_trial NUMERIC(14, 1);
    remaining_package NUMERIC(14, 1);
BEGIN
    SELECT *
    INTO account_row
    FROM public.organization_billing_accounts
    WHERE organization_id = target_organization_id
    LIMIT 1;

    IF account_row.organization_id IS NULL THEN
        PERFORM public.initialize_org_billing_account(target_organization_id);

        SELECT *
        INTO account_row
        FROM public.organization_billing_accounts
        WHERE organization_id = target_organization_id
        LIMIT 1;
    END IF;

    remaining_trial := GREATEST(0, COALESCE(account_row.trial_credit_limit, 0) - COALESCE(account_row.trial_credit_used, 0));
    remaining_package := GREATEST(0, COALESCE(account_row.monthly_package_credit_limit, 0) - COALESCE(account_row.monthly_package_credit_used, 0));

    RETURN QUERY
    SELECT
        CASE
            WHEN account_row.membership_state IN ('admin_locked', 'past_due', 'canceled') THEN FALSE
            WHEN account_row.membership_state = 'trial_active' THEN now() <= account_row.trial_ends_at AND remaining_trial > 0
            WHEN account_row.membership_state = 'premium_active' THEN remaining_package > 0 OR COALESCE(account_row.topup_credit_balance, 0) > 0
            ELSE FALSE
        END AS is_usage_allowed,
        CASE
            WHEN account_row.membership_state = 'premium_active' AND remaining_package <= 0 THEN TRUE
            ELSE FALSE
        END AS is_topup_allowed,
        account_row.membership_state,
        CASE
            WHEN account_row.membership_state = 'trial_active' AND now() > account_row.trial_ends_at THEN 'trial_time_expired'::public.billing_lock_reason
            WHEN account_row.membership_state = 'trial_active' AND remaining_trial <= 0 THEN 'trial_credits_exhausted'::public.billing_lock_reason
            WHEN account_row.membership_state = 'premium_active' AND remaining_package <= 0 AND COALESCE(account_row.topup_credit_balance, 0) <= 0 THEN 'package_credits_exhausted'::public.billing_lock_reason
            ELSE account_row.lock_reason
        END AS lock_reason,
        remaining_trial,
        remaining_package,
        COALESCE(account_row.topup_credit_balance, 0),
        account_row.trial_ends_at,
        account_row.current_period_end;
END;
$$;

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
    debit := public.compute_credit_cost(NEW.input_tokens, NEW.output_tokens);
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
            'usage_debit',
            'trial_pool',
            -debit,
            total_balance_after,
            NEW.id,
            'AI usage debit',
            jsonb_build_object(
                'category', NEW.category,
                'model', NEW.model
            )
        );

        RETURN NEW;
    END IF;

    IF account_row.membership_state = 'premium_active' THEN
        remaining_package := GREATEST(0, account_row.monthly_package_credit_limit - account_row.monthly_package_credit_used);
        package_debit := LEAST(remaining_package, debit);
        topup_debit := GREATEST(0, debit - package_debit);

        IF package_debit > 0 THEN
            account_row.monthly_package_credit_used := account_row.monthly_package_credit_used + package_debit;
        END IF;

        IF topup_debit > 0 THEN
            account_row.topup_credit_balance := GREATEST(0, account_row.topup_credit_balance - topup_debit);
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
            'usage_debit',
            CASE
                WHEN package_debit > 0 AND topup_debit > 0 THEN 'mixed'
                WHEN topup_debit > 0 THEN 'topup_pool'
                ELSE 'package_pool'
            END,
            -debit,
            total_balance_after,
            NEW.id,
            'AI usage debit',
            jsonb_build_object(
                'category', NEW.category,
                'model', NEW.model,
                'package_debit', package_debit,
                'topup_debit', topup_debit
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_billing_admin_audit(
    target_organization_id UUID,
    target_action_type TEXT,
    target_reason TEXT,
    target_before_state JSONB,
    target_after_state JSONB,
    target_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor UUID;
BEGIN
    actor := auth.uid();
    IF actor IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT is_system_admin_secure() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    INSERT INTO public.billing_admin_audit_log (
        organization_id,
        action_type,
        actor_id,
        reason,
        before_state,
        after_state,
        metadata
    )
    VALUES (
        target_organization_id,
        target_action_type,
        actor,
        target_reason,
        COALESCE(target_before_state, '{}'::jsonb),
        COALESCE(target_after_state, '{}'::jsonb),
        COALESCE(target_metadata, '{}'::jsonb)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_extend_trial(
    target_organization_id UUID,
    new_trial_ends_at TIMESTAMPTZ,
    action_reason TEXT
)
RETURNS public.organization_billing_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    before_row public.organization_billing_accounts%ROWTYPE;
    updated_row public.organization_billing_accounts%ROWTYPE;
BEGIN
    IF trim(COALESCE(action_reason, '')) = '' THEN
        RAISE EXCEPTION 'Reason is required';
    END IF;

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT is_system_admin_secure() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT *
    INTO before_row
    FROM public.organization_billing_accounts
    WHERE organization_id = target_organization_id
    FOR UPDATE;

    IF before_row.organization_id IS NULL THEN
        RAISE EXCEPTION 'Billing account not found';
    END IF;

    UPDATE public.organization_billing_accounts
    SET
        trial_ends_at = new_trial_ends_at,
        membership_state = CASE
            WHEN before_row.membership_state = 'trial_exhausted' AND new_trial_ends_at > now() AND before_row.trial_credit_used < before_row.trial_credit_limit
                THEN 'trial_active'
            ELSE before_row.membership_state
        END,
        lock_reason = CASE
            WHEN before_row.membership_state = 'trial_exhausted' AND new_trial_ends_at > now() AND before_row.trial_credit_used < before_row.trial_credit_limit
                THEN 'none'
            ELSE before_row.lock_reason
        END,
        last_manual_action_at = now(),
        updated_at = now()
    WHERE organization_id = target_organization_id
    RETURNING * INTO updated_row;

    PERFORM public.log_billing_admin_audit(
        target_organization_id,
        'extend_trial',
        action_reason,
        to_jsonb(before_row),
        to_jsonb(updated_row)
    );

    RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_topup_credits(
    target_organization_id UUID,
    credit_delta NUMERIC(14, 1),
    action_reason TEXT
)
RETURNS public.organization_billing_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    before_row public.organization_billing_accounts%ROWTYPE;
    updated_row public.organization_billing_accounts%ROWTYPE;
    next_balance NUMERIC(14, 1);
BEGIN
    IF trim(COALESCE(action_reason, '')) = '' THEN
        RAISE EXCEPTION 'Reason is required';
    END IF;

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT is_system_admin_secure() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT *
    INTO before_row
    FROM public.organization_billing_accounts
    WHERE organization_id = target_organization_id
    FOR UPDATE;

    IF before_row.organization_id IS NULL THEN
        RAISE EXCEPTION 'Billing account not found';
    END IF;

    next_balance := GREATEST(0, before_row.topup_credit_balance + COALESCE(credit_delta, 0));

    UPDATE public.organization_billing_accounts
    SET
        topup_credit_balance = next_balance,
        lock_reason = CASE
            WHEN membership_state = 'premium_active'
                AND next_balance > 0
                AND GREATEST(0, monthly_package_credit_limit - monthly_package_credit_used) <= 0
                THEN 'none'
            ELSE lock_reason
        END,
        last_manual_action_at = now(),
        updated_at = now()
    WHERE organization_id = target_organization_id
    RETURNING * INTO updated_row;

    INSERT INTO public.organization_credit_ledger (
        organization_id,
        entry_type,
        credit_pool,
        credits_delta,
        balance_after,
        performed_by,
        reason,
        metadata
    )
    VALUES (
        target_organization_id,
        'adjustment',
        'topup_pool',
        COALESCE(credit_delta, 0),
        next_balance,
        auth.uid(),
        action_reason,
        jsonb_build_object('source', 'admin_adjust_topup_credits')
    );

    PERFORM public.log_billing_admin_audit(
        target_organization_id,
        'credit_adjustment',
        action_reason,
        to_jsonb(before_row),
        to_jsonb(updated_row),
        jsonb_build_object('credit_delta', COALESCE(credit_delta, 0))
    );

    RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_premium(
    target_organization_id UUID,
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    monthly_price_try NUMERIC(14, 2),
    monthly_credits NUMERIC(14, 1),
    action_reason TEXT
)
RETURNS public.organization_billing_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    before_row public.organization_billing_accounts%ROWTYPE;
    updated_row public.organization_billing_accounts%ROWTYPE;
BEGIN
    IF trim(COALESCE(action_reason, '')) = '' THEN
        RAISE EXCEPTION 'Reason is required';
    END IF;

    IF period_end <= period_start THEN
        RAISE EXCEPTION 'period_end must be greater than period_start';
    END IF;

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT is_system_admin_secure() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT *
    INTO before_row
    FROM public.organization_billing_accounts
    WHERE organization_id = target_organization_id
    FOR UPDATE;

    IF before_row.organization_id IS NULL THEN
        RAISE EXCEPTION 'Billing account not found';
    END IF;

    UPDATE public.organization_billing_accounts
    SET
        membership_state = 'premium_active',
        lock_reason = 'none',
        current_period_start = period_start,
        current_period_end = period_end,
        monthly_package_credit_limit = GREATEST(0, monthly_credits),
        monthly_package_credit_used = 0,
        premium_assigned_at = now(),
        last_manual_action_at = now(),
        updated_at = now()
    WHERE organization_id = target_organization_id
    RETURNING * INTO updated_row;

    INSERT INTO public.organization_subscription_records (
        organization_id,
        provider,
        provider_subscription_id,
        status,
        period_start,
        period_end,
        metadata
    )
    VALUES (
        target_organization_id,
        'manual_admin',
        gen_random_uuid()::text,
        'active',
        period_start,
        period_end,
        jsonb_build_object(
            'monthly_price_try', GREATEST(0, monthly_price_try),
            'monthly_credits', GREATEST(0, monthly_credits)
        )
    );

    INSERT INTO public.organization_credit_ledger (
        organization_id,
        entry_type,
        credit_pool,
        credits_delta,
        balance_after,
        performed_by,
        reason,
        metadata
    )
    VALUES (
        target_organization_id,
        'package_grant',
        'package_pool',
        GREATEST(0, monthly_credits),
        GREATEST(0, monthly_credits) + COALESCE(updated_row.topup_credit_balance, 0),
        auth.uid(),
        action_reason,
        jsonb_build_object('source', 'admin_assign_premium')
    );

    PERFORM public.log_billing_admin_audit(
        target_organization_id,
        'premium_assign',
        action_reason,
        to_jsonb(before_row),
        to_jsonb(updated_row),
        jsonb_build_object(
            'monthly_price_try', GREATEST(0, monthly_price_try),
            'monthly_credits', GREATEST(0, monthly_credits),
            'period_start', period_start,
            'period_end', period_end
        )
    );

    RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_premium(
    target_organization_id UUID,
    action_reason TEXT
)
RETURNS public.organization_billing_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    before_row public.organization_billing_accounts%ROWTYPE;
    updated_row public.organization_billing_accounts%ROWTYPE;
BEGIN
    IF trim(COALESCE(action_reason, '')) = '' THEN
        RAISE EXCEPTION 'Reason is required';
    END IF;

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT is_system_admin_secure() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT *
    INTO before_row
    FROM public.organization_billing_accounts
    WHERE organization_id = target_organization_id
    FOR UPDATE;

    IF before_row.organization_id IS NULL THEN
        RAISE EXCEPTION 'Billing account not found';
    END IF;

    UPDATE public.organization_billing_accounts
    SET
        membership_state = 'canceled',
        lock_reason = 'subscription_required',
        current_period_end = now(),
        last_manual_action_at = now(),
        updated_at = now()
    WHERE organization_id = target_organization_id
    RETURNING * INTO updated_row;

    INSERT INTO public.organization_subscription_records (
        organization_id,
        provider,
        provider_subscription_id,
        status,
        period_start,
        period_end,
        canceled_at,
        metadata
    )
    VALUES (
        target_organization_id,
        'manual_admin',
        gen_random_uuid()::text,
        'canceled',
        before_row.current_period_start,
        now(),
        now(),
        jsonb_build_object('source', 'admin_cancel_premium')
    );

    PERFORM public.log_billing_admin_audit(
        target_organization_id,
        'premium_cancel',
        action_reason,
        to_jsonb(before_row),
        to_jsonb(updated_row)
    );

    RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_org_billing_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.initialize_org_billing_account(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_organization_created_billing_account ON public.organizations;
CREATE TRIGGER on_organization_created_billing_account
    AFTER INSERT ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_org_billing_account();

CREATE TRIGGER update_platform_billing_settings_updated_at
    BEFORE UPDATE ON public.platform_billing_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_billing_accounts_updated_at
    BEFORE UPDATE ON public.organization_billing_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_organization_subscription_records_updated_at
    BEFORE UPDATE ON public.organization_subscription_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_purchase_orders_updated_at
    BEFORE UPDATE ON public.credit_purchase_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS on_ai_usage_recorded_debit_credits ON public.organization_ai_usage;
CREATE TRIGGER on_ai_usage_recorded_debit_credits
    AFTER INSERT ON public.organization_ai_usage
    FOR EACH ROW EXECUTE FUNCTION public.handle_ai_usage_credit_debit();

ALTER TABLE public.platform_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_package_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscription_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view platform billing settings" ON public.platform_billing_settings;
CREATE POLICY "Users can view platform billing settings"
    ON public.platform_billing_settings FOR SELECT
    USING (is_system_admin_secure());

DROP POLICY IF EXISTS "System admins can manage platform billing settings" ON public.platform_billing_settings;
CREATE POLICY "System admins can manage platform billing settings"
    ON public.platform_billing_settings FOR ALL
    USING (is_system_admin_secure());

DROP POLICY IF EXISTS "Users can view billing package versions" ON public.billing_package_versions;
CREATE POLICY "Users can view billing package versions"
    ON public.billing_package_versions FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            is_system_admin_secure()
            OR EXISTS (
                SELECT 1
                FROM public.organization_members om
                WHERE om.user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "System admins can manage billing package versions" ON public.billing_package_versions;
CREATE POLICY "System admins can manage billing package versions"
    ON public.billing_package_versions FOR ALL
    USING (is_system_admin_secure());

DROP POLICY IF EXISTS "Users can view org billing accounts" ON public.organization_billing_accounts;
CREATE POLICY "Users can view org billing accounts"
    ON public.organization_billing_accounts FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

DROP POLICY IF EXISTS "System admins can manage org billing accounts" ON public.organization_billing_accounts;
CREATE POLICY "System admins can manage org billing accounts"
    ON public.organization_billing_accounts FOR ALL
    USING (is_system_admin_secure());

DROP POLICY IF EXISTS "Users can view org credit ledger" ON public.organization_credit_ledger;
CREATE POLICY "Users can view org credit ledger"
    ON public.organization_credit_ledger FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

DROP POLICY IF EXISTS "System admins can manage org credit ledger" ON public.organization_credit_ledger;
CREATE POLICY "System admins can manage org credit ledger"
    ON public.organization_credit_ledger FOR ALL
    USING (is_system_admin_secure());

DROP POLICY IF EXISTS "Users can view org subscription records" ON public.organization_subscription_records;
CREATE POLICY "Users can view org subscription records"
    ON public.organization_subscription_records FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

DROP POLICY IF EXISTS "System admins can manage org subscription records" ON public.organization_subscription_records;
CREATE POLICY "System admins can manage org subscription records"
    ON public.organization_subscription_records FOR ALL
    USING (is_system_admin_secure());

DROP POLICY IF EXISTS "Users can view org credit purchase orders" ON public.credit_purchase_orders;
CREATE POLICY "Users can view org credit purchase orders"
    ON public.credit_purchase_orders FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

DROP POLICY IF EXISTS "System admins can manage org credit purchase orders" ON public.credit_purchase_orders;
CREATE POLICY "System admins can manage org credit purchase orders"
    ON public.credit_purchase_orders FOR ALL
    USING (is_system_admin_secure());

DROP POLICY IF EXISTS "System admins can view billing admin audit" ON public.billing_admin_audit_log;
CREATE POLICY "System admins can view billing admin audit"
    ON public.billing_admin_audit_log FOR SELECT
    USING (is_system_admin_secure());

DROP POLICY IF EXISTS "System admins can insert billing admin audit" ON public.billing_admin_audit_log;
CREATE POLICY "System admins can insert billing admin audit"
    ON public.billing_admin_audit_log FOR INSERT
    WITH CHECK (is_system_admin_secure());

INSERT INTO public.platform_billing_settings (key)
VALUES ('default')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.billing_package_versions (
    monthly_price_try,
    monthly_credits,
    effective_from,
    created_by
)
SELECT
    settings.default_package_price_try,
    settings.default_package_credits,
    now(),
    NULL
FROM public.platform_billing_settings settings
WHERE settings.key = 'default'
AND NOT EXISTS (
    SELECT 1 FROM public.billing_package_versions
);

SELECT public.initialize_org_billing_account(organizations.id)
FROM public.organizations;

GRANT EXECUTE ON FUNCTION public.compute_credit_cost(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_org_entitlement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_extend_trial(UUID, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_topup_credits(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_premium(UUID, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_premium(UUID, TEXT) TO authenticated;
