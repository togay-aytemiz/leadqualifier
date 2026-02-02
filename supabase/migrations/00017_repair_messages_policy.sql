-- Repair RLS policies for messages by using direct table lookup instead of helper function
-- This avoids potential function permission/search_path issues

DROP POLICY IF EXISTS "Users can view messages" ON public.messages;
DROP POLICY IF EXISTS "Org admins can manage messages" ON public.messages;

-- Users can view messages using direct table lookup
CREATE POLICY "Users can view messages"
    ON public.messages FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM public.organization_members 
            WHERE user_id = auth.uid()
        )
        OR is_system_admin_secure()
    );

-- Org admins can manage messages using direct lookup
CREATE POLICY "Org admins can manage messages"
    ON public.messages FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id 
            FROM public.organization_members 
            WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin')
        )
        OR is_system_admin_secure()
    );
