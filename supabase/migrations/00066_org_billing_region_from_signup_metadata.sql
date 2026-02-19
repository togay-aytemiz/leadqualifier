-- Persist organization billing_region from signup metadata when auto-creating orgs.

CREATE OR REPLACE FUNCTION handle_new_user_org()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  org_slug TEXT;
  org_billing_region TEXT;
BEGIN
  -- Generate org name from company_name or email.
  org_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'company_name', ''),
    SPLIT_PART(NEW.email, '@', 1) || '''s Organization'
  );

  -- Generate unique slug from user id.
  org_slug := LOWER(REPLACE(NEW.id::text, '-', ''));

  -- Read and normalize billing region from signup metadata.
  org_billing_region := UPPER(COALESCE(NULLIF(NEW.raw_user_meta_data->>'billing_region', ''), 'TR'));
  IF org_billing_region NOT IN ('TR', 'INTL') THEN
    org_billing_region := 'TR';
  END IF;

  -- Create default organization for new user.
  INSERT INTO public.organizations (name, slug, billing_region)
  VALUES (org_name, org_slug, org_billing_region)
  RETURNING id INTO new_org_id;

  -- Add user as owner.
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail user creation.
  RAISE WARNING 'Error creating org for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
