ALTER TABLE public.skills
    ADD COLUMN IF NOT EXISTS image_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS image_public_url TEXT,
    ADD COLUMN IF NOT EXISTS image_mime_type TEXT,
    ADD COLUMN IF NOT EXISTS image_width INTEGER,
    ADD COLUMN IF NOT EXISTS image_height INTEGER,
    ADD COLUMN IF NOT EXISTS image_size_bytes INTEGER,
    ADD COLUMN IF NOT EXISTS image_original_filename TEXT,
    ADD COLUMN IF NOT EXISTS image_updated_at TIMESTAMPTZ;

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'skill-images',
    'skill-images',
    TRUE,
    5242880,
    ARRAY[
        'image/webp'
    ]
)
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
