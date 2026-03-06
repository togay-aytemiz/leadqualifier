-- Preserve unused trial credits as persistent extra-credit balance on first premium activation.
-- Monthly package credits still reset by billing period; only trial leftovers persist.

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
    carryover_trial_credits NUMERIC(14, 1);
    next_topup_balance NUMERIC(14, 1);
    next_trial_used NUMERIC(14, 1);
    total_balance_after NUMERIC(14, 1);
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

    carryover_trial_credits := GREATEST(
        0,
        COALESCE(before_row.trial_credit_limit, 0) - COALESCE(before_row.trial_credit_used, 0)
    );
    next_topup_balance := COALESCE(before_row.topup_credit_balance, 0) + carryover_trial_credits;
    next_trial_used := CASE
        WHEN carryover_trial_credits > 0 THEN GREATEST(0, COALESCE(before_row.trial_credit_limit, 0))
        ELSE COALESCE(before_row.trial_credit_used, 0)
    END;
    total_balance_after := GREATEST(0, monthly_credits) + next_topup_balance;

    UPDATE public.organization_billing_accounts
    SET
        membership_state = 'premium_active',
        lock_reason = 'none',
        current_period_start = period_start,
        current_period_end = period_end,
        trial_credit_used = next_trial_used,
        monthly_package_credit_limit = GREATEST(0, monthly_credits),
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
            'monthly_price_try', GREATEST(0, monthly_price_try),
            'monthly_credits', GREATEST(0, monthly_credits),
            'trial_credit_carryover', carryover_trial_credits
        )
    );

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
            jsonb_build_object('source', 'admin_assign_premium', 'carryover_type', 'trial_credit')
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
        GREATEST(0, monthly_credits),
        total_balance_after,
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
            'period_end', period_end,
            'trial_credit_carryover', carryover_trial_credits
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
    active_subscription_row public.organization_subscription_records%ROWTYPE;
    subscription_id UUID;
    period_start TIMESTAMPTZ;
    period_end TIMESTAMPTZ;
    effective_at TIMESTAMPTZ;
    monthly_credits_safe NUMERIC(14, 1);
    requested_price_try_safe NUMERIC(14, 2);
    current_package_limit NUMERIC(14, 1);
    previous_membership_state TEXT;
    metadata_json JSONB;
    carryover_trial_credits NUMERIC(14, 1);
    next_topup_balance NUMERIC(14, 1);
    next_trial_used NUMERIC(14, 1);
    total_balance_after NUMERIC(14, 1);
BEGIN
    PERFORM public.assert_org_member_or_admin(target_organization_id);

    IF COALESCE(simulated_outcome, '') NOT IN ('success', 'failed') THEN
        RAISE EXCEPTION 'Invalid simulated outcome';
    END IF;

    monthly_credits_safe := GREATEST(0, COALESCE(requested_monthly_credits, 0));
    IF monthly_credits_safe <= 0 THEN
        RAISE EXCEPTION 'Monthly credits must be greater than zero';
    END IF;

    requested_price_try_safe := GREATEST(0, COALESCE(requested_monthly_price_try, 0));

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

    previous_membership_state := account_row.membership_state;
    current_package_limit := GREATEST(0, COALESCE(account_row.monthly_package_credit_limit, 0));

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
                'requested_monthly_price_try', requested_price_try_safe,
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

    IF account_row.membership_state = 'premium_active' AND monthly_credits_safe < current_package_limit THEN
        effective_at := COALESCE(account_row.current_period_end, now() + interval '1 month');

        SELECT *
        INTO active_subscription_row
        FROM public.organization_subscription_records
        WHERE organization_id = target_organization_id
          AND status IN ('active', 'past_due')
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE;

        IF active_subscription_row.id IS NULL THEN
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
                COALESCE(account_row.current_period_start, now()),
                effective_at,
                '{}'::jsonb
            )
            RETURNING * INTO active_subscription_row;
        END IF;

        metadata_json := COALESCE(active_subscription_row.metadata, '{}'::jsonb)
            || jsonb_build_object(
                'pending_plan_change',
                jsonb_build_object(
                    'change_type', 'downgrade',
                    'requested_monthly_price_try', requested_price_try_safe,
                    'requested_monthly_credits', monthly_credits_safe,
                    'effective_at', effective_at,
                    'requested_at', now()
                )
            );

        UPDATE public.organization_subscription_records
        SET
            metadata = metadata_json,
            updated_at = now()
        WHERE id = active_subscription_row.id;

        UPDATE public.organization_billing_accounts
        SET
            last_manual_action_at = now(),
            updated_at = now()
        WHERE organization_id = target_organization_id;

        RETURN jsonb_build_object(
            'ok', true,
            'status', 'scheduled',
            'change_type', 'downgrade',
            'effective_at', effective_at,
            'subscription_id', active_subscription_row.id
        );
    END IF;

    IF account_row.membership_state = 'premium_active' AND monthly_credits_safe = current_package_limit THEN
        UPDATE public.organization_subscription_records
        SET
            metadata = COALESCE(metadata, '{}'::jsonb) - 'pending_plan_change',
            updated_at = now()
        WHERE organization_id = target_organization_id
          AND status IN ('active', 'past_due');

        UPDATE public.organization_billing_accounts
        SET
            last_manual_action_at = now(),
            updated_at = now()
        WHERE organization_id = target_organization_id;

        RETURN jsonb_build_object(
            'ok', true,
            'status', 'success',
            'change_type', 'no_change'
        );
    END IF;

    period_start := now();
    period_end := period_start + interval '1 month';

    UPDATE public.organization_subscription_records
    SET
        metadata = COALESCE(metadata, '{}'::jsonb) - 'pending_plan_change',
        updated_at = now()
    WHERE organization_id = target_organization_id
      AND status IN ('active', 'past_due');

    carryover_trial_credits := GREATEST(
        0,
        COALESCE(account_row.trial_credit_limit, 0) - COALESCE(account_row.trial_credit_used, 0)
    );
    next_topup_balance := COALESCE(account_row.topup_credit_balance, 0) + carryover_trial_credits;
    next_trial_used := CASE
        WHEN carryover_trial_credits > 0 THEN GREATEST(0, COALESCE(account_row.trial_credit_limit, 0))
        ELSE COALESCE(account_row.trial_credit_used, 0)
    END;
    total_balance_after := monthly_credits_safe + next_topup_balance;

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
        premium_assigned_at = COALESCE(account_row.premium_assigned_at, now()),
        last_manual_action_at = now(),
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
            'requested_monthly_price_try', requested_price_try_safe,
            'requested_monthly_credits', monthly_credits_safe,
            'trial_credit_carryover', carryover_trial_credits,
            'change_type', CASE
                WHEN previous_membership_state = 'premium_active' THEN 'upgrade'
                ELSE 'start'
            END
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
                'source', 'mock_checkout_subscribe',
                'subscription_id', subscription_id,
                'carryover_type', 'trial_credit'
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
        'Mock subscription checkout success',
        jsonb_build_object(
            'source', 'mock_checkout_subscribe',
            'subscription_id', subscription_id
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'status', 'success',
        'subscription_id', subscription_id,
        'change_type', CASE
            WHEN previous_membership_state = 'premium_active' THEN 'upgrade'
            ELSE 'start'
        END
    );
END;
$$;
