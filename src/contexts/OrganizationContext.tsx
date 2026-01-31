'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Organization, OrganizationMember } from '@/types/database'

interface OrganizationContextType {
    organizations: Organization[]
    currentOrganization: Organization | null
    currentMembership: OrganizationMember | null
    setCurrentOrganization: (org: Organization) => void
    loading: boolean
    refetch: () => Promise<void>
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined)

export function OrganizationProvider({ children }: { children: ReactNode }) {
    const [organizations, setOrganizations] = useState<Organization[]>([])
    const [memberships, setMemberships] = useState<OrganizationMember[]>([])
    const [currentOrganization, setCurrentOrg] = useState<Organization | null>(null)
    const [loading, setLoading] = useState(true)

    const supabase = createClient()

    const fetchOrganizations = async () => {
        setLoading(true)

        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            setOrganizations([])
            setMemberships([])
            setCurrentOrg(null)
            setLoading(false)
            return
        }

        const { data: membershipData } = await supabase
            .from('organization_members')
            .select('*, organizations(*)')
            .eq('user_id', user.id)

        if (membershipData) {
            const orgs = membershipData
                .map((m) => m.organizations as Organization | null)
                .filter((o): o is Organization => o !== null)
            const mems = membershipData.map((m) => ({
                id: m.id,
                organization_id: m.organization_id,
                user_id: m.user_id,
                role: m.role,
                created_at: m.created_at,
            }))

            setOrganizations(orgs)
            setMemberships(mems)

            // Restore from localStorage or use first org
            const savedOrgId = localStorage.getItem('currentOrgId')
            const savedOrg = orgs.find((o) => o.id === savedOrgId)
            setCurrentOrg(savedOrg || orgs[0] || null)
        }

        setLoading(false)
    }

    useEffect(() => {
        fetchOrganizations()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const setCurrentOrganization = (org: Organization) => {
        setCurrentOrg(org)
        localStorage.setItem('currentOrgId', org.id)
    }

    const currentMembership =
        memberships.find((m) => m.organization_id === currentOrganization?.id) || null

    return (
        <OrganizationContext.Provider
            value={{
                organizations,
                currentOrganization,
                currentMembership,
                setCurrentOrganization,
                loading,
                refetch: fetchOrganizations,
            }}
        >
            {children}
        </OrganizationContext.Provider>
    )
}

export function useOrganization() {
    const context = useContext(OrganizationContext)
    if (context === undefined) {
        throw new Error('useOrganization must be used within an OrganizationProvider')
    }
    return context
}
