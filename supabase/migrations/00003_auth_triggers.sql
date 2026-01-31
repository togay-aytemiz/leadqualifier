-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-create organization on first signup
CREATE OR REPLACE FUNCTION handle_new_user_org()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  org_name TEXT;
  org_slug TEXT;
BEGIN
  -- Generate org name from company_name or email
  org_name := COALESCE(
    NEW.raw_user_meta_data->>'company_name',
    SPLIT_PART(NEW.email, '@', 1) || '''s Organization'
  );
  
  -- Generate unique slug from user id
  org_slug := LOWER(REPLACE(NEW.id::text, '-', ''));
  
  -- Create default organization for new user
  INSERT INTO public.organizations (name, slug)
  VALUES (org_name, org_slug)
  RETURNING id INTO new_org_id;
  
  -- Add user as owner
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_org
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_org();
