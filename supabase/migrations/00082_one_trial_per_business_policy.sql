-- One-trial-per-business policy
-- Roadmap: Trial Abuse Prevention #663

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'trial_business_signal_type'
    ) THEN
        CREATE TYPE public.trial_business_signal_type AS ENUM (
            'whatsapp_business_account_id',
            'normalized_phone',
            'company_name',
            'email_domain'
        );
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.trial_business_fingerprints (
    signal_type public.trial_business_signal_type NOT NULL,
    signal_value TEXT NOT NULL,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'system',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (signal_type, signal_value)
);

CREATE INDEX IF NOT EXISTS trial_business_fingerprints_org_idx
    ON public.trial_business_fingerprints (organization_id, signal_type);

DROP TRIGGER IF EXISTS update_trial_business_fingerprints_updated_at ON public.trial_business_fingerprints;
CREATE TRIGGER update_trial_business_fingerprints_updated_at
    BEFORE UPDATE ON public.trial_business_fingerprints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.trial_business_fingerprints ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.trial_business_fingerprints FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.normalize_trial_identity_company_name(input_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN normalized = '' OR char_length(normalized) < 3 THEN NULL
        ELSE normalized
    END
    FROM (
        SELECT regexp_replace(lower(trim(COALESCE(input_value, ''))), '\\s+', ' ', 'g') AS normalized
    ) prepared;
$$;

CREATE OR REPLACE FUNCTION public.normalize_trial_identity_email_domain(input_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    normalized_domain TEXT;
BEGIN
    normalized_domain := lower(trim(split_part(COALESCE(input_value, ''), '@', 2)));

    IF normalized_domain = '' OR position('.' IN normalized_domain) = 0 THEN
        RETURN NULL;
    END IF;

    IF normalized_domain = ANY (
        ARRAY[
            'gmail.com',
            'googlemail.com',
            'outlook.com',
            'hotmail.com',
            'live.com',
            'yahoo.com',
            'yahoo.com.tr',
            'icloud.com',
            'yandex.com',
            'proton.me',
            'protonmail.com',
            'mail.com',
            'msn.com'
        ]
    ) THEN
        RETURN NULL;
    END IF;

    RETURN normalized_domain;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_trial_identity_waba(input_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT NULLIF(lower(trim(COALESCE(input_value, ''))), '');
$$;

CREATE OR REPLACE FUNCTION public.normalize_trial_identity_phone(input_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    digits_only TEXT;
BEGIN
    digits_only := regexp_replace(COALESCE(input_value, ''), '[^0-9]', '', 'g');

    IF digits_only LIKE '00%' THEN
        digits_only := substr(digits_only, 3);
    END IF;

    IF char_length(digits_only) < 8 THEN
        RETURN NULL;
    END IF;

    RETURN digits_only;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_trial_business_identity(
    input_company_name TEXT,
    input_email TEXT,
    input_whatsapp_business_account_id TEXT DEFAULT NULL,
    input_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    conflict_row RECORD;
    signals_count INT := 0;
BEGIN
    WITH candidate_signals AS (
        SELECT 'whatsapp_business_account_id'::public.trial_business_signal_type AS signal_type,
               public.normalize_trial_identity_waba(input_whatsapp_business_account_id) AS signal_value
        UNION ALL
        SELECT 'normalized_phone'::public.trial_business_signal_type,
               public.normalize_trial_identity_phone(input_phone)
        UNION ALL
        SELECT 'company_name'::public.trial_business_signal_type,
               public.normalize_trial_identity_company_name(input_company_name)
        UNION ALL
        SELECT 'email_domain'::public.trial_business_signal_type,
               public.normalize_trial_identity_email_domain(input_email)
    ), filtered_signals AS (
        SELECT DISTINCT signal_type, signal_value
        FROM candidate_signals
        WHERE signal_value IS NOT NULL
    )
    SELECT COUNT(*)
    INTO signals_count
    FROM filtered_signals;

    IF signals_count = 0 THEN
        RETURN jsonb_build_object(
            'eligible', true,
            'signal_count', 0,
            'conflict_signal_type', NULL,
            'conflict_signal_value', NULL,
            'conflict_organization_id', NULL
        );
    END IF;

    WITH candidate_signals AS (
        SELECT 'whatsapp_business_account_id'::public.trial_business_signal_type AS signal_type,
               public.normalize_trial_identity_waba(input_whatsapp_business_account_id) AS signal_value
        UNION ALL
        SELECT 'normalized_phone'::public.trial_business_signal_type,
               public.normalize_trial_identity_phone(input_phone)
        UNION ALL
        SELECT 'company_name'::public.trial_business_signal_type,
               public.normalize_trial_identity_company_name(input_company_name)
        UNION ALL
        SELECT 'email_domain'::public.trial_business_signal_type,
               public.normalize_trial_identity_email_domain(input_email)
    ), filtered_signals AS (
        SELECT DISTINCT signal_type, signal_value
        FROM candidate_signals
        WHERE signal_value IS NOT NULL
    )
    SELECT
        fingerprints.signal_type::TEXT AS signal_type,
        fingerprints.signal_value AS signal_value,
        fingerprints.organization_id AS organization_id
    INTO conflict_row
    FROM filtered_signals
    JOIN public.trial_business_fingerprints fingerprints
      ON fingerprints.signal_type = filtered_signals.signal_type
     AND fingerprints.signal_value = filtered_signals.signal_value
    ORDER BY CASE fingerprints.signal_type
        WHEN 'whatsapp_business_account_id' THEN 1
        WHEN 'normalized_phone' THEN 2
        WHEN 'email_domain' THEN 3
        ELSE 4
    END
    LIMIT 1;

    IF conflict_row.organization_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'eligible', false,
            'signal_count', signals_count,
            'conflict_signal_type', conflict_row.signal_type,
            'conflict_signal_value', conflict_row.signal_value,
            'conflict_organization_id', conflict_row.organization_id
        );
    END IF;

    RETURN jsonb_build_object(
        'eligible', true,
        'signal_count', signals_count,
        'conflict_signal_type', NULL,
        'conflict_signal_value', NULL,
        'conflict_organization_id', NULL
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_org_trial_business_identity(
    target_organization_id UUID,
    input_whatsapp_business_account_id TEXT DEFAULT NULL,
    input_phone TEXT DEFAULT NULL,
    input_source TEXT DEFAULT 'trial_initialization'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    org_name TEXT;
    owner_email TEXT;
    existing_waba TEXT;
    existing_phone TEXT;
    normalized_waba TEXT;
    normalized_phone TEXT;
    normalized_source TEXT;
    identity_check JSONB;
    is_eligible BOOLEAN;
    conflict_row RECORD;
    signals_count INT := 0;
BEGIN
    SELECT
        organizations.name,
        profiles.email
    INTO
        org_name,
        owner_email
    FROM public.organizations
    LEFT JOIN public.organization_members
      ON organization_members.organization_id = organizations.id
     AND organization_members.role = 'owner'
    LEFT JOIN public.profiles
      ON profiles.id = organization_members.user_id
    WHERE organizations.id = target_organization_id
    ORDER BY organization_members.created_at ASC NULLS LAST
    LIMIT 1;

    IF org_name IS NULL THEN
        RETURN jsonb_build_object(
            'eligible', true,
            'claimed', false,
            'signal_count', 0,
            'reason', 'organization_not_found'
        );
    END IF;

    SELECT
        config->>'business_account_id',
        config->>'display_phone_number'
    INTO
        existing_waba,
        existing_phone
    FROM public.channels
    WHERE organization_id = target_organization_id
      AND type = 'whatsapp'
    ORDER BY created_at DESC
    LIMIT 1;

    normalized_waba := COALESCE(
        public.normalize_trial_identity_waba(input_whatsapp_business_account_id),
        public.normalize_trial_identity_waba(existing_waba)
    );
    normalized_phone := COALESCE(
        public.normalize_trial_identity_phone(input_phone),
        public.normalize_trial_identity_phone(existing_phone)
    );

    identity_check := public.check_trial_business_identity(
        org_name,
        owner_email,
        normalized_waba,
        normalized_phone
    );

    is_eligible := COALESCE((identity_check->>'eligible')::BOOLEAN, true);

    IF NOT is_eligible THEN
        RETURN identity_check || jsonb_build_object('claimed', false);
    END IF;

    WITH candidate_signals AS (
        SELECT 'whatsapp_business_account_id'::public.trial_business_signal_type AS signal_type,
               normalized_waba AS signal_value
        UNION ALL
        SELECT 'normalized_phone'::public.trial_business_signal_type,
               normalized_phone
        UNION ALL
        SELECT 'company_name'::public.trial_business_signal_type,
               public.normalize_trial_identity_company_name(org_name)
        UNION ALL
        SELECT 'email_domain'::public.trial_business_signal_type,
               public.normalize_trial_identity_email_domain(owner_email)
    ), filtered_signals AS (
        SELECT DISTINCT signal_type, signal_value
        FROM candidate_signals
        WHERE signal_value IS NOT NULL
    )
    SELECT COUNT(*)
    INTO signals_count
    FROM filtered_signals;

    normalized_source := NULLIF(trim(COALESCE(input_source, '')), '');
    IF normalized_source IS NULL THEN
        normalized_source := 'system';
    END IF;

    INSERT INTO public.trial_business_fingerprints (
        signal_type,
        signal_value,
        organization_id,
        source,
        metadata,
        last_seen_at
    )
    SELECT
        filtered_signals.signal_type,
        filtered_signals.signal_value,
        target_organization_id,
        normalized_source,
        jsonb_build_object(
            'source', normalized_source,
            'organization_id', target_organization_id
        ),
        now()
    FROM (
        WITH candidate_signals AS (
            SELECT 'whatsapp_business_account_id'::public.trial_business_signal_type AS signal_type,
                   normalized_waba AS signal_value
            UNION ALL
            SELECT 'normalized_phone'::public.trial_business_signal_type,
                   normalized_phone
            UNION ALL
            SELECT 'company_name'::public.trial_business_signal_type,
                   public.normalize_trial_identity_company_name(org_name)
            UNION ALL
            SELECT 'email_domain'::public.trial_business_signal_type,
                   public.normalize_trial_identity_email_domain(owner_email)
        )
        SELECT DISTINCT signal_type, signal_value
        FROM candidate_signals
        WHERE signal_value IS NOT NULL
    ) filtered_signals
    ON CONFLICT (signal_type, signal_value) DO UPDATE
    SET
        last_seen_at = now(),
        source = EXCLUDED.source,
        metadata = COALESCE(public.trial_business_fingerprints.metadata, '{}'::jsonb)
            || jsonb_build_object('last_seen_source', EXCLUDED.source)
    WHERE public.trial_business_fingerprints.organization_id = EXCLUDED.organization_id;

    WITH candidate_signals AS (
        SELECT 'whatsapp_business_account_id'::public.trial_business_signal_type AS signal_type,
               normalized_waba AS signal_value
        UNION ALL
        SELECT 'normalized_phone'::public.trial_business_signal_type,
               normalized_phone
        UNION ALL
        SELECT 'company_name'::public.trial_business_signal_type,
               public.normalize_trial_identity_company_name(org_name)
        UNION ALL
        SELECT 'email_domain'::public.trial_business_signal_type,
               public.normalize_trial_identity_email_domain(owner_email)
    ), filtered_signals AS (
        SELECT DISTINCT signal_type, signal_value
        FROM candidate_signals
        WHERE signal_value IS NOT NULL
    )
    SELECT
        fingerprints.signal_type::TEXT AS signal_type,
        fingerprints.signal_value AS signal_value,
        fingerprints.organization_id AS organization_id
    INTO conflict_row
    FROM filtered_signals
    JOIN public.trial_business_fingerprints fingerprints
      ON fingerprints.signal_type = filtered_signals.signal_type
     AND fingerprints.signal_value = filtered_signals.signal_value
    WHERE fingerprints.organization_id <> target_organization_id
    ORDER BY CASE fingerprints.signal_type
        WHEN 'whatsapp_business_account_id' THEN 1
        WHEN 'normalized_phone' THEN 2
        WHEN 'email_domain' THEN 3
        ELSE 4
    END
    LIMIT 1;

    IF conflict_row.organization_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'eligible', false,
            'claimed', false,
            'signal_count', signals_count,
            'conflict_signal_type', conflict_row.signal_type,
            'conflict_signal_value', conflict_row.signal_value,
            'conflict_organization_id', conflict_row.organization_id
        );
    END IF;

    RETURN jsonb_build_object(
        'eligible', true,
        'claimed', true,
        'signal_count', signals_count,
        'conflict_signal_type', NULL,
        'conflict_signal_value', NULL,
        'conflict_organization_id', NULL
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_org_trial_business_policy(
    target_organization_id UUID,
    input_whatsapp_business_account_id TEXT DEFAULT NULL,
    input_phone TEXT DEFAULT NULL,
    input_source TEXT DEFAULT 'runtime'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    identity_result JSONB;
    is_eligible BOOLEAN;
    locked_rows INT := 0;
BEGIN
    identity_result := public.claim_org_trial_business_identity(
        target_organization_id,
        input_whatsapp_business_account_id,
        input_phone,
        input_source
    );

    is_eligible := COALESCE((identity_result->>'eligible')::BOOLEAN, true);

    IF NOT is_eligible THEN
        UPDATE public.organization_billing_accounts
        SET
            membership_state = 'trial_exhausted',
            lock_reason = 'subscription_required',
            trial_credit_limit = 0,
            trial_credit_used = 0,
            trial_ends_at = LEAST(now(), trial_ends_at),
            last_manual_action_at = now(),
            updated_at = now()
        WHERE organization_id = target_organization_id
          AND membership_state IN ('trial_active', 'trial_exhausted');

        GET DIAGNOSTICS locked_rows = ROW_COUNT;
    END IF;

    RETURN identity_result || jsonb_build_object(
        'trial_locked', locked_rows > 0
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.initialize_org_billing_account(
    target_organization_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    defaults_row public.platform_billing_settings%ROWTYPE;
    trial_identity_result JSONB;
    trial_is_eligible BOOLEAN := true;
    next_membership_state public.billing_membership_state;
    next_lock_reason public.billing_lock_reason;
    next_trial_ends_at TIMESTAMPTZ;
    next_trial_credit_limit NUMERIC(14, 1);
BEGIN
    INSERT INTO public.platform_billing_settings (key)
    VALUES ('default')
    ON CONFLICT (key) DO NOTHING;

    SELECT *
    INTO defaults_row
    FROM public.platform_billing_settings
    WHERE key = 'default'
    LIMIT 1;

    IF defaults_row.key IS NULL THEN
        RAISE EXCEPTION 'Missing platform billing defaults';
    END IF;

    trial_identity_result := public.claim_org_trial_business_identity(
        target_organization_id,
        NULL,
        NULL,
        'trial_initialization'
    );

    trial_is_eligible := COALESCE((trial_identity_result->>'eligible')::BOOLEAN, true);

    IF trial_is_eligible THEN
        next_membership_state := 'trial_active';
        next_lock_reason := 'none';
        next_trial_ends_at := now() + (defaults_row.default_trial_days * interval '1 day');
        next_trial_credit_limit := defaults_row.default_trial_credits;
    ELSE
        next_membership_state := 'trial_exhausted';
        next_lock_reason := 'subscription_required';
        next_trial_ends_at := now();
        next_trial_credit_limit := 0;
    END IF;

    INSERT INTO public.organization_billing_accounts (
        organization_id,
        membership_state,
        lock_reason,
        trial_started_at,
        trial_ends_at,
        trial_credit_limit,
        trial_credit_used,
        monthly_package_credit_limit,
        monthly_package_credit_used,
        topup_credit_balance
    )
    VALUES (
        target_organization_id,
        next_membership_state,
        next_lock_reason,
        now(),
        next_trial_ends_at,
        next_trial_credit_limit,
        0,
        defaults_row.default_package_credits,
        0,
        0
    )
    ON CONFLICT (organization_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_trial_business_identity(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_org_trial_business_identity(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_org_trial_business_policy(UUID, TEXT, TEXT, TEXT) TO authenticated;
