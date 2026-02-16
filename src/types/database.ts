export type UserRole = 'owner' | 'admin' | 'member'
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Organization {
    id: string
    name: string
    slug: string
    created_at: string
    updated_at: string
}

export type AiMode = 'strict' | 'flexible'
export type AiBotMode = 'active' | 'shadow' | 'off'
export type HumanEscalationAction = 'notify_only' | 'switch_to_operator'

export interface OrganizationAiSettings {
    organization_id: string
    mode: AiMode
    match_threshold: number
    prompt: string
    bot_mode: AiBotMode
    bot_name: string
    allow_lead_extraction_during_operator: boolean
    hot_lead_score_threshold: number
    hot_lead_action: HumanEscalationAction
    hot_lead_handover_message_tr: string
    hot_lead_handover_message_en: string
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
    metadata: Json
    created_at: string
}

export type BillingMembershipState =
    | 'trial_active'
    | 'trial_exhausted'
    | 'premium_active'
    | 'past_due'
    | 'canceled'
    | 'admin_locked'

export type BillingLockReason =
    | 'none'
    | 'trial_time_expired'
    | 'trial_credits_exhausted'
    | 'subscription_required'
    | 'package_credits_exhausted'
    | 'past_due'
    | 'admin_locked'

export type BillingCreditLedgerType =
    | 'trial_grant'
    | 'package_grant'
    | 'usage_debit'
    | 'purchase_credit'
    | 'adjustment'
    | 'refund'
    | 'reversal'

export type BillingCreditPoolType = 'trial_pool' | 'package_pool' | 'topup_pool' | 'mixed'

export interface PlatformBillingSettings {
    key: 'default'
    default_trial_days: number
    default_trial_credits: number
    default_package_price_try: number
    default_package_price_usd: number
    default_package_credits: number
    starter_plan_credits: number
    starter_plan_price_try: number
    starter_plan_price_usd: number
    growth_plan_credits: number
    growth_plan_price_try: number
    growth_plan_price_usd: number
    scale_plan_credits: number
    scale_plan_price_try: number
    scale_plan_price_usd: number
    topup_250_price_try: number
    topup_250_price_usd: number
    topup_500_price_try: number
    topup_500_price_usd: number
    topup_1000_price_try: number
    topup_1000_price_usd: number
    updated_by: string | null
    created_at: string
    updated_at: string
}

export interface BillingPackageVersion {
    id: string
    monthly_price_try: number
    monthly_credits: number
    effective_from: string
    effective_to: string | null
    created_by: string | null
    created_at: string
}

export interface OrganizationBillingAccount {
    organization_id: string
    membership_state: BillingMembershipState
    lock_reason: BillingLockReason
    trial_started_at: string
    trial_ends_at: string
    trial_credit_limit: number
    trial_credit_used: number
    current_period_start: string | null
    current_period_end: string | null
    monthly_package_credit_limit: number
    monthly_package_credit_used: number
    topup_credit_balance: number
    premium_assigned_at: string | null
    last_manual_action_at: string | null
    created_at: string
    updated_at: string
}

export interface OrganizationCreditLedger {
    id: string
    organization_id: string
    entry_type: BillingCreditLedgerType
    credit_pool: BillingCreditPoolType
    credits_delta: number
    balance_after: number
    usage_id: string | null
    performed_by: string | null
    reason: string | null
    metadata: Json
    created_at: string
}

export interface OrganizationSubscriptionRecord {
    id: string
    organization_id: string
    provider: string
    provider_subscription_id: string | null
    status: 'pending' | 'active' | 'past_due' | 'canceled' | 'incomplete'
    period_start: string | null
    period_end: string | null
    canceled_at: string | null
    metadata: Json
    created_at: string
    updated_at: string
}

export interface CreditPurchaseOrder {
    id: string
    organization_id: string
    provider: string
    provider_checkout_id: string | null
    provider_payment_id: string | null
    status: 'pending' | 'paid' | 'failed' | 'canceled' | 'expired' | 'refunded'
    credits: number
    amount_try: number
    currency: string
    paid_at: string | null
    metadata: Json
    created_at: string
    updated_at: string
}

export interface BillingAdminAuditLog {
    id: string
    organization_id: string
    action_type: 'extend_trial' | 'credit_adjustment' | 'premium_assign' | 'premium_cancel' | 'package_config_update'
    actor_id: string
    reason: string
    before_state: Json
    after_state: Json
    metadata: Json
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
    requires_human_handover: boolean
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
export type ConversationPlatform = 'whatsapp' | 'telegram' | 'instagram' | 'simulator'
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
    ai_usage_input_tokens_total?: number
    ai_usage_output_tokens_total?: number
    ai_usage_total_tokens_total?: number
    ai_usage_count?: number
    ai_usage_total_credits?: number
    tags: string[]
    created_at: string
    updated_at: string
}

export interface Message {
    id: string
    conversation_id: string
    sender_type: MessageSenderType
    content: string
    metadata: Json
    created_at: string
}

export interface Channel {
    id: string
    organization_id: string
    type: 'telegram' | 'whatsapp' | 'instagram'
    name: string
    config: Json
    status: 'active' | 'disconnected' | 'error'
    created_at: string
    updated_at: string
}

export type LeadStatus = 'hot' | 'warm' | 'cold' | 'ignored' | 'undetermined'
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
    extracted_fields: Json
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
            platform_billing_settings: {
                Row: PlatformBillingSettings
                Insert: Omit<PlatformBillingSettings, 'created_at' | 'updated_at'> & { key?: 'default' }
                Update: Partial<Omit<PlatformBillingSettings, 'key' | 'created_at' | 'updated_at'>>
            }
            billing_package_versions: {
                Row: BillingPackageVersion
                Insert: Omit<BillingPackageVersion, 'id' | 'created_at'>
                Update: Partial<Omit<BillingPackageVersion, 'id' | 'created_at'>>
            }
            organization_billing_accounts: {
                Row: OrganizationBillingAccount
                Insert: Omit<OrganizationBillingAccount, 'created_at' | 'updated_at'>
                Update: Partial<Omit<OrganizationBillingAccount, 'organization_id' | 'created_at' | 'updated_at'>>
            }
            organization_credit_ledger: {
                Row: OrganizationCreditLedger
                Insert: Omit<OrganizationCreditLedger, 'id' | 'created_at'>
                Update: Partial<Omit<OrganizationCreditLedger, 'id' | 'organization_id' | 'created_at'>>
            }
            organization_subscription_records: {
                Row: OrganizationSubscriptionRecord
                Insert: Omit<OrganizationSubscriptionRecord, 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Omit<OrganizationSubscriptionRecord, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>
            }
            credit_purchase_orders: {
                Row: CreditPurchaseOrder
                Insert: Omit<CreditPurchaseOrder, 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Omit<CreditPurchaseOrder, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>
            }
            billing_admin_audit_log: {
                Row: BillingAdminAuditLog
                Insert: Omit<BillingAdminAuditLog, 'id' | 'created_at'>
                Update: Partial<Omit<BillingAdminAuditLog, 'id' | 'organization_id' | 'created_at'>>
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
