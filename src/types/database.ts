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

export type SkillInsert = Omit<Skill, 'id' | 'created_at' | 'updated_at'>
export type SkillUpdate = Partial<Omit<Skill, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>

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
        }
    }
}
