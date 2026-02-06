export type UserRole = 'owner' | 'admin' | 'member'

export interface Organization {
    id: string
    name: string
    slug: string
    created_at: string
    updated_at: string
}

export type AiMode = 'strict' | 'flexible'
export type AiBotMode = 'active' | 'shadow' | 'off'

export interface OrganizationAiSettings {
    organization_id: string
    mode: AiMode
    match_threshold: number
    prompt: string
    bot_mode: AiBotMode
    bot_name: string
    allow_lead_extraction_during_operator: boolean
    created_at: string
    updated_at: string
}

export interface OrganizationAiUsage {
    id: string
    organization_id: string
    category: string
    model: string
    input_tokens: number
    output_tokens: number
    total_tokens: number
    metadata: any
    created_at: string
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
    active_agent: 'bot' | 'operator'
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

export interface Channel {
    id: string
    organization_id: string
    type: 'telegram' | 'whatsapp'
    name: string
    config: any
    status: 'active' | 'disconnected' | 'error'
    created_at: string
    updated_at: string
}

export type LeadStatus = 'hot' | 'warm' | 'cold' | 'ignored'
export type ServiceCandidateStatus = 'pending' | 'approved' | 'rejected'

export interface OfferingProfile {
    organization_id: string
    summary: string
    manual_profile_note: string
    catalog_enabled: boolean
    ai_suggestions_enabled: boolean
    required_intake_fields_ai_enabled: boolean
    ai_suggestions_locale: string
    required_intake_fields: string[]
    required_intake_fields_ai: string[]
    created_at: string
    updated_at: string
}

export interface OfferingProfileSuggestion {
    id: string
    organization_id: string
    source_type: 'skill' | 'knowledge' | 'batch'
    source_id: string | null
    content: string
    status: ServiceCandidateStatus
    locale: string | null
    update_of: string | null
    archived_at: string | null
    created_at: string
    reviewed_at: string | null
    reviewed_by: string | null
}

export interface OfferingProfileUpdate {
    id: string
    organization_id: string
    source_type: 'skill' | 'knowledge'
    source_id: string | null
    proposed_summary: string
    status: ServiceCandidateStatus
    created_at: string
    reviewed_at: string | null
    reviewed_by: string | null
}

export interface ServiceCatalogItem {
    id: string
    organization_id: string
    name: string
    aliases: string[]
    active: boolean
    created_at: string
    updated_at: string
}

export interface ServiceCandidate {
    id: string
    organization_id: string
    source_type: 'skill' | 'knowledge'
    source_id: string | null
    proposed_name: string
    status: ServiceCandidateStatus
    created_at: string
    reviewed_at: string | null
    reviewed_by: string | null
}

export interface Lead {
    id: string
    organization_id: string
    conversation_id: string
    service_type: string | null
    service_fit: number
    intent_score: number
    total_score: number
    status: LeadStatus
    summary: string | null
    extracted_fields: any
    non_business: boolean
    last_message_at: string | null
    created_at: string
    updated_at: string
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
            channels: {
                Row: Channel
                Insert: Omit<Channel, 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Omit<Channel, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>
            }
            organization_ai_usage: {
                Row: OrganizationAiUsage
                Insert: Omit<OrganizationAiUsage, 'id' | 'created_at'>
                Update: Partial<Omit<OrganizationAiUsage, 'id' | 'organization_id' | 'created_at'>>
            }
            offering_profiles: {
                Row: OfferingProfile
                Insert: Omit<OfferingProfile, 'created_at' | 'updated_at'>
                Update: Partial<Omit<OfferingProfile, 'organization_id' | 'created_at' | 'updated_at'>>
            }
            offering_profile_suggestions: {
                Row: OfferingProfileSuggestion
                Insert: Omit<OfferingProfileSuggestion, 'id' | 'created_at'>
                Update: Partial<Omit<OfferingProfileSuggestion, 'id' | 'organization_id' | 'created_at'>>
            }
            offering_profile_updates: {
                Row: OfferingProfileUpdate
                Insert: Omit<OfferingProfileUpdate, 'id' | 'created_at'>
                Update: Partial<Omit<OfferingProfileUpdate, 'id' | 'organization_id' | 'created_at'>>
            }
            service_catalog: {
                Row: ServiceCatalogItem
                Insert: Omit<ServiceCatalogItem, 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Omit<ServiceCatalogItem, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>
            }
            service_candidates: {
                Row: ServiceCandidate
                Insert: Omit<ServiceCandidate, 'id' | 'created_at'>
                Update: Partial<Omit<ServiceCandidate, 'id' | 'organization_id' | 'created_at'>>
            }
            leads: {
                Row: Lead
                Insert: Omit<Lead, 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Omit<Lead, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>
            }
        }
    }
}
