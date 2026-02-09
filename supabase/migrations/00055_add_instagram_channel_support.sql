-- Add Instagram as a first-class channel/platform

ALTER TABLE public.channels
DROP CONSTRAINT IF EXISTS channels_type_check;

ALTER TABLE public.channels
ADD CONSTRAINT channels_type_check
CHECK (type IN ('telegram', 'whatsapp', 'instagram'));

ALTER TABLE public.conversations
DROP CONSTRAINT IF EXISTS conversations_platform_check;

ALTER TABLE public.conversations
ADD CONSTRAINT conversations_platform_check
CHECK (platform IN ('whatsapp', 'telegram', 'instagram', 'simulator'));
