-- Calendar booking capacity: replace hard no-overlap with org-level concurrent capacity.

ALTER TABLE public.booking_settings
    ADD COLUMN IF NOT EXISTS max_concurrent_bookings INT NOT NULL DEFAULT 1;

UPDATE public.booking_settings
SET max_concurrent_bookings = 1
WHERE max_concurrent_bookings IS NULL;

ALTER TABLE public.booking_settings
    DROP CONSTRAINT IF EXISTS booking_settings_max_concurrent_bookings_check;

ALTER TABLE public.booking_settings
    ADD CONSTRAINT booking_settings_max_concurrent_bookings_check
    CHECK (max_concurrent_bookings >= 1 AND max_concurrent_bookings <= 50);

CREATE INDEX IF NOT EXISTS calendar_bookings_org_active_time_idx
    ON public.calendar_bookings (organization_id, starts_at, ends_at)
    WHERE status IN ('pending', 'confirmed');

CREATE OR REPLACE FUNCTION public.enforce_calendar_booking_capacity()
RETURNS TRIGGER AS $$
DECLARE
    v_max_concurrent INT;
    v_buffer_before INT;
    v_buffer_after INT;
    v_new_occupied_start TIMESTAMPTZ;
    v_new_occupied_end TIMESTAMPTZ;
    v_peak_existing_overlap INT;
BEGIN
    IF NEW.status NOT IN ('pending', 'confirmed') THEN
        RETURN NEW;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text, 0));

    SELECT
        COALESCE(max_concurrent_bookings, 1),
        COALESCE(buffer_before_minutes, 0),
        COALESCE(buffer_after_minutes, 0)
    INTO v_max_concurrent, v_buffer_before, v_buffer_after
    FROM public.booking_settings
    WHERE organization_id = NEW.organization_id;

    v_max_concurrent := COALESCE(v_max_concurrent, 1);
    v_buffer_before := COALESCE(v_buffer_before, 0);
    v_buffer_after := COALESCE(v_buffer_after, 0);
    v_new_occupied_start := NEW.starts_at - make_interval(mins => v_buffer_before);
    v_new_occupied_end := NEW.ends_at + make_interval(mins => v_buffer_after);

    WITH existing AS (
        SELECT
            starts_at - make_interval(mins => v_buffer_before) AS occupied_start,
            ends_at + make_interval(mins => v_buffer_after) AS occupied_end
        FROM public.calendar_bookings
        WHERE organization_id = NEW.organization_id
            AND status IN ('pending', 'confirmed')
            AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
            AND starts_at - make_interval(mins => v_buffer_before) < v_new_occupied_end
            AND ends_at + make_interval(mins => v_buffer_after) > v_new_occupied_start
            AND tstzrange(
                starts_at - make_interval(mins => v_buffer_before),
                ends_at + make_interval(mins => v_buffer_after),
                '[)'
            ) && tstzrange(v_new_occupied_start, v_new_occupied_end, '[)')
    ),
    check_points AS (
        SELECT v_new_occupied_start AS check_point
        UNION
        SELECT occupied_start
        FROM existing
        WHERE occupied_start >= v_new_occupied_start
            AND occupied_start < v_new_occupied_end
    ),
    counts AS (
        SELECT (
            SELECT COUNT(*)
            FROM existing
            WHERE occupied_start <= check_point
                AND check_point < occupied_end
        ) AS active_existing_count
        FROM check_points
    )
    SELECT COALESCE(MAX(active_existing_count), 0)
    INTO v_peak_existing_overlap
    FROM counts;

    IF v_peak_existing_overlap >= v_max_concurrent THEN
        RAISE EXCEPTION 'Booking capacity exceeded'
            USING ERRCODE = '23P01';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE public.calendar_bookings
    DROP CONSTRAINT IF EXISTS calendar_bookings_no_overlap;

DROP TRIGGER IF EXISTS enforce_calendar_booking_capacity_trigger ON public.calendar_bookings;
CREATE TRIGGER enforce_calendar_booking_capacity_trigger
    BEFORE INSERT OR UPDATE OF organization_id, starts_at, ends_at, status
    ON public.calendar_bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_calendar_booking_capacity();
