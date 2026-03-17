-- Replace booking availability rules atomically so failed writes do not leave an organization without availability windows.

CREATE OR REPLACE FUNCTION public.replace_booking_availability_rules(
    p_organization_id UUID,
    p_rules JSONB DEFAULT '[]'::jsonb
)
RETURNS SETOF public.booking_availability_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_organization_id IS NULL THEN
        RAISE EXCEPTION 'Organization is required';
    END IF;

    IF p_rules IS NULL THEN
        p_rules := '[]'::jsonb;
    END IF;

    IF jsonb_typeof(p_rules) <> 'array' THEN
        RAISE EXCEPTION 'Rules payload must be a JSON array';
    END IF;

    PERFORM public.assert_org_member_or_admin(p_organization_id);

    DELETE FROM public.booking_availability_rules
    WHERE organization_id = p_organization_id;

    INSERT INTO public.booking_availability_rules (
        organization_id,
        day_of_week,
        start_minute,
        end_minute,
        label,
        active
    )
    SELECT
        p_organization_id,
        rule.day_of_week,
        rule.start_minute,
        rule.end_minute,
        rule.label,
        COALESCE(rule.active, TRUE)
    FROM jsonb_to_recordset(p_rules) AS rule(
        day_of_week SMALLINT,
        start_minute SMALLINT,
        end_minute SMALLINT,
        label TEXT,
        active BOOLEAN
    );

    RETURN QUERY
    SELECT *
    FROM public.booking_availability_rules
    WHERE organization_id = p_organization_id
    ORDER BY day_of_week, start_minute, end_minute;
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_booking_availability_rules(UUID, JSONB) TO authenticated;
