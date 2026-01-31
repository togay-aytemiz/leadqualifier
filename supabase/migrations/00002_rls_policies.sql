-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper function: Get user's organizations
CREATE OR REPLACE FUNCTION get_user_organizations(user_uuid UUID)
RETURNS SETOF UUID AS $$
  SELECT organization_id FROM organization_members WHERE user_id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: Check if user is org member
CREATE OR REPLACE FUNCTION is_org_member(org_id UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members 
    WHERE organization_id = org_id AND user_id = user_uuid
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Helper function: Check if user is org admin/owner
CREATE OR REPLACE FUNCTION is_org_admin(org_id UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members 
    WHERE organization_id = org_id 
    AND user_id = user_uuid 
    AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Organizations policies
CREATE POLICY "Users can view their organizations" 
  ON organizations FOR SELECT 
  USING (id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Admins can update their organizations" 
  ON organizations FOR UPDATE 
  USING (is_org_admin(id, auth.uid()));

-- Organization members policies
CREATE POLICY "Users can view members of their organizations" 
  ON organization_members FOR SELECT 
  USING (organization_id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Admins can insert organization members" 
  ON organization_members FOR INSERT 
  WITH CHECK (is_org_admin(organization_id, auth.uid()));

CREATE POLICY "Admins can update organization members" 
  ON organization_members FOR UPDATE 
  USING (is_org_admin(organization_id, auth.uid()));

CREATE POLICY "Admins can delete organization members" 
  ON organization_members FOR DELETE 
  USING (is_org_admin(organization_id, auth.uid()));

-- Profiles policies
CREATE POLICY "Users can view their own profile" 
  ON profiles FOR SELECT 
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile" 
  ON profiles FOR UPDATE 
  USING (id = auth.uid());

CREATE POLICY "Profiles are created on signup" 
  ON profiles FOR INSERT 
  WITH CHECK (id = auth.uid());

-- Allow service role to bypass RLS for triggers
CREATE POLICY "Service role can manage all organizations"
  ON organizations FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all members"
  ON organization_members FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all profiles"
  ON profiles FOR ALL
  USING (auth.role() = 'service_role');
