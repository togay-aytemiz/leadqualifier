-- Fix duplicate RLS policies due to name mismatch

-- Drop the incorrectly named old policy (from 00002)
DROP POLICY IF EXISTS "Users can view members of their organizations" ON organization_members;

-- Ensure the replacement policy (from 00005) is correct
DROP POLICY IF EXISTS "Users can view their org members" ON organization_members;
CREATE POLICY "Users can view their org members" 
  ON organization_members FOR SELECT 
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true)
  );

-- Fix profiles policies if any duplicate exists
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles; -- From 00002
DROP POLICY IF EXISTS "Users can view own profile" ON profiles; -- From 00005 match?

-- Re-create the comprehensive profile policy
CREATE POLICY "Users can view own profile" 
  ON profiles FOR SELECT 
  USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_system_admin = true)
  );
