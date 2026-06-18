ALTER TABLE public.demo_chat_channels
    ADD COLUMN IF NOT EXISTS maintenance_enabled boolean NOT NULL DEFAULT false;;
