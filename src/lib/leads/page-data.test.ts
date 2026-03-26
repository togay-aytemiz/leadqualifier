import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getLeadsMock, getRequiredFieldsMock } = vi.hoisted(() => ({
  getLeadsMock: vi.fn(),
  getRequiredFieldsMock: vi.fn(),
}))

vi.mock('@/lib/leads/list-actions', () => ({
  getLeads: getLeadsMock,
  getRequiredFields: getRequiredFieldsMock,
}))

import { getLeadsPageData } from '@/lib/leads/page-data'

describe('getLeadsPageData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns paginated leads and required fields for the provided organization id', async () => {
    getLeadsMock.mockResolvedValue({
      leads: [{ id: 'lead-1' }],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    })
    getRequiredFieldsMock.mockResolvedValue(['Telefon'])

    const result = await getLeadsPageData(
      {
        page: 1,
        pageSize: 20,
        sortBy: 'updated_at',
        sortOrder: 'desc',
        search: 'Ada',
      },
      'org-1'
    )

    expect(getLeadsMock).toHaveBeenCalledWith(
      {
        page: 1,
        pageSize: 20,
        sortBy: 'updated_at',
        sortOrder: 'desc',
        search: 'Ada',
      },
      'org-1'
    )
    expect(getRequiredFieldsMock).toHaveBeenCalledWith('org-1')
    expect(result.requiredFields).toEqual(['Telefon'])
    expect(result.leadsResult.total).toBe(1)
  })
})
