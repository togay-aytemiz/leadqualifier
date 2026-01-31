export type UserRole = 'owner' | 'admin' | 'member'

export interface Organization {
    id: string
    name: string
    slug: string
    created_at: string
    updated_at: string
}

export interface OrganizationMember {
    id: string
    organization_id: string
    user_id: string
    role: UserRole
    created_at: string
}

export interface Profile {
    id: string
    email: string
    full_name: string | null
    avatar_url: string | null
    is_system_admin: boolean
    created_at: string
    updated_at: string
}

// Extended types with relations
export interface OrganizationWithMembers extends Organization {
    members: OrganizationMember[]
}

export interface ProfileWithOrganizations extends Profile {
    organizations: Organization[]
}

// Skill types
export interface Skill {
    id: string
    organization_id: string
    title: string
    trigger_examples: string[]
    response_text: string
    enabled: boolean
    created_at: string
    updated_at: string
}

export interface SkillEmbedding {
    id: string
    skill_id: string
    trigger_text: string
    embedding: number[] | null
    created_at: string
}

export interface SkillMatch {
    skill_id: string
    title: string
    response_text: string
    trigger_text: string
    similarity: number
}

// Inbox Types
export type ConversationPlatform = 'whatsapp' | 'telegram' | 'simulator'
export type ConversationStatus = 'open' | 'closed' | 'snoozed'
export type MessageSenderType = 'user' | 'contact' | 'system' | 'bot'

export interface Conversation {
    id: string
    organization_id: string
    contact_name: string
    contact_phone: string | null
    platform: ConversationPlatform
    status: ConversationStatus
    assignee_id: string | null
    last_message_at: string
    unread_count: number
    tags: string[]
    created_at: string
    updated_at: string
}

export interface Message {
    id: string
    conversation_id: string
    sender_type: MessageSenderType
    content: string
    metadata: any
    created_at: string
}

export type SkillInsert = Omit<Skill, 'id' | 'created_at' | 'updated_at'>
export type SkillUpdate = Partial<Omit<Skill, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>

export type ConversationInsert = Omit<Conversation, 'id' | 'created_at' | 'updated_at'>
export type ConversationUpdate = Partial<Omit<Conversation, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>

export type MessageInsert = Omit<Message, 'id' | 'created_at'>
export type MessageUpdate = Partial<Omit<Message, 'id' | 'conversation_id' | 'created_at'>>

// Database table types for Supabase
export interface Database {
    public: {
        Tables: {
            organizations: {
                Row: Organization
                Insert: Omit<Organization, 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Omit<Organization, 'id' | 'created_at' | 'updated_at'>>
            }
            organization_members: {
                Row: OrganizationMember
                Insert: Omit<OrganizationMember, 'id' | 'created_at'>
                Update: Partial<Omit<OrganizationMember, 'id' | 'created_at'>>
            }
            profiles: {
                Row: Profile
                Insert: Omit<Profile, 'created_at' | 'updated_at'>
                Update: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>
            }
            skills: {
                Row: Skill
                Insert: SkillInsert
                Update: SkillUpdate
            }
            skill_embeddings: {
                Row: SkillEmbedding
                Insert: Omit<SkillEmbedding, 'id' | 'created_at'>
                Update: Partial<Omit<SkillEmbedding, 'id' | 'created_at'>>
            }
            conversations: {
                Row: Conversation
                Insert: ConversationInsert
                Update: ConversationUpdate
            }
            messages: {
                Row: Message
                Insert: MessageInsert
                Update: MessageUpdate
            }
        }
    }
}
