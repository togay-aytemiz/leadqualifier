-- Seed minimal default system skills when an organization gets its owner
-- membership, and backfill organizations that predate create-time seeding.

CREATE OR REPLACE FUNCTION public.seed_default_system_skills(
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

  IF normalized_locale = 'tr' THEN
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
      TRUE
    FROM (
      VALUES
        (
          'İnsan Desteği Talebi',
          ARRAY[
            'Beni bir insana bağlar mısınız?',
            'Müşteri temsilcisi ile görüşmek istiyorum',
            'Yetkili biriyle konuşabilir miyim?'
          ]::TEXT[],
          'Tabii, sizi hemen ekibimizden bir uzmana aktarıyorum.'
        ),
        (
          'Şikayet ve Memnuniyetsizlik',
          ARRAY[
            'Şikayetim var',
            'Hizmetten memnun kalmadım',
            'Bu konuda destek istiyorum'
          ]::TEXT[],
          'Yaşadığınız olumsuz deneyim için üzgünüz. Konuyu hemen ekibimize iletiyorum.'
        ),
        (
          'Acil Talep',
          ARRAY[
            'Acil dönüş yapabilir misiniz?',
            'Bu konu çok acil',
            'Hemen birine bağlayın'
          ]::TEXT[],
          'Acil talebinizi aldım. Sizi hemen ilgili ekibimize aktarıyorum.'
        ),
        (
          'Gizlilik ve Veri Talebi',
          ARRAY[
            'Verilerimi silmek istiyorum',
            'Mesaj iznimi geri çekiyorum',
            'Gizlilik konusunda biriyle görüşmek istiyorum'
          ]::TEXT[],
          'Gizlilik ve veri talebinizi aldım. İşlem için sizi hemen ekibimize aktarıyorum.'
        )
    ) AS template(title, trigger_examples, response_text)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.skills AS existing_skill
      WHERE existing_skill.organization_id = target_organization_id
        AND existing_skill.title = template.title
    );
  ELSE
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
      TRUE
    FROM (
      VALUES
        (
          'Request Human Support',
          ARRAY[
            'Can I talk to a human?',
            'I want to speak with an agent',
            'Please connect me to support'
          ]::TEXT[],
          'Sure, I am connecting you to our team right away.'
        ),
        (
          'Complaint and Dissatisfaction',
          ARRAY[
            'I have a complaint',
            'I am not happy with the service',
            'I need support for this issue'
          ]::TEXT[],
          'I am sorry about your experience. I am escalating this to our team now.'
        ),
        (
          'Urgent Request',
          ARRAY[
            'This is urgent',
            'Please get back to me urgently',
            'Connect me to someone immediately'
          ]::TEXT[],
          'I have received your urgent request. I am escalating it to our team now.'
        ),
        (
          'Privacy and Data Request',
          ARRAY[
            'I want my data deleted',
            'I withdraw my messaging consent',
            'I need to discuss privacy'
          ]::TEXT[],
          'I have received your privacy and data request. I am escalating it to our team now.'
        )
    ) AS template(title, trigger_examples, response_text)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.skills AS existing_skill
      WHERE existing_skill.organization_id = target_organization_id
        AND existing_skill.title = template.title
    );
  END IF;
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_organization_owner_created_seed_default_skills ON public.organization_members;

CREATE TRIGGER on_organization_owner_created_seed_default_skills
  AFTER INSERT ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_org_owner_default_skills();

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
    PERFORM public.seed_default_system_skills(
      existing_org.organization_id,
      existing_org.requested_locale
    );
  END LOOP;
END;
$$;
