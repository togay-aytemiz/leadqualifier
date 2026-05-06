-- Renew admin-assigned manual premium packages when their period rolls over.
-- The app calls this before billing snapshot/entitlement reads so manual plans
-- keep behaving like recurring subscriptions without a separate cron.

CREATE OR REPLACE FUNCTION public.renew_due_manual_admin_subscription(
    target_organization_id UUID,
    renewal_now TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    account_row public.organization_billing_accounts%ROWTYPE;
    subscription_row public.organization_subscription_records%ROWTYPE;
    subscription_metadata JSONB;
    role_claim TEXT;
    auto_renew_enabled BOOLEAN;
    next_period_start TIMESTAMPTZ;
    next_period_end TIMESTAMPTZ;
    monthly_credits_safe NUMERIC(14, 1);
    monthly_price_safe NUMERIC(14, 2);
    period_count INTEGER := 0;
    ledger_exists BOOLEAN;
BEGIN
    IF target_organization_id IS NULL THEN
        RAISE EXCEPTION 'target_organization_id is required';
    END IF;

    role_claim := COALESCE(current_setting('request.jwt.claim.role', true), '');
    IF role_claim <> 'service_role' THEN
        PERFORM public.assert_org_member_or_admin(target_organization_id);
    END IF;

    PERFORM public.initialize_org_billing_account(target_organization_id);

    SELECT *
    INTO account_row
    FROM public.organization_billing_accounts
    WHERE organization_id = target_organization_id
    FOR UPDATE;

    IF account_row.organization_id IS NULL THEN
        RETURN jsonb_build_object('status', 'not_available', 'renewed_periods', 0);
    END IF;

    IF account_row.membership_state <> 'premium_active'
        OR account_row.current_period_end IS NULL
        OR renewal_now < account_row.current_period_end
    THEN
        RETURN jsonb_build_object('status', 'not_due', 'renewed_periods', 0);
    END IF;

    SELECT *
    INTO subscription_row
    FROM public.organization_subscription_records
    WHERE organization_id = target_organization_id
      AND provider = 'manual_admin'
      AND status IN ('active', 'past_due')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF subscription_row.id IS NULL THEN
        RETURN jsonb_build_object('status', 'not_manual', 'renewed_periods', 0);
    END IF;

    subscription_metadata := COALESCE(subscription_row.metadata, '{}'::jsonb);
    auto_renew_enabled := COALESCE((subscription_metadata->>'auto_renew')::BOOLEAN, TRUE)
        AND COALESCE((subscription_metadata->>'cancel_at_period_end')::BOOLEAN, FALSE) IS FALSE;

    IF auto_renew_enabled IS FALSE THEN
        RETURN jsonb_build_object('status', 'not_due', 'renewed_periods', 0);
    END IF;

    monthly_credits_safe := GREATEST(
        0,
        COALESCE(
            NULLIF(subscription_metadata->>'monthly_credits', '')::NUMERIC,
            account_row.monthly_package_credit_limit,
            0
        )
    );
    monthly_price_safe := GREATEST(
        0,
        COALESCE(NULLIF(subscription_metadata->>'monthly_price_try', '')::NUMERIC, 0)
    );

    next_period_start := account_row.current_period_end;
    next_period_end := next_period_start + interval '1 month';

    WHILE renewal_now >= next_period_start LOOP
        SELECT EXISTS (
            SELECT 1
            FROM public.organization_credit_ledger
            WHERE organization_id = target_organization_id
              AND entry_type = 'package_grant'
              AND metadata->>'source' = 'manual_admin_recurring_renewal'
              AND metadata->>'period_start' = next_period_start::TEXT
              AND metadata->>'period_end' = next_period_end::TEXT
        )
        INTO ledger_exists;

        UPDATE public.organization_billing_accounts
        SET
            membership_state = 'premium_active',
            lock_reason = 'none',
            current_period_start = next_period_start,
            current_period_end = next_period_end,
            monthly_package_credit_limit = monthly_credits_safe,
            monthly_package_credit_used = 0,
            last_manual_action_at = now(),
            updated_at = now()
        WHERE organization_id = target_organization_id
        RETURNING * INTO account_row;

        UPDATE public.organization_subscription_records
        SET
            period_start = next_period_start,
            period_end = next_period_end,
            metadata = subscription_metadata
                || jsonb_build_object(
                    'auto_renew', TRUE,
                    'last_manual_renewal_at', now(),
                    'last_manual_renewal_period_start', next_period_start,
                    'last_manual_renewal_period_end', next_period_end,
                    'monthly_credits', monthly_credits_safe,
                    'monthly_price_try', monthly_price_safe
                ),
            updated_at = now()
        WHERE id = subscription_row.id
        RETURNING * INTO subscription_row;

        subscription_metadata := COALESCE(subscription_row.metadata, '{}'::jsonb);

        IF ledger_exists IS FALSE THEN
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
                'Manual admin recurring renewal',
                jsonb_build_object(
                    'source', 'manual_admin_recurring_renewal',
                    'subscription_record_id', subscription_row.id,
                    'period_start', next_period_start,
                    'period_end', next_period_end,
                    'monthly_price_try', monthly_price_safe,
                    'monthly_credits', monthly_credits_safe
                )
            );
        END IF;

        period_count := period_count + 1;
        next_period_start := next_period_end;
        next_period_end := next_period_start + interval '1 month';
    END LOOP;

    RETURN jsonb_build_object(
        'status', CASE WHEN period_count > 0 THEN 'renewed' ELSE 'not_due' END,
        'renewed_periods', period_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.renew_due_manual_admin_subscription(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_due_manual_admin_subscription(UUID, TIMESTAMPTZ) TO service_role;
