-- Apply fixed-difference Iyzico upgrade checkout success atomically.

CREATE OR REPLACE FUNCTION public.apply_iyzico_subscription_upgrade_checkout_success(
    target_order_id UUID,
    next_subscription_reference_code TEXT,
    payment_conversation_id TEXT,
    upgrade_schedule_response JSONB,
    callback_retrieve_response JSONB,
    applied_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    order_row public.credit_purchase_orders%ROWTYPE;
    subscription_row public.organization_subscription_records%ROWTYPE;
    billing_row public.organization_billing_accounts%ROWTYPE;
    order_metadata JSONB;
    subscription_metadata JSONB;
    next_subscription_metadata JSONB;
    subscription_record_id UUID;
    requested_credits NUMERIC(14, 1);
    requested_price_try NUMERIC(14, 2);
    credit_delta_safe NUMERIC(14, 1);
    current_period_start_safe TIMESTAMPTZ;
    current_period_end_safe TIMESTAMPTZ;
    current_used_safe NUMERIC(14, 1);
    balance_after NUMERIC(14, 1);
    payment_id_safe TEXT;
    ledger_exists BOOLEAN;
BEGIN
    IF target_order_id IS NULL THEN
        RAISE EXCEPTION 'target_order_id is required';
    END IF;

    IF trim(COALESCE(next_subscription_reference_code, '')) = '' THEN
        RAISE EXCEPTION 'next_subscription_reference_code is required';
    END IF;

    SELECT *
    INTO order_row
    FROM public.credit_purchase_orders
    WHERE id = target_order_id
    FOR UPDATE;

    IF order_row.id IS NULL THEN
        RAISE EXCEPTION 'credit purchase order not found';
    END IF;

    order_metadata := COALESCE(order_row.metadata, '{}'::jsonb);

    IF COALESCE(order_metadata->>'source', '') <> 'iyzico_subscription_upgrade_checkout' THEN
        RAISE EXCEPTION 'credit purchase order is not an iyzico upgrade checkout';
    END IF;

    IF order_row.status = 'paid' AND COALESCE(order_metadata->>'upgrade_apply_status', '') = 'success' THEN
        RETURN jsonb_build_object(
            'ok', true,
            'status', 'ignored'
        );
    END IF;

    subscription_record_id := NULLIF(order_metadata->>'subscription_id', '')::uuid;
    IF subscription_record_id IS NULL THEN
        RAISE EXCEPTION 'subscription_id metadata is required';
    END IF;

    payment_id_safe := COALESCE(order_row.provider_payment_id, NULLIF(order_metadata->>'payment_id', ''));
    IF trim(COALESCE(payment_id_safe, '')) = '' THEN
        RAISE EXCEPTION 'provider payment id is required';
    END IF;

    requested_credits := GREATEST(0, COALESCE((order_metadata->>'requested_monthly_credits')::numeric, 0));
    requested_price_try := GREATEST(0, COALESCE((order_metadata->>'requested_monthly_price_try')::numeric, 0));
    credit_delta_safe := GREATEST(0, COALESCE((order_metadata->>'credit_delta')::numeric, order_row.credits, 0));

    IF requested_credits <= 0 OR requested_price_try <= 0 OR credit_delta_safe <= 0 THEN
        RAISE EXCEPTION 'upgrade checkout metadata is invalid';
    END IF;

    current_period_start_safe := COALESCE(
        NULLIF(order_metadata->>'current_period_start', '')::timestamptz,
        applied_at
    );
    current_period_end_safe := COALESCE(
        NULLIF(order_metadata->>'current_period_end', '')::timestamptz,
        current_period_start_safe
    );

    SELECT *
    INTO subscription_row
    FROM public.organization_subscription_records
    WHERE id = subscription_record_id
    FOR UPDATE;

    IF subscription_row.id IS NULL THEN
        RAISE EXCEPTION 'subscription record not found';
    END IF;

    IF subscription_row.organization_id <> order_row.organization_id THEN
        RAISE EXCEPTION 'subscription organization mismatch';
    END IF;

    SELECT *
    INTO billing_row
    FROM public.organization_billing_accounts
    WHERE organization_id = order_row.organization_id
    FOR UPDATE;

    IF billing_row.organization_id IS NULL THEN
        RAISE EXCEPTION 'billing account not found';
    END IF;

    current_used_safe := LEAST(
        GREATEST(0, COALESCE(billing_row.monthly_package_credit_used, 0)),
        requested_credits
    );
    balance_after := GREATEST(0, requested_credits - current_used_safe) + COALESCE(billing_row.topup_credit_balance, 0);

    SELECT EXISTS (
        SELECT 1
        FROM public.organization_credit_ledger
        WHERE organization_id = order_row.organization_id
            AND entry_type = 'package_grant'
            AND COALESCE(metadata->>'source', '') = 'iyzico_subscription_upgrade_checkout'
            AND COALESCE(metadata->>'order_id', '') = target_order_id::text
    )
    INTO ledger_exists;

    subscription_metadata := COALESCE(subscription_row.metadata, '{}'::jsonb);
    next_subscription_metadata := subscription_metadata || jsonb_build_object(
        'source', 'iyzico_subscription_upgrade',
        'change_type', 'upgrade',
        'conversation_id', order_metadata->>'conversation_id',
        'requested_plan_id', order_metadata->>'requested_plan_id',
        'requested_monthly_credits', requested_credits,
        'requested_monthly_price_try', requested_price_try,
        'upgraded_at', applied_at,
        'upgrade_charge_order_id', target_order_id,
        'upgrade_charge_payment_id', payment_id_safe,
        'upgrade_charge_callback_response', COALESCE(callback_retrieve_response, '{}'::jsonb),
        'upgrade_schedule_response', COALESCE(upgrade_schedule_response, '{}'::jsonb)
    );

    UPDATE public.organization_subscription_records
    SET
        status = 'active',
        provider_subscription_id = next_subscription_reference_code,
        period_start = current_period_start_safe,
        period_end = current_period_end_safe,
        metadata = next_subscription_metadata,
        updated_at = applied_at
    WHERE id = subscription_row.id;

    UPDATE public.organization_billing_accounts
    SET
        membership_state = 'premium_active',
        lock_reason = 'none',
        current_period_start = current_period_start_safe,
        current_period_end = current_period_end_safe,
        monthly_package_credit_limit = requested_credits,
        monthly_package_credit_used = current_used_safe,
        premium_assigned_at = COALESCE(billing_row.premium_assigned_at, applied_at),
        updated_at = applied_at
    WHERE organization_id = billing_row.organization_id;

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
            order_row.organization_id,
            'package_grant',
            'package_pool',
            credit_delta_safe,
            balance_after,
            'Iyzico subscription upgrade success',
            jsonb_build_object(
                'source', 'iyzico_subscription_upgrade_checkout',
                'order_id', target_order_id,
                'payment_id', payment_id_safe,
                'payment_conversation_id', payment_conversation_id,
                'subscription_id', subscription_row.id,
                'requested_monthly_credits', requested_credits,
                'requested_monthly_price_try', requested_price_try,
                'charged_amount_try', order_row.amount_try,
                'change_type', 'upgrade'
            )
        );
    END IF;

    UPDATE public.credit_purchase_orders
    SET
        status = 'paid',
        provider_payment_id = payment_id_safe,
        paid_at = COALESCE(order_row.paid_at, applied_at),
        metadata = order_metadata || jsonb_build_object(
            'payment_status', 'SUCCESS',
            'payment_id', payment_id_safe,
            'payment_conversation_id', payment_conversation_id,
            'callback_retrieve_response', COALESCE(callback_retrieve_response, '{}'::jsonb),
            'upgrade_apply_status', 'success',
            'upgrade_apply_error', NULL,
            'upgrade_schedule_response', COALESCE(upgrade_schedule_response, '{}'::jsonb)
        ),
        updated_at = applied_at
    WHERE id = order_row.id;

    RETURN jsonb_build_object(
        'ok', true,
        'status', CASE WHEN ledger_exists THEN 'recovered' ELSE 'applied' END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_iyzico_subscription_upgrade_checkout_success(UUID, TEXT, TEXT, JSONB, JSONB, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_iyzico_subscription_upgrade_checkout_success(UUID, TEXT, TEXT, JSONB, JSONB, TIMESTAMPTZ) TO service_role;
