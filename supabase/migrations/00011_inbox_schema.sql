-- Create tables for Inbox feature

-- Create conversations table
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    contact_name TEXT NOT NULL,
    contact_phone TEXT, -- Can be null for simulator
    platform TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram', 'simulator')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'snoozed')),
    assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ DEFAULT now(),
    unread_count INTEGER DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create messages table
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'contact', 'system', 'bot')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb, -- Store confidence scores, matched skill IDs here
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Add RLS Policies for Conversations

-- Org members can view conversations of their org
CREATE POLICY "Users can view org conversations"
    ON conversations FOR SELECT
    USING (
        organization_id IN (SELECT get_user_organizations(auth.uid()))
        OR is_system_admin_secure()
    );

-- Org admins can insert/update/delete conversations
CREATE POLICY "Org admins can manage conversations"
    ON conversations FOR ALL
    USING (
        is_org_admin(organization_id, auth.uid())
        OR is_system_admin_secure()
    );

-- Add RLS Policies for Messages

-- Users can view messages of conversations they can access
CREATE POLICY "Users can view messages"
    ON messages FOR SELECT
    USING (
        conversation_id IN (
            SELECT id FROM conversations 
            WHERE organization_id IN (SELECT get_user_organizations(auth.uid()))
        )
        OR is_system_admin_secure()
    );

-- Org admins can manage messages
CREATE POLICY "Org admins can manage messages"
    ON messages FOR ALL
    USING (
        conversation_id IN (
            SELECT id FROM conversations 
            WHERE is_org_admin(organization_id, auth.uid())
        )
        OR is_system_admin_secure()
    );

-- Triggers for updated_at
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
