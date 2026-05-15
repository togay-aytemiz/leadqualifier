-- Reassert admin premium assignment so catalog/manual premium activations always
-- grant a positive monthly package and persist renewal-friendly metadata.

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
    subscription_id UUID;
    carryover_trial_credits NUMERIC(14, 1);
    next_topup_balance NUMERIC(14, 1);
    next_trial_used NUMERIC(14, 1);
    monthly_credits_safe NUMERIC(14, 1);
    monthly_price_safe NUMERIC(14, 2);
    total_balance_after NUMERIC(14, 1);
BEGIN
    IF trim(COALESCE(action_reason, '')) = '' THEN
        RAISE EXCEPTION 'Reason is required';
    END IF;

    IF period_end <= period_start THEN
        RAISE EXCEPTION 'period_end must be greater than period_start';
    END IF;

    monthly_credits_safe := GREATEST(0, COALESCE(monthly_credits, 0));
    IF monthly_credits_safe <= 0 THEN
        RAISE EXCEPTION 'Monthly credits must be greater than zero';
    END IF;

    monthly_price_safe := GREATEST(0, COALESCE(monthly_price_try, 0));

    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT is_system_admin_secure() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    PERFORM public.initialize_org_billing_account(target_organization_id);

    SELECT *
    INTO before_row
    FROM public.organization_billing_accounts
    WHERE organization_id = target_organization_id
    FOR UPDATE;

    IF before_row.organization_id IS NULL THEN
        RAISE EXCEPTION 'Billing account not found';
    END IF;

    carryover_trial_credits := GREATEST(
        0,
        COALESCE(before_row.trial_credit_limit, 0) - COALESCE(before_row.trial_credit_used, 0)
    );
    next_topup_balance := COALESCE(before_row.topup_credit_balance, 0) + carryover_trial_credits;
    next_trial_used := CASE
        WHEN carryover_trial_credits > 0 THEN GREATEST(0, COALESCE(before_row.trial_credit_limit, 0))
        ELSE COALESCE(before_row.trial_credit_used, 0)
    END;
    total_balance_after := monthly_credits_safe + next_topup_balance;

    UPDATE public.organization_subscription_records
    SET
        status = 'canceled',
        canceled_at = COALESCE(canceled_at, now()),
        metadata = COALESCE(metadata, '{}'::jsonb)
            || jsonb_build_object(
                'cancel_reason', 'manual_admin_replaced_by_new_assignment',
                'replaced_at', now()
            ),
        updated_at = now()
    WHERE organization_id = target_organization_id
      AND provider = 'manual_admin'
      AND status IN ('active', 'past_due');

    UPDATE public.organization_billing_accounts
    SET
        membership_state = 'premium_active',
        lock_reason = 'none',
        current_period_start = period_start,
        current_period_end = period_end,
        trial_credit_used = next_trial_used,
        monthly_package_credit_limit = monthly_credits_safe,
        monthly_package_credit_used = 0,
        topup_credit_balance = next_topup_balance,
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
            'auto_renew', TRUE,
            'cancel_at_period_end', FALSE,
            'monthly_price_try', monthly_price_safe,
            'monthly_credits', monthly_credits_safe,
            'trial_credit_carryover', carryover_trial_credits
        )
    )
    RETURNING id INTO subscription_id;

    IF carryover_trial_credits > 0 THEN
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
            carryover_trial_credits,
            total_balance_after,
            auth.uid(),
            'Trial credit carryover on premium activation',
            jsonb_build_object(
                'source', 'admin_assign_premium',
                'carryover_type', 'trial_credit',
                'subscription_record_id', subscription_id
            )
        );
    END IF;

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
        total_balance_after,
        auth.uid(),
        action_reason,
        jsonb_build_object(
            'source', 'admin_assign_premium',
            'subscription_record_id', subscription_id,
            'period_start', period_start,
            'period_end', period_end,
            'monthly_price_try', monthly_price_safe,
            'monthly_credits', monthly_credits_safe
        )
    );

    PERFORM public.log_billing_admin_audit(
        target_organization_id,
        'premium_assign',
        action_reason,
        to_jsonb(before_row),
        to_jsonb(updated_row),
        jsonb_build_object(
            'monthly_price_try', monthly_price_safe,
            'monthly_credits', monthly_credits_safe,
            'period_start', period_start,
            'period_end', period_end,
            'trial_credit_carryover', carryover_trial_credits,
            'subscription_record_id', subscription_id
        )
    );

    RETURN updated_row;
END;
$$;
