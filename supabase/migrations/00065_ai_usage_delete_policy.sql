-- Allow org admins to remove AI usage rows during self-service contact deletion.
DROP POLICY IF EXISTS "Org admins can delete ai usage" ON public.organization_ai_usage;

CREATE POLICY "Org admins can delete ai usage"
    ON public.organization_ai_usage FOR DELETE
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );
