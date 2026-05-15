-- Add an editable default greeting skill for first-message and Telegram /start flows.

CREATE OR REPLACE FUNCTION public.seed_default_greeting_skill(
  target_organization_id UUID,
  requested_locale TEXT DEFAULT NULL
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_locale TEXT;
BEGIN
  normalized_locale := LOWER(COALESCE(NULLIF(requested_locale, ''), 'tr'));

  IF normalized_locale LIKE 'tr%' THEN
    normalized_locale := 'tr';
  ELSE
    normalized_locale := 'en';
  END IF;

  INSERT INTO public.skills (
    organization_id,
    title,
    trigger_examples,
    response_text,
    enabled,
    requires_human_handover
  )
  SELECT
    target_organization_id,
    template.title,
    template.trigger_examples,
    template.response_text,
    TRUE,
    FALSE
  FROM (
    VALUES
      (
        CASE WHEN normalized_locale = 'tr' THEN 'Karşılama ve İlk Mesaj' ELSE 'Greeting and First Message' END,
        CASE
          WHEN normalized_locale = 'tr' THEN ARRAY[
            '/start',
            'Merhaba',
            'Selam',
            'İyi günler',
            'Bilgi almak istiyorum'
          ]::TEXT[]
          ELSE ARRAY[
            '/start',
            'Hello',
            'Hi',
            'Good day',
            'I would like to get information'
          ]::TEXT[]
        END,
        CASE
          WHEN normalized_locale = 'tr'
            THEN 'Merhaba, yardımcı olayım. Hangi konuda bilgi almak istersiniz?'
          ELSE 'Hello, I can help. What would you like to know?'
        END
      )
  ) AS template(title, trigger_examples, response_text)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.skills AS existing_skill
    WHERE existing_skill.organization_id = target_organization_id
      AND existing_skill.title = template.title
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.handle_new_org_owner_default_skills()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_locale TEXT;
BEGIN
  IF NEW.role <> 'owner' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(
    NULLIF(LOWER(COALESCE(auth_user.raw_user_meta_data->>'locale', '')), ''),
    CASE WHEN organizations.billing_region = 'INTL' THEN 'en' ELSE 'tr' END,
    'tr'
  )
  INTO owner_locale
  FROM public.organizations
  LEFT JOIN auth.users AS auth_user
    ON auth_user.id = NEW.user_id
  WHERE organizations.id = NEW.organization_id;

  PERFORM public.seed_default_system_skills(NEW.organization_id, owner_locale);
  PERFORM public.seed_default_greeting_skill(NEW.organization_id, owner_locale);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  existing_org RECORD;
BEGIN
  FOR existing_org IN
    SELECT DISTINCT ON (organizations.id)
      organizations.id AS organization_id,
      COALESCE(
        NULLIF(LOWER(COALESCE(auth_user.raw_user_meta_data->>'locale', '')), ''),
        CASE WHEN organizations.billing_region = 'INTL' THEN 'en' ELSE 'tr' END,
        'tr'
      ) AS requested_locale
    FROM public.organizations
    LEFT JOIN public.organization_members
      ON organization_members.organization_id = organizations.id
     AND organization_members.role = 'owner'
    LEFT JOIN auth.users AS auth_user
      ON auth_user.id = organization_members.user_id
    ORDER BY organizations.id, organization_members.created_at ASC NULLS LAST, organization_members.id ASC NULLS LAST
  LOOP
    PERFORM public.seed_default_greeting_skill(
      existing_org.organization_id,
      existing_org.requested_locale
    );
  END LOOP;
END;
$$;
