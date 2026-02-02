-- EMERGENCY FIX: Restore RLS policies to use SECURITY DEFINER functions.
-- The previous attempt failed because inline generic queries cannot access RLS-protected tables like 'organization_members' without recursion/blocking.
-- `get_user_organizations` is SECURITY DEFINER, so it safely bypasses this.

-- 1. Drop broken policies
DROP POLICY IF EXISTS "Users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Org admins can manage messages" ON public.messages;

-- 2. Restore View Policy (Users can see messages if they belong to the org)
CREATE POLICY "Users can view messages"
    ON public.messages FOR SELECT
    USING (
        organization_id IN (
            SELECT get_user_organizations(auth.uid())
        )
        OR is_system_admin_secure()
    );

-- 3. Restore Manage Policy (Admins can manage messages for their org)
CREATE POLICY "Org admins can manage messages"
    ON public.messages FOR ALL
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );

-- 4. Ensure RLS is enabled (just in case)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
