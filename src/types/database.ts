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
        }
    }
}
