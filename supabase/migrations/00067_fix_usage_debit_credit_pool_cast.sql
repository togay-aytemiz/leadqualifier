-- Fix premium AI usage debit trigger enum casting.
-- Premium branch used a CASE expression for credit_pool; without explicit enum casts
-- PostgreSQL resolved it as text and rejected inserts with:
-- "column credit_pool is of type billing_credit_pool_type but expression is of type text" (42804).

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
