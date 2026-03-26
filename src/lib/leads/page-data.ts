'use server'

import {
  getLeads,
  getRequiredFields,
  type GetLeadsParams,
  type GetLeadsResult,
} from '@/lib/leads/list-actions'

export interface LeadsPageData {
  leadsResult: GetLeadsResult
  requiredFields: string[]
}

export async function getLeadsPageData(
  params: GetLeadsParams = {},
  organizationIdOverride?: string | null
): Promise<LeadsPageData> {
  const [leadsResult, requiredFields] = await Promise.all([
    getLeads(params, organizationIdOverride),
    getRequiredFields(organizationIdOverride),
  ])

  return {
    leadsResult,
    requiredFields,
  }
}
