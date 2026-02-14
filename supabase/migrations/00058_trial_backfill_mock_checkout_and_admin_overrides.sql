-- Trial backfill for existing non-admin organizations
-- + Mock checkout helpers (success/failure simulation)
-- + Additional admin override helpers for full billing intervention

-- Backfill existing organizations that have at least one non-system-admin member into fresh trial mode.
WITH target_orgs AS (
    SELECT DISTINCT om.organization_id
    FROM public.organization_members om
    JOIN public.profiles p
        ON p.id = om.user_id
    WHERE COALESCE(p.is_system_admin, false) = false
)
SELECT public.initialize_org_billing_account(target_orgs.organization_id)
FROM target_orgs;

WITH target_orgs AS (
    SELECT DISTINCT om.organization_id
    FROM public.organization_members om
    JOIN public.profiles p
        ON p.id = om.user_id
    WHERE COALESCE(p.is_system_admin, false) = false
)
UPDATE public.organization_billing_accounts oba
SET
    membership_state = 'trial_active',
    lock_reason = 'none',
    trial_started_at = now(),
    trial_ends_at = now() + (settings.default_trial_days * interval '1 day'),
    trial_credit_limit = settings.default_trial_credits,
    trial_credit_used = 0,
    current_period_start = NULL,
    current_period_end = NULL,
    monthly_package_credit_limit = settings.default_package_credits,
    monthly_package_credit_used = 0,
    topup_credit_balance = 0,
    premium_assigned_at = NULL,
    last_manual_action_at = now(),
    updated_at = now()
FROM public.platform_billing_settings settings
WHERE settings.key = 'default'
AND oba.organization_id IN (SELECT organization_id FROM target_orgs);

CREATE OR REPLACE FUNCTION public.assert_org_member_or_admin(
    target_organization_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF is_system_admin_secure() THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.organization_members om
        WHERE om.organization_id = target_organization_id
          AND om.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_membership_override(
    target_organization_id UUID,
    new_membership_state public.billing_membership_state,
    new_lock_reason public.billing_lock_reason,
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
        membership_state = new_membership_state,
        lock_reason = new_lock_reason,
        last_manual_action_at = now(),
        updated_at = now()
    WHERE organization_id = target_organization_id
    RETURNING * INTO updated_row;

    PERFORM public.log_billing_admin_audit(
        target_organization_id,
        'package_config_update',
        action_reason,
        to_jsonb(before_row),
        to_jsonb(updated_row),
        jsonb_build_object(
            'source', 'admin_set_membership_override',
            'new_membership_state', new_membership_state,
            'new_lock_reason', new_lock_reason
        )
    );

    RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_trial_credits(
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
    next_trial_limit NUMERIC(14, 1);
    next_trial_used NUMERIC(14, 1);
    next_membership_state public.billing_membership_state;
    next_lock_reason public.billing_lock_reason;
    remaining_trial NUMERIC(14, 1);
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

    next_trial_limit := GREATEST(0, COALESCE(before_row.trial_credit_limit, 0) + COALESCE(credit_delta, 0));
    next_trial_used := LEAST(COALESCE(before_row.trial_credit_used, 0), next_trial_limit);
    next_membership_state := before_row.membership_state;
    next_lock_reason := before_row.lock_reason;

    IF before_row.membership_state IN ('trial_active', 'trial_exhausted') THEN
        remaining_trial := GREATEST(0, next_trial_limit - next_trial_used);

        IF now() > before_row.trial_ends_at THEN
            next_membership_state := 'trial_exhausted';
            next_lock_reason := 'trial_time_expired';
        ELSIF remaining_trial <= 0 THEN
            next_membership_state := 'trial_exhausted';
            next_lock_reason := 'trial_credits_exhausted';
        ELSE
            next_membership_state := 'trial_active';
            next_lock_reason := 'none';
        END IF;
    END IF;

    UPDATE public.organization_billing_accounts
    SET
        trial_credit_limit = next_trial_limit,
        trial_credit_used = next_trial_used,
        membership_state = next_membership_state,
        lock_reason = next_lock_reason,
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
        'trial_pool',
        COALESCE(credit_delta, 0),
        GREATEST(0, next_trial_limit - next_trial_used),
        auth.uid(),
        action_reason,
        jsonb_build_object('source', 'admin_adjust_trial_credits')
    );

    PERFORM public.log_billing_admin_audit(
        target_organization_id,
        'credit_adjustment',
        action_reason,
        to_jsonb(before_row),
        to_jsonb(updated_row),
        jsonb_build_object(
            'source', 'admin_adjust_trial_credits',
            'credit_delta', COALESCE(credit_delta, 0)
        )
    );

    RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_package_credits(
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
    next_package_limit NUMERIC(14, 1);
    next_package_used NUMERIC(14, 1);
    remaining_package NUMERIC(14, 1);
    next_lock_reason public.billing_lock_reason;
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

    next_package_limit := GREATEST(0, COALESCE(before_row.monthly_package_credit_limit, 0) + COALESCE(credit_delta, 0));
    next_package_used := LEAST(COALESCE(before_row.monthly_package_credit_used, 0), next_package_limit);
    remaining_package := GREATEST(0, next_package_limit - next_package_used);
    next_lock_reason := before_row.lock_reason;

    IF before_row.membership_state = 'premium_active' THEN
        IF remaining_package <= 0 AND COALESCE(before_row.topup_credit_balance, 0) <= 0 THEN
            next_lock_reason := 'package_credits_exhausted';
        ELSE
            next_lock_reason := 'none';
        END IF;
    END IF;

    UPDATE public.organization_billing_accounts
    SET
        monthly_package_credit_limit = next_package_limit,
        monthly_package_credit_used = next_package_used,
        lock_reason = next_lock_reason,
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
        'package_pool',
        COALESCE(credit_delta, 0),
        remaining_package + COALESCE(before_row.topup_credit_balance, 0),
        auth.uid(),
        action_reason,
        jsonb_build_object('source', 'admin_adjust_package_credits')
    );

    PERFORM public.log_billing_admin_audit(
        target_organization_id,
        'credit_adjustment',
        action_reason,
        to_jsonb(before_row),
        to_jsonb(updated_row),
        jsonb_build_object(
            'source', 'admin_adjust_package_credits',
            'credit_delta', COALESCE(credit_delta, 0)
        )
    );

    RETURN updated_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.mock_checkout_subscribe(
    target_organization_id UUID,
    requested_monthly_price_try NUMERIC(14, 2),
    requested_monthly_credits NUMERIC(14, 1),
    simulated_outcome TEXT DEFAULT 'success'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    account_row public.organization_billing_accounts%ROWTYPE;
    subscription_id UUID;
    period_start TIMESTAMPTZ;
    period_end TIMESTAMPTZ;
    monthly_credits_safe NUMERIC(14, 1);
BEGIN
    PERFORM public.assert_org_member_or_admin(target_organization_id);

    IF COALESCE(simulated_outcome, '') NOT IN ('success', 'failed') THEN
        RAISE EXCEPTION 'Invalid simulated outcome';
    END IF;

    monthly_credits_safe := GREATEST(0, COALESCE(requested_monthly_credits, 0));
    IF monthly_credits_safe <= 0 THEN
        RAISE EXCEPTION 'Monthly credits must be greater than zero';
    END IF;

    PERFORM public.initialize_org_billing_account(target_organization_id);

    SELECT *
    INTO account_row
    FROM public.organization_billing_accounts
    WHERE organization_id = target_organization_id
    FOR UPDATE;

    IF account_row.membership_state = 'admin_locked' THEN
        RETURN jsonb_build_object(
            'ok', false,
            'status', 'blocked',
            'reason', 'admin_locked'
        );
    END IF;

    IF simulated_outcome = 'failed' THEN
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
            'mock',
            'mock_sub_' || replace(gen_random_uuid()::text, '-', ''),
            'incomplete',
            now(),
            now() + interval '1 month',
            jsonb_build_object(
                'simulated_outcome', 'failed',
                'requested_monthly_price_try', GREATEST(0, COALESCE(requested_monthly_price_try, 0)),
                'requested_monthly_credits', monthly_credits_safe
            )
        )
        RETURNING id INTO subscription_id;

        RETURN jsonb_build_object(
            'ok', false,
            'status', 'failed',
            'subscription_id', subscription_id
        );
    END IF;

    period_start := now();
    period_end := period_start + interval '1 month';

    UPDATE public.organization_billing_accounts
    SET
        membership_state = 'premium_active',
        lock_reason = 'none',
        current_period_start = period_start,
        current_period_end = period_end,
        monthly_package_credit_limit = monthly_credits_safe,
        monthly_package_credit_used = 0,
        premium_assigned_at = COALESCE(account_row.premium_assigned_at, now()),
        updated_at = now()
    WHERE organization_id = target_organization_id
    RETURNING * INTO account_row;

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
        'mock',
        'mock_sub_' || replace(gen_random_uuid()::text, '-', ''),
        'active',
        period_start,
        period_end,
        jsonb_build_object(
            'simulated_outcome', 'success',
            'requested_monthly_price_try', GREATEST(0, COALESCE(requested_monthly_price_try, 0)),
            'requested_monthly_credits', monthly_credits_safe
        )
    )
    RETURNING id INTO subscription_id;

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
        monthly_credits_safe,
        monthly_credits_safe + COALESCE(account_row.topup_credit_balance, 0),
        auth.uid(),
        'Mock subscription checkout success',
        jsonb_build_object(
            'source', 'mock_checkout_subscribe',
            'subscription_id', subscription_id
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'status', 'success',
        'subscription_id', subscription_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.mock_checkout_topup(
    target_organization_id UUID,
    requested_credits NUMERIC(14, 1),
    requested_amount_try NUMERIC(14, 2),
    simulated_outcome TEXT DEFAULT 'success'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    account_row public.organization_billing_accounts%ROWTYPE;
    order_id UUID;
    remaining_package NUMERIC(14, 1);
    credits_safe NUMERIC(14, 1);
    next_topup_balance NUMERIC(14, 1);
BEGIN
    PERFORM public.assert_org_member_or_admin(target_organization_id);

    IF COALESCE(simulated_outcome, '') NOT IN ('success', 'failed') THEN
        RAISE EXCEPTION 'Invalid simulated outcome';
    END IF;

    credits_safe := GREATEST(0, COALESCE(requested_credits, 0));
    IF credits_safe <= 0 THEN
        RAISE EXCEPTION 'Top-up credits must be greater than zero';
    END IF;

    PERFORM public.initialize_org_billing_account(target_organization_id);

    SELECT *
    INTO account_row
    FROM public.organization_billing_accounts
    WHERE organization_id = target_organization_id
    FOR UPDATE;

    remaining_package := GREATEST(0, COALESCE(account_row.monthly_package_credit_limit, 0) - COALESCE(account_row.monthly_package_credit_used, 0));

    IF account_row.membership_state <> 'premium_active' OR remaining_package > 0 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'status', 'blocked',
            'reason', 'topup_not_allowed'
        );
    END IF;

    INSERT INTO public.credit_purchase_orders (
        organization_id,
        provider,
        provider_checkout_id,
        status,
        credits,
        amount_try,
        currency,
        metadata
    )
    VALUES (
        target_organization_id,
        'mock',
        'mock_chk_' || replace(gen_random_uuid()::text, '-', ''),
        'pending',
        credits_safe,
        GREATEST(0, COALESCE(requested_amount_try, 0)),
        'TRY',
        jsonb_build_object('simulated_outcome', simulated_outcome)
    )
    RETURNING id INTO order_id;

    IF simulated_outcome = 'failed' THEN
        UPDATE public.credit_purchase_orders
        SET
            status = 'failed',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('result', 'failed'),
            updated_at = now()
        WHERE id = order_id;

        RETURN jsonb_build_object(
            'ok', false,
            'status', 'failed',
            'order_id', order_id
        );
    END IF;

    next_topup_balance := COALESCE(account_row.topup_credit_balance, 0) + credits_safe;

    UPDATE public.organization_billing_accounts
    SET
        topup_credit_balance = next_topup_balance,
        lock_reason = 'none',
        updated_at = now()
    WHERE organization_id = target_organization_id;

    UPDATE public.credit_purchase_orders
    SET
        status = 'paid',
        provider_payment_id = 'mock_pay_' || replace(gen_random_uuid()::text, '-', ''),
        paid_at = now(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('result', 'success'),
        updated_at = now()
    WHERE id = order_id;

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
        'purchase_credit',
        'topup_pool',
        credits_safe,
        remaining_package + next_topup_balance,
        auth.uid(),
        'Mock top-up checkout success',
        jsonb_build_object(
            'source', 'mock_checkout_topup',
            'order_id', order_id
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'status', 'success',
        'order_id', order_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_org_member_or_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_membership_override(UUID, public.billing_membership_state, public.billing_lock_reason, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_trial_credits(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_package_credits(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mock_checkout_subscribe(UUID, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mock_checkout_topup(UUID, NUMERIC, NUMERIC, TEXT) TO authenticated;
