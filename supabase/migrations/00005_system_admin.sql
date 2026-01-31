-- Add system admin flag to profiles
ALTER TABLE profiles ADD COLUMN is_system_admin BOOLEAN NOT NULL DEFAULT false;

-- Update RLS policies to allow system admins full access

-- Organizations: System admins can see all
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;
CREATE POLICY "Users can view their organizations" 
  ON organizations FOR SELECT 
  USING (
    id IN (SELECT get_user_organizations(auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true)
  );

-- System admins can manage all organizations
CREATE POLICY "System admins can manage all organizations" 
  ON organizations FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true));

-- Organization members: System admins can see all
DROP POLICY IF EXISTS "Users can view their org members" ON organization_members;
CREATE POLICY "Users can view their org members" 
  ON organization_members FOR SELECT 
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true)
  );

CREATE POLICY "System admins can manage all org members" 
  ON organization_members FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true));

-- Profiles: System admins can see all profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" 
  ON profiles FOR SELECT 
  USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true)
  );

CREATE POLICY "System admins can manage all profiles" 
  ON profiles FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true));

-- Skills: System admins can see all
DROP POLICY IF EXISTS "Users can view their org skills" ON skills;
CREATE POLICY "Users can view their org skills" 
  ON skills FOR SELECT 
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true)
  );

CREATE POLICY "System admins can manage all skills" 
  ON skills FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true));

-- Skill embeddings: System admins can see all
DROP POLICY IF EXISTS "Users can view skill embeddings for their org" ON skill_embeddings;
CREATE POLICY "Users can view skill embeddings for their org" 
  ON skill_embeddings FOR SELECT 
  USING (
    skill_id IN (SELECT id FROM skills WHERE organization_id IN (SELECT get_user_organizations(auth.uid())))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true)
  );

CREATE POLICY "System admins can manage all skill embeddings" 
  ON skill_embeddings FOR ALL 
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true));

-- Helper function to check if user is system admin
CREATE OR REPLACE FUNCTION is_system_admin(user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_system_admin FROM profiles WHERE id = user_id),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER;
