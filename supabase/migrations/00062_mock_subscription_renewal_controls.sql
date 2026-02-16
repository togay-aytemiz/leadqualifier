-- Self-serve mock subscription renewal controls for MVP.
-- Allows org members/admins to toggle auto-renew while keeping current period active.

CREATE OR REPLACE FUNCTION public.mock_subscription_cancel_renewal(
    target_organization_id UUID,
    action_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    account_row public.organization_billing_accounts%ROWTYPE;
    subscription_row public.organization_subscription_records%ROWTYPE;
    metadata_json JSONB;
    reason_trimmed TEXT;
BEGIN
    PERFORM public.assert_org_member_or_admin(target_organization_id);
    PERFORM public.initialize_org_billing_account(target_organization_id);

    reason_trimmed := NULLIF(trim(COALESCE(action_reason, '')), '');

    SELECT *
    INTO account_row
    FROM public.organization_billing_accounts
    WHERE organization_id = target_organization_id
    FOR UPDATE;

    IF account_row.organization_id IS NULL THEN
        RAISE EXCEPTION 'Billing account not found';
    END IF;

    IF account_row.membership_state = 'admin_locked' THEN
        RETURN jsonb_build_object(
            'ok', false,
            'status', 'blocked',
            'reason', 'admin_locked'
        );
    END IF;

    IF account_row.membership_state <> 'premium_active' THEN
        RETURN jsonb_build_object(
            'ok', false,
            'status', 'blocked',
            'reason', 'premium_required'
        );
    END IF;

    SELECT *
    INTO subscription_row
    FROM public.organization_subscription_records
    WHERE organization_id = target_organization_id
      AND status IN ('active', 'past_due')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF subscription_row.id IS NULL THEN
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
            'mock_sub_renewal_' || replace(gen_random_uuid()::text, '-', ''),
            'active',
            account_row.current_period_start,
            account_row.current_period_end,
            '{}'::jsonb
        )
        RETURNING * INTO subscription_row;
    END IF;

    metadata_json := COALESCE(subscription_row.metadata, '{}'::jsonb)
        || jsonb_build_object(
            'auto_renew', false,
            'cancel_at_period_end', true,
            'cancellation_requested_at', now()
        );

    IF reason_trimmed IS NOT NULL THEN
        metadata_json := metadata_json || jsonb_build_object('cancellation_reason', reason_trimmed);
    END IF;

    UPDATE public.organization_subscription_records
    SET
        metadata = metadata_json,
        updated_at = now()
    WHERE id = subscription_row.id;

    UPDATE public.organization_billing_accounts
    SET
        last_manual_action_at = now(),
        updated_at = now()
    WHERE organization_id = target_organization_id;

    RETURN jsonb_build_object(
        'ok', true,
        'status', 'success'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.mock_subscription_resume_renewal(
    target_organization_id UUID,
    action_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    account_row public.organization_billing_accounts%ROWTYPE;
    subscription_row public.organization_subscription_records%ROWTYPE;
    metadata_json JSONB;
    reason_trimmed TEXT;
BEGIN
    PERFORM public.assert_org_member_or_admin(target_organization_id);
    PERFORM public.initialize_org_billing_account(target_organization_id);

    reason_trimmed := NULLIF(trim(COALESCE(action_reason, '')), '');

    SELECT *
    INTO account_row
    FROM public.organization_billing_accounts
    WHERE organization_id = target_organization_id
    FOR UPDATE;

    IF account_row.organization_id IS NULL THEN
        RAISE EXCEPTION 'Billing account not found';
    END IF;

    IF account_row.membership_state = 'admin_locked' THEN
        RETURN jsonb_build_object(
            'ok', false,
            'status', 'blocked',
            'reason', 'admin_locked'
        );
    END IF;

    IF account_row.membership_state <> 'premium_active' THEN
        RETURN jsonb_build_object(
            'ok', false,
            'status', 'blocked',
            'reason', 'premium_required'
        );
    END IF;

    SELECT *
    INTO subscription_row
    FROM public.organization_subscription_records
    WHERE organization_id = target_organization_id
      AND status IN ('active', 'past_due')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF subscription_row.id IS NULL THEN
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
            'mock_sub_renewal_' || replace(gen_random_uuid()::text, '-', ''),
            'active',
            account_row.current_period_start,
            account_row.current_period_end,
            '{}'::jsonb
        )
        RETURNING * INTO subscription_row;
    END IF;

    metadata_json := (
        COALESCE(subscription_row.metadata, '{}'::jsonb)
        - 'cancel_at_period_end'
        - 'cancellation_reason'
        - 'cancellation_requested_at'
    )
        || jsonb_build_object(
            'auto_renew', true,
            'renewal_resumed_at', now()
        );

    IF reason_trimmed IS NOT NULL THEN
        metadata_json := metadata_json || jsonb_build_object('resume_reason', reason_trimmed);
    END IF;

    UPDATE public.organization_subscription_records
    SET
        metadata = metadata_json,
        updated_at = now()
    WHERE id = subscription_row.id;

    UPDATE public.organization_billing_accounts
    SET
        last_manual_action_at = now(),
        updated_at = now()
    WHERE organization_id = target_organization_id;

    RETURN jsonb_build_object(
        'ok', true,
        'status', 'success'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mock_subscription_cancel_renewal(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mock_subscription_resume_renewal(UUID, TEXT) TO authenticated;
