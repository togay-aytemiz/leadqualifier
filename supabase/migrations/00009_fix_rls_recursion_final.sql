-- Fix RLS recursion by using SECURITY DEFINER function for admin check

-- Double check the function exists and is SECURITY DEFINER protection
CREATE OR REPLACE FUNCTION public.is_system_admin_secure()
RETURNS BOOLEAN 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND is_system_admin = true
  );
END;
$$ LANGUAGE plpgsql;

-- Update Policies to use the secure function

-- 1. Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" 
  ON profiles FOR SELECT 
  USING (
    id = auth.uid()
    OR is_system_admin_secure()
  );

DROP POLICY IF EXISTS "System admins can manage all profiles" ON profiles;
CREATE POLICY "System admins can manage all profiles" 
  ON profiles FOR ALL 
  USING (is_system_admin_secure());

-- 2. Organizations
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;
CREATE POLICY "Users can view their organizations" 
  ON organizations FOR SELECT 
  USING (
    id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

DROP POLICY IF EXISTS "System admins can manage all organizations" ON organizations;
CREATE POLICY "System admins can manage all organizations" 
  ON organizations FOR ALL 
  USING (is_system_admin_secure());

-- 3. Organization Members
DROP POLICY IF EXISTS "Users can view their org members" ON organization_members;
CREATE POLICY "Users can view their org members" 
  ON organization_members FOR SELECT 
  USING (
    user_id = auth.uid() 
    OR organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

DROP POLICY IF EXISTS "System admins can manage all org members" ON organization_members;
CREATE POLICY "System admins can manage all org members" 
  ON organization_members FOR ALL 
  USING (is_system_admin_secure());

-- 4. Skills
DROP POLICY IF EXISTS "Users can view their org skills" ON skills;
CREATE POLICY "Users can view their org skills" 
  ON skills FOR SELECT 
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

DROP POLICY IF EXISTS "System admins can manage all skills" ON skills;
CREATE POLICY "System admins can manage all skills" 
  ON skills FOR ALL 
  USING (is_system_admin_secure());

-- 5. Skill Embeddings
DROP POLICY IF EXISTS "Users can view skill embeddings for their org" ON skill_embeddings;
CREATE POLICY "Users can view skill embeddings for their org" 
  ON skill_embeddings FOR SELECT 
  USING (
    skill_id IN (SELECT id FROM skills WHERE organization_id IN (SELECT get_user_organizations(auth.uid())))
    OR is_system_admin_secure()
  );

DROP POLICY IF EXISTS "System admins can manage all skill embeddings" ON skill_embeddings;
CREATE POLICY "System admins can manage all skill embeddings" 
  ON skill_embeddings FOR ALL 
  USING (is_system_admin_secure());
