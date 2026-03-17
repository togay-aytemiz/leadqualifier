ALTER TABLE public.calendar_bookings
    ADD COLUMN IF NOT EXISTS customer_email TEXT;

ALTER TABLE public.calendar_bookings
    DROP CONSTRAINT IF EXISTS calendar_bookings_duration_source_check;

ALTER TABLE public.calendar_bookings
    ADD CONSTRAINT calendar_bookings_duration_source_check
    CHECK (duration_source IN ('service_catalog', 'organization_default', 'manual_override'));
