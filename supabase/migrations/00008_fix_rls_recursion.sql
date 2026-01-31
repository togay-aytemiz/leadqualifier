-- Fix RLS policies to prevent recursion and ensure visibility of own data

-- 1. Organization Members: Explicitly allow seeing your own membership
DROP POLICY IF EXISTS "Users can view their org members" ON organization_members;
CREATE POLICY "Users can view their org members" 
  ON organization_members FOR SELECT 
  USING (
    user_id = auth.uid() -- Always allow seeing your own membership
    OR organization_id IN (SELECT get_user_organizations(auth.uid())) -- Allow seeing others in your orgs
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true) -- Admin override
  );

-- 2. Organizations: Ensure recursive check is safe
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;
CREATE POLICY "Users can view their organizations" 
  ON organizations FOR SELECT 
  USING (
    id IN (SELECT get_user_organizations(auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true)
  );

-- 3. Re-verify profiles (just to be safe)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" 
  ON profiles FOR SELECT 
  USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true)
  );
