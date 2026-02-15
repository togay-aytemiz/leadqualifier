-- Policy update:
-- Extra credits can be purchased whenever membership_state = premium_active.
-- Package exhaustion is no longer required for top-up eligibility.

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
            WHEN account_row.membership_state = 'premium_active' THEN TRUE
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

    IF account_row.membership_state <> 'premium_active' THEN
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

GRANT EXECUTE ON FUNCTION public.mock_checkout_topup(UUID, NUMERIC, NUMERIC, TEXT) TO authenticated;
