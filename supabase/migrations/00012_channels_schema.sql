-- Create channels table for integrations

CREATE TABLE public.channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('telegram', 'whatsapp')),
    name TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb, -- Stores decrypted tokens for MVP. Use Vault in prod.
    status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('active', 'disconnected', 'error')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    -- Enforce one active channel per type per org (optional, but good for MVP simplicity)
    UNIQUE(organization_id, type)
);

-- Enable RLS
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Org users can view channels (to see what's connected)
CREATE POLICY "Users can view org channels"
    ON channels FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

-- Only Org Admins can manage channels (connect/disconnect)
CREATE POLICY "Org admins can manage channels"
    ON channels FOR ALL
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );

-- Trigger for updated_at
CREATE TRIGGER update_channels_updated_at
    BEFORE UPDATE ON public.channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
