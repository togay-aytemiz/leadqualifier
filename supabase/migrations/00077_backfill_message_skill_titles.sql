-- Backfill bot message skill title metadata for historical rows that only stored skill_id.
-- This prevents Inbox skill badges from showing UUID-like identifiers.

WITH target_messages AS (
  SELECT
    m.id,
    s.title AS skill_title
  FROM public.messages m
  JOIN public.skills s
    ON s.id = CASE
      WHEN (m.metadata->>'skill_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (m.metadata->>'skill_id')::uuid
      ELSE NULL
    END
  WHERE m.sender_type = 'bot'
    AND m.metadata IS NOT NULL
    AND (
      NULLIF(BTRIM(m.metadata->>'skill_title'), '') IS NULL
      OR NULLIF(BTRIM(m.metadata->>'matched_skill_title'), '') IS NULL
    )
)
UPDATE public.messages AS m
SET metadata = jsonb_set(
  jsonb_set(
    COALESCE(m.metadata, '{}'::jsonb),
    '{skill_title}',
    to_jsonb(t.skill_title),
    true
  ),
  '{matched_skill_title}',
  to_jsonb(t.skill_title),
  true
)
FROM target_messages t
WHERE m.id = t.id;
