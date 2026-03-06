-- Add a small premium-expiry grace window to reduce false lockouts around
-- provider webhook delay, and apply recurring renewal success in one atomic
-- RPC so billing/account/ledger state stays consistent across retries.

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
    premium_period_ended BOOLEAN;
    effective_membership_state public.billing_membership_state;
    effective_lock_reason public.billing_lock_reason;
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
    premium_period_ended := account_row.membership_state = 'premium_active'
        AND account_row.current_period_end IS NOT NULL
        AND now() > account_row.current_period_end + interval '1 hour';

    effective_membership_state := CASE
        WHEN premium_period_ended THEN 'canceled'::public.billing_membership_state
        ELSE account_row.membership_state
    END;

    effective_lock_reason := CASE
        WHEN account_row.membership_state = 'trial_active' AND now() > account_row.trial_ends_at THEN 'trial_time_expired'::public.billing_lock_reason
        WHEN account_row.membership_state = 'trial_active' AND remaining_trial <= 0 THEN 'trial_credits_exhausted'::public.billing_lock_reason
        WHEN premium_period_ended THEN 'subscription_required'::public.billing_lock_reason
        WHEN account_row.membership_state = 'premium_active' AND remaining_package <= 0 AND COALESCE(account_row.topup_credit_balance, 0) <= 0 THEN 'package_credits_exhausted'::public.billing_lock_reason
        ELSE account_row.lock_reason
    END;

    RETURN QUERY
    SELECT
        CASE
            WHEN effective_membership_state IN ('admin_locked', 'past_due', 'canceled') THEN FALSE
            WHEN effective_membership_state = 'trial_active' THEN now() <= account_row.trial_ends_at AND remaining_trial > 0
            WHEN effective_membership_state = 'premium_active' THEN remaining_package > 0 OR COALESCE(account_row.topup_credit_balance, 0) > 0
            ELSE FALSE
        END AS is_usage_allowed,
        CASE
            WHEN effective_membership_state = 'premium_active' THEN TRUE
            ELSE FALSE
        END AS is_topup_allowed,
        effective_membership_state,
        effective_lock_reason,
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
            'usage_debit'::public.billing_credit_ledger_type,
            'trial_pool'::public.billing_credit_pool_type,
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
        IF account_row.current_period_end IS NOT NULL AND now() > account_row.current_period_end + interval '1 hour' THEN
            RAISE EXCEPTION 'Premium billing period has ended';
        END IF;

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
            'usage_debit'::public.billing_credit_ledger_type,
            CASE
                WHEN package_debit > 0 AND topup_debit > 0 THEN 'mixed'::public.billing_credit_pool_type
                WHEN topup_debit > 0 THEN 'topup_pool'::public.billing_credit_pool_type
                ELSE 'package_pool'::public.billing_credit_pool_type
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

CREATE OR REPLACE FUNCTION public.apply_iyzico_subscription_renewal_success(
    target_subscription_record_id UUID,
    target_order_reference_code TEXT,
    target_event_reference_code TEXT,
    next_period_start TIMESTAMPTZ,
    next_period_end TIMESTAMPTZ,
    requested_monthly_credits NUMERIC(14, 1),
    requested_monthly_price_try NUMERIC(14, 2),
    renewal_retrieve_response JSONB,
    synced_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    subscription_row public.organization_subscription_records%ROWTYPE;
    billing_row public.organization_billing_accounts%ROWTYPE;
    metadata_record JSONB;
    next_metadata JSONB;
    credits_safe NUMERIC(14, 1);
    price_safe NUMERIC(14, 2);
    ledger_exists BOOLEAN;
    already_applied_period BOOLEAN;
    balance_after NUMERIC(14, 1);
BEGIN
    IF target_subscription_record_id IS NULL THEN
        RAISE EXCEPTION 'target_subscription_record_id is required';
    END IF;

    IF trim(COALESCE(target_order_reference_code, '')) = '' THEN
        RAISE EXCEPTION 'target_order_reference_code is required';
    END IF;

    IF next_period_start IS NULL OR next_period_end IS NULL OR next_period_end <= next_period_start THEN
        RAISE EXCEPTION 'next period values are invalid';
    END IF;

    SELECT *
    INTO subscription_row
    FROM public.organization_subscription_records
    WHERE id = target_subscription_record_id
    FOR UPDATE;

    IF subscription_row.id IS NULL THEN
        RAISE EXCEPTION 'subscription record not found';
    END IF;

    SELECT *
    INTO billing_row
    FROM public.organization_billing_accounts
    WHERE organization_id = subscription_row.organization_id
    FOR UPDATE;

    IF billing_row.organization_id IS NULL THEN
        RAISE EXCEPTION 'billing account not found';
    END IF;

    metadata_record := COALESCE(subscription_row.metadata, '{}'::jsonb);
    credits_safe := GREATEST(0, COALESCE(requested_monthly_credits, billing_row.monthly_package_credit_limit, 0));
    price_safe := GREATEST(0, COALESCE(requested_monthly_price_try, 0));
    balance_after := credits_safe + COALESCE(billing_row.topup_credit_balance, 0);

    SELECT EXISTS (
        SELECT 1
        FROM public.organization_credit_ledger
        WHERE organization_id = subscription_row.organization_id
            AND entry_type = 'package_grant'
            AND COALESCE(metadata->>'source', '') = 'iyzico_subscription_webhook'
            AND COALESCE(metadata->>'order_reference_code', '') = target_order_reference_code
    )
    INTO ledger_exists;

    already_applied_period := subscription_row.period_end = next_period_end OR billing_row.current_period_end = next_period_end;

    next_metadata := metadata_record || jsonb_build_object(
        'last_renewal_order_reference_code', target_order_reference_code,
        'last_renewal_event_reference_code', target_event_reference_code,
        'last_renewal_synced_at', synced_at,
        'renewal_retrieve_response', COALESCE(renewal_retrieve_response, '{}'::jsonb),
        'payment_status', 'paid',
        'last_failed_order_reference_code', NULL,
        'last_failed_event_reference_code', NULL,
        'requested_monthly_credits', credits_safe,
        'requested_monthly_price_try', price_safe
    );

    IF already_applied_period AND ledger_exists THEN
        UPDATE public.organization_subscription_records
        SET
            metadata = next_metadata,
            updated_at = synced_at
        WHERE id = subscription_row.id;

        RETURN jsonb_build_object(
            'ok', true,
            'status', 'ignored'
        );
    END IF;

    UPDATE public.organization_subscription_records
    SET
        status = 'active',
        period_start = next_period_start,
        period_end = next_period_end,
        metadata = next_metadata,
        updated_at = synced_at
    WHERE id = subscription_row.id;

    UPDATE public.organization_billing_accounts
    SET
        membership_state = 'premium_active',
        lock_reason = 'none',
        current_period_start = next_period_start,
        current_period_end = next_period_end,
        monthly_package_credit_limit = credits_safe,
        monthly_package_credit_used = 0,
        premium_assigned_at = COALESCE(billing_row.premium_assigned_at, synced_at),
        updated_at = synced_at
    WHERE organization_id = subscription_row.organization_id;

    IF NOT ledger_exists THEN
        INSERT INTO public.organization_credit_ledger (
            organization_id,
            entry_type,
            credit_pool,
            credits_delta,
            balance_after,
            reason,
            metadata
        )
        VALUES (
            subscription_row.organization_id,
            'package_grant',
            'package_pool',
            credits_safe,
            balance_after,
            'Iyzico recurring renewal success',
            jsonb_build_object(
                'source', 'iyzico_subscription_webhook',
                'subscription_record_id', subscription_row.id,
                'order_reference_code', target_order_reference_code,
                'requested_monthly_price_try', price_safe
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'status', CASE WHEN already_applied_period THEN 'recovered' ELSE 'applied' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_iyzico_subscription_renewal_success(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, NUMERIC, JSONB, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_iyzico_subscription_renewal_success(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, NUMERIC, JSONB, TIMESTAMPTZ) TO service_role;
