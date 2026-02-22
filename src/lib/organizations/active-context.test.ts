import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, cookiesMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    cookiesMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

vi.mock('next/headers', () => ({
    cookies: cookiesMock
}))

import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'

type QueryResult<T = unknown> = {
    data: T
    error: unknown
}

type QueryBuilderConfig = {
    singleResult?: QueryResult
    maybeSingleResult?: QueryResult
    orderResult?: QueryResult
    eqResult?: QueryResult
}

function createQueryBuilder(config: QueryBuilderConfig = {}) {
    const builder: Record<string, unknown> = {}

    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => {
        if (config.eqResult !== undefined) {
            return Promise.resolve(config.eqResult)
        }
        return builder
    })
    builder.single = vi.fn(() => Promise.resolve(config.singleResult ?? { data: null, error: null }))
    builder.maybeSingle = vi.fn(() => Promise.resolve(config.maybeSingleResult ?? { data: null, error: null }))
    builder.order = vi.fn(() => {
        if (config.orderResult !== undefined) {
            return Promise.resolve(config.orderResult)
        }
        return builder
    })

    return builder
}

function createSupabaseMock(plan: Record<string, ReturnType<typeof createQueryBuilder>[]>) {
    return {
        auth: {
            getUser: vi.fn(async () => ({
                data: {
                    user: {
                        id: 'user-1'
                    }
                }
            }))
        },
        from: vi.fn((table: string) => {
            const queue = plan[table]
            if (!queue || queue.length === 0) {
                throw new Error(`Unexpected query for table: ${table}`)
            }

            const next = queue.shift()
            if (!next) {
                throw new Error(`No query builder configured for table: ${table}`)
            }

            return next
        })
    }
}

describe('resolveActiveOrganizationContext', () => {
    beforeEach(() => {
        createClientMock.mockReset()
        cookiesMock.mockReset()
    })

    it('avoids loading full organization list when slim mode is used for system admin', async () => {
        const profileBuilder = createQueryBuilder({
            singleResult: {
                data: {
                    is_system_admin: true
                },
                error: null
            }
        })
        const organizationBuilder = createQueryBuilder({
            maybeSingleResult: {
                data: {
                    id: 'org-cookie',
                    name: 'Cookie Org',
                    slug: 'cookie-org'
                },
                error: null
            }
        })
        const supabaseMock = createSupabaseMock({
            profiles: [profileBuilder],
            organizations: [organizationBuilder]
        })

        cookiesMock.mockResolvedValue({
            get: vi.fn(() => ({ value: 'org-cookie' }))
        })

        const context = await resolveActiveOrganizationContext(supabaseMock as never, {
            includeAccessibleOrganizations: false
        })

        expect(context).not.toBeNull()
        expect(context?.source).toBe('cookie')
        expect(context?.activeOrganizationId).toBe('org-cookie')
        expect(context?.accessibleOrganizations).toEqual([
            {
                id: 'org-cookie',
                name: 'Cookie Org',
                slug: 'cookie-org'
            }
        ])
        expect((organizationBuilder.eq as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('id', 'org-cookie')
        expect((organizationBuilder.order as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    })

    it('keeps full organization list behavior when explicit list mode is requested', async () => {
        const profileBuilder = createQueryBuilder({
            singleResult: {
                data: {
                    is_system_admin: true
                },
                error: null
            }
        })
        const organizationListBuilder = createQueryBuilder({
            orderResult: {
                data: [
                    {
                        id: 'org-a',
                        name: 'Alpha',
                        slug: 'alpha'
                    },
                    {
                        id: 'org-b',
                        name: 'Beta',
                        slug: 'beta'
                    }
                ],
                error: null
            }
        })
        const supabaseMock = createSupabaseMock({
            profiles: [profileBuilder],
            organizations: [organizationListBuilder]
        })

        cookiesMock.mockResolvedValue({
            get: vi.fn(() => undefined)
        })

        const context = await resolveActiveOrganizationContext(supabaseMock as never, {
            includeAccessibleOrganizations: true
        })

        expect(context).not.toBeNull()
        expect(context?.source).toBe('fallback')
        expect(context?.activeOrganizationId).toBe('org-a')
        expect(context?.accessibleOrganizations).toHaveLength(2)
        expect((organizationListBuilder.order as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('name', { ascending: true })
    })

    it('excludes AI QA LAB from system admin accessible organizations', async () => {
        const profileBuilder = createQueryBuilder({
            singleResult: {
                data: {
                    is_system_admin: true
                },
                error: null
            }
        })
        const organizationListBuilder = createQueryBuilder({
            orderResult: {
                data: [
                    {
                        id: 'org-a',
                        name: 'Alpha',
                        slug: 'alpha'
                    },
                    {
                        id: 'org-qa',
                        name: 'AI QA LAB',
                        slug: 'ai-qa-lab'
                    },
                    {
                        id: 'org-b',
                        name: 'Beta',
                        slug: 'beta'
                    }
                ],
                error: null
            }
        })
        const supabaseMock = createSupabaseMock({
            profiles: [profileBuilder],
            organizations: [organizationListBuilder]
        })

        cookiesMock.mockResolvedValue({
            get: vi.fn(() => undefined)
        })

        const context = await resolveActiveOrganizationContext(supabaseMock as never, {
            includeAccessibleOrganizations: true
        })

        expect(context).not.toBeNull()
        expect(context?.accessibleOrganizations).toEqual([
            {
                id: 'org-a',
                name: 'Alpha',
                slug: 'alpha'
            },
            {
                id: 'org-b',
                name: 'Beta',
                slug: 'beta'
            }
        ])
        expect(context?.activeOrganizationId).toBe('org-a')
    })
})
