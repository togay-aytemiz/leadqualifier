-- Keep provider-canceled subscriptions usable until current_period_end,
-- then expire entitlement locally even if the billing row has not been
-- finalized yet. Also reject late premium usage debits after the paid
-- period ends.

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
        AND now() > account_row.current_period_end;

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
        IF account_row.current_period_end IS NOT NULL AND now() > account_row.current_period_end THEN
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
