-- New workspaces should explicitly enable booking before Qualy suggests or creates appointments.

ALTER TABLE public.booking_settings
    ALTER COLUMN booking_enabled SET DEFAULT FALSE;
