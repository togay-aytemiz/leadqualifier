-- Permission Fix: Allow Organization Members to Message & Update Conversations
-- Previously, only Admin/Owners had INSERT/UPDATE rights, causing "Unassigned" issues and "Message Send Failures" for regular members.

-- 1. CONVERSATIONS: Allow members to UPDATE (e.g. claim assignee, read status)
CREATE POLICY "Org members can update conversations"
    ON public.conversations FOR UPDATE
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

-- 2. MESSAGES: Allow members to INSERT (send messages)
CREATE POLICY "Org members can insert messages"
    ON public.messages FOR INSERT
    WITH CHECK (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

-- Note: we use `organization_id` check. Since `messages` table now has `organization_id` (mig 00016), this is robust.
