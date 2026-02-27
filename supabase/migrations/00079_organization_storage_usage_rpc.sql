-- Organization-level storage usage aggregation helper.
-- Combines Skills + Knowledge text footprint and WhatsApp media object sizes.

CREATE OR REPLACE FUNCTION public.get_organization_storage_usage(
    target_organization_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
    organization_id UUID,
    skill_count BIGINT,
    knowledge_document_count BIGINT,
    skills_bytes BIGINT,
    knowledge_bytes BIGINT,
    whatsapp_media_object_count BIGINT,
    whatsapp_media_bytes BIGINT,
    total_bytes BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
    allowed_ids UUID[];
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF is_system_admin_secure() THEN
        IF target_organization_ids IS NULL OR array_length(target_organization_ids, 1) IS NULL THEN
            SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
            INTO allowed_ids
            FROM public.organizations;
        ELSE
            allowed_ids := target_organization_ids;
        END IF;
    ELSE
        IF target_organization_ids IS NULL OR array_length(target_organization_ids, 1) IS NULL THEN
            SELECT COALESCE(array_agg(org_id), ARRAY[]::UUID[])
            INTO allowed_ids
            FROM unnest(get_user_organizations(auth.uid())) AS org_id;
        ELSE
            SELECT COALESCE(array_agg(requested_id), ARRAY[]::UUID[])
            INTO allowed_ids
            FROM unnest(target_organization_ids) AS requested_id
            WHERE requested_id = ANY(get_user_organizations(auth.uid()));
        END IF;
    END IF;

    IF allowed_ids IS NULL OR array_length(allowed_ids, 1) IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH target_orgs AS (
        SELECT DISTINCT unnest(allowed_ids) AS organization_id
    ),
    skills_agg AS (
        SELECT
            skills.organization_id,
            COUNT(*)::BIGINT AS skill_count,
            COALESCE(SUM(
                octet_length(COALESCE(skills.title, ''))
                + octet_length(COALESCE(skills.response_text, ''))
                + COALESCE(
                    (
                        SELECT SUM(octet_length(trigger_value))
                        FROM unnest(COALESCE(skills.trigger_examples, ARRAY[]::TEXT[])) AS trigger_value
                    ),
                    0
                )
            ), 0)::BIGINT AS skills_bytes
        FROM public.skills
        INNER JOIN target_orgs
            ON target_orgs.organization_id = skills.organization_id
        GROUP BY skills.organization_id
    ),
    knowledge_agg AS (
        SELECT
            knowledge_documents.organization_id,
            COUNT(*)::BIGINT AS knowledge_document_count,
            COALESCE(SUM(
                octet_length(COALESCE(knowledge_documents.title, ''))
                + octet_length(COALESCE(knowledge_documents.content, ''))
            ), 0)::BIGINT AS knowledge_bytes
        FROM public.knowledge_documents
        INNER JOIN target_orgs
            ON target_orgs.organization_id = knowledge_documents.organization_id
        GROUP BY knowledge_documents.organization_id
    ),
    media_agg AS (
        SELECT
            target_orgs.organization_id,
            COUNT(*)::BIGINT AS whatsapp_media_object_count,
            COALESCE(SUM(
                CASE
                    WHEN (objects.metadata->>'size') ~ '^[0-9]+$' THEN (objects.metadata->>'size')::BIGINT
                    ELSE 0
                END
            ), 0)::BIGINT AS whatsapp_media_bytes
        FROM target_orgs
        INNER JOIN storage.objects
            ON objects.bucket_id = 'whatsapp-media'
            AND objects.name LIKE target_orgs.organization_id::TEXT || '/%'
        GROUP BY target_orgs.organization_id
    )
    SELECT
        target_orgs.organization_id,
        COALESCE(skills_agg.skill_count, 0)::BIGINT AS skill_count,
        COALESCE(knowledge_agg.knowledge_document_count, 0)::BIGINT AS knowledge_document_count,
        COALESCE(skills_agg.skills_bytes, 0)::BIGINT AS skills_bytes,
        COALESCE(knowledge_agg.knowledge_bytes, 0)::BIGINT AS knowledge_bytes,
        COALESCE(media_agg.whatsapp_media_object_count, 0)::BIGINT AS whatsapp_media_object_count,
        COALESCE(media_agg.whatsapp_media_bytes, 0)::BIGINT AS whatsapp_media_bytes,
        (
            COALESCE(skills_agg.skills_bytes, 0)
            + COALESCE(knowledge_agg.knowledge_bytes, 0)
            + COALESCE(media_agg.whatsapp_media_bytes, 0)
        )::BIGINT AS total_bytes
    FROM target_orgs
    LEFT JOIN skills_agg
        ON skills_agg.organization_id = target_orgs.organization_id
    LEFT JOIN knowledge_agg
        ON knowledge_agg.organization_id = target_orgs.organization_id
    LEFT JOIN media_agg
        ON media_agg.organization_id = target_orgs.organization_id
    ORDER BY target_orgs.organization_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_storage_usage(UUID[]) TO authenticated;
