-- Allow organization admins and system admins to manage skills and embeddings

-- Ensure is_org_admin is available and secure
CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID, user_uuid UUID)
RETURNS BOOLEAN 
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members 
    WHERE organization_id = org_id 
    AND user_id = user_uuid 
    AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql;

-- SKILLS: Policies for Insert, Update, Delete

CREATE POLICY "Org admins can insert skills" 
  ON skills FOR INSERT 
  WITH CHECK (
    is_org_admin(organization_id, auth.uid()) 
    OR is_system_admin_secure()
  );

CREATE POLICY "Org admins can update skills" 
  ON skills FOR UPDATE 
  USING (
    is_org_admin(organization_id, auth.uid()) 
    OR is_system_admin_secure()
  );

CREATE POLICY "Org admins can delete skills" 
  ON skills FOR DELETE 
  USING (
    is_org_admin(organization_id, auth.uid()) 
    OR is_system_admin_secure()
  );

-- SKILL EMBEDDINGS: Policies for Insert, Update, Delete

CREATE POLICY "Org admins can insert skill embeddings" 
  ON skill_embeddings FOR INSERT 
  WITH CHECK (
    skill_id IN (
        SELECT id FROM skills 
        WHERE is_org_admin(organization_id, auth.uid()) 
        OR is_system_admin_secure()
    )
  );

CREATE POLICY "Org admins can update skill embeddings" 
  ON skill_embeddings FOR UPDATE 
  USING (
    skill_id IN (
        SELECT id FROM skills 
        WHERE is_org_admin(organization_id, auth.uid()) 
        OR is_system_admin_secure()
    )
  );

CREATE POLICY "Org admins can delete skill embeddings" 
  ON skill_embeddings FOR DELETE 
  USING (
    skill_id IN (
        SELECT id FROM skills 
        WHERE is_org_admin(organization_id, auth.uid()) 
        OR is_system_admin_secure()
    )
  );
