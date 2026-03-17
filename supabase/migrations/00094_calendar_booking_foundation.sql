-- Calendar / booking foundation: org-level scheduling, internal bookings, and Google connection boundary.

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;

ALTER TABLE public.service_catalog
    ADD COLUMN IF NOT EXISTS duration_minutes INT,
    ADD COLUMN IF NOT EXISTS duration_updated_at TIMESTAMPTZ;

ALTER TABLE public.service_catalog
    ADD CONSTRAINT service_catalog_duration_minutes_check
    CHECK (duration_minutes IS NULL OR (duration_minutes > 0 AND duration_minutes <= 720));

CREATE TABLE IF NOT EXISTS public.booking_settings (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    booking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    default_booking_duration_minutes INT NOT NULL DEFAULT 60 CHECK (default_booking_duration_minutes > 0 AND default_booking_duration_minutes <= 720),
    slot_interval_minutes INT NOT NULL DEFAULT 30 CHECK (slot_interval_minutes > 0 AND slot_interval_minutes <= 180),
    minimum_notice_minutes INT NOT NULL DEFAULT 60 CHECK (minimum_notice_minutes >= 0 AND minimum_notice_minutes <= 10080),
    buffer_before_minutes INT NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0 AND buffer_before_minutes <= 180),
    buffer_after_minutes INT NOT NULL DEFAULT 0 CHECK (buffer_after_minutes >= 0 AND buffer_after_minutes <= 180),
    google_busy_overlay_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    google_write_through_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_booking_settings_updated_at
    BEFORE UPDATE ON public.booking_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.booking_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org booking settings"
    ON public.booking_settings FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Org admins can manage booking settings"
    ON public.booking_settings FOR ALL
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );

CREATE TABLE IF NOT EXISTS public.booking_availability_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_minute SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
    end_minute SMALLINT NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
    label TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_minute > start_minute)
);

CREATE UNIQUE INDEX IF NOT EXISTS booking_availability_rules_org_unique_window_idx
    ON public.booking_availability_rules (organization_id, day_of_week, start_minute, end_minute);

CREATE INDEX IF NOT EXISTS booking_availability_rules_org_day_idx
    ON public.booking_availability_rules (organization_id, day_of_week, active);

CREATE TRIGGER update_booking_availability_rules_updated_at
    BEFORE UPDATE ON public.booking_availability_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.booking_availability_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org booking availability rules"
    ON public.booking_availability_rules FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Org admins can manage booking availability rules"
    ON public.booking_availability_rules FOR ALL
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );

CREATE TABLE IF NOT EXISTS public.calendar_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google')),
    status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'pending', 'active', 'error')),
    sync_mode TEXT NOT NULL DEFAULT 'busy_overlay' CHECK (sync_mode IN ('busy_overlay', 'write_through')),
    external_account_id TEXT,
    external_account_email TEXT,
    primary_calendar_id TEXT,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    last_sync_at TIMESTAMPTZ,
    last_sync_status TEXT CHECK (last_sync_status IN ('ok', 'pending', 'error')),
    last_sync_error TEXT,
    connected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    connected_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, provider)
);

CREATE INDEX IF NOT EXISTS calendar_connections_org_status_idx
    ON public.calendar_connections (organization_id, status, provider);

CREATE TRIGGER update_calendar_connections_updated_at
    BEFORE UPDATE ON public.calendar_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org calendar connections"
    ON public.calendar_connections FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Org admins can manage calendar connections"
    ON public.calendar_connections FOR ALL
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );

CREATE TABLE IF NOT EXISTS private.calendar_connection_secrets (
    connection_id UUID PRIMARY KEY REFERENCES public.calendar_connections(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google')),
    access_token TEXT,
    refresh_token TEXT,
    token_type TEXT,
    expires_at TIMESTAMPTZ,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_calendar_connection_secrets_updated_at
    BEFORE UPDATE ON private.calendar_connection_secrets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

REVOKE ALL ON TABLE private.calendar_connection_secrets FROM PUBLIC;
REVOKE ALL ON TABLE private.calendar_connection_secrets FROM anon;
REVOKE ALL ON TABLE private.calendar_connection_secrets FROM authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT ALL ON TABLE private.calendar_connection_secrets TO service_role;

CREATE TABLE IF NOT EXISTS public.calendar_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    resource_key TEXT NOT NULL DEFAULT 'org:primary',
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    service_catalog_id UUID REFERENCES public.service_catalog(id) ON DELETE SET NULL,
    service_name_snapshot TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'canceled', 'completed', 'no_show')),
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'operator', 'ai')),
    channel TEXT CHECK (channel IS NULL OR channel IN ('whatsapp', 'telegram', 'instagram', 'simulator', 'manual')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    duration_minutes INT NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 720),
    duration_source TEXT NOT NULL CHECK (duration_source IN ('service_catalog', 'organization_default')),
    customer_name TEXT,
    customer_phone TEXT,
    provider TEXT CHECK (provider IS NULL OR provider IN ('google')),
    provider_connection_id UUID REFERENCES public.calendar_connections(id) ON DELETE SET NULL,
    provider_event_id TEXT,
    sync_status TEXT NOT NULL DEFAULT 'not_synced' CHECK (sync_status IN ('not_synced', 'pending', 'synced', 'error')),
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS calendar_bookings_org_time_idx
    ON public.calendar_bookings (organization_id, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS calendar_bookings_org_status_idx
    ON public.calendar_bookings (organization_id, status, starts_at);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_bookings_provider_event_idx
    ON public.calendar_bookings (provider_connection_id, provider_event_id)
    WHERE provider_connection_id IS NOT NULL AND provider_event_id IS NOT NULL;

ALTER TABLE public.calendar_bookings
    ADD CONSTRAINT calendar_bookings_no_overlap
    EXCLUDE USING gist (
        organization_id WITH =,
        resource_key WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
    )
    WHERE (status IN ('pending', 'confirmed'));

CREATE TRIGGER update_calendar_bookings_updated_at
    BEFORE UPDATE ON public.calendar_bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.calendar_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org calendar bookings"
    ON public.calendar_bookings FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

CREATE POLICY "Org members can manage calendar bookings"
    ON public.calendar_bookings FOR ALL
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    )
    WITH CHECK (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

INSERT INTO public.booking_settings (organization_id)
SELECT id
FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_default_booking_availability_rules(p_organization_id UUID)
RETURNS VOID AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.booking_availability_rules
        WHERE organization_id = p_organization_id
    ) THEN
        RETURN;
    END IF;

    INSERT INTO public.booking_availability_rules (
        organization_id,
        day_of_week,
        start_minute,
        end_minute,
        label,
        active
    )
    VALUES
        (p_organization_id, 1, 9 * 60, 18 * 60, 'Weekday', TRUE),
        (p_organization_id, 2, 9 * 60, 18 * 60, 'Weekday', TRUE),
        (p_organization_id, 3, 9 * 60, 18 * 60, 'Weekday', TRUE),
        (p_organization_id, 4, 9 * 60, 18 * 60, 'Weekday', TRUE),
        (p_organization_id, 5, 9 * 60, 18 * 60, 'Weekday', TRUE)
    ON CONFLICT (organization_id, day_of_week, start_minute, end_minute) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT public.seed_default_booking_availability_rules(id)
FROM public.organizations;

CREATE OR REPLACE FUNCTION public.handle_new_org_booking_foundation()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.booking_settings (organization_id)
    VALUES (NEW.id)
    ON CONFLICT (organization_id) DO NOTHING;

    PERFORM public.seed_default_booking_availability_rules(NEW.id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_organization_created_booking_foundation ON public.organizations;
CREATE TRIGGER on_organization_created_booking_foundation
    AFTER INSERT ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_org_booking_foundation();
