UPDATE storage.buckets
SET
    public = TRUE,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY[
        'image/jpeg',
        'image/webp'
    ]
WHERE id = 'skill-images';
