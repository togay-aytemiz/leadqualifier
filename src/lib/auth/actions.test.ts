import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createClientMock,
    cookiesMock,
    headersMock,
    redirectMock,
    resolveActiveOrganizationContextMock,
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    cookiesMock: vi.fn(),
    headersMock: vi.fn(),
    redirectMock: vi.fn(),
    resolveActiveOrganizationContextMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock,
}))

vi.mock('next/headers', () => ({
    cookies: cookiesMock,
    headers: headersMock,
}))

vi.mock('next/navigation', () => ({
    redirect: redirectMock,
}))

vi.mock('@/lib/organizations/active-context', () => ({
    ACTIVE_ORG_COOKIE: 'active_org_id',
    resolveActiveOrganizationContext: resolveActiveOrganizationContextMock,
}))

import { login, register, requestPasswordReset } from '@/lib/auth/actions'

function createRegisterFormData(values?: Partial<Record<'email' | 'password' | 'fullName' | 'companyName' | 'locale', string>>) {
    const formData = new FormData()
    formData.set('email', values?.email ?? 'jane@example.com')
    formData.set('password', values?.password ?? 'password123')
    formData.set('fullName', values?.fullName ?? 'Jane Doe')
    formData.set('companyName', values?.companyName ?? '')
    formData.set('locale', values?.locale ?? 'tr')
    return formData
}

function createLoginFormData(values?: Partial<Record<'email' | 'password' | 'locale', string>>) {
    const formData = new FormData()
    formData.set('email', values?.email ?? 'jane@example.com')
    formData.set('password', values?.password ?? 'password123')
    formData.set('locale', values?.locale ?? 'tr')
    return formData
}

describe('auth login action', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        cookiesMock.mockResolvedValue({
            get: vi.fn(() => undefined),
        })
        resolveActiveOrganizationContextMock.mockResolvedValue({
            activeOrganizationId: 'org-1',
            activeOrganization: { id: 'org-1', name: 'Org 1', slug: 'org-1' },
            accessibleOrganizations: [{ id: 'org-1', name: 'Org 1', slug: 'org-1' }],
            isSystemAdmin: false,
            readOnlyTenantMode: false,
            source: 'cookie',
            userAvatarUrl: null,
            userEmail: 'jane@example.com',
            userFullName: 'Jane Doe',
            userId: 'user-1',
        })
        redirectMock.mockImplementation(() => {
            throw new Error('NEXT_REDIRECT')
        })
    })

    it('redirects directly to the localized home route after successful login', async () => {
        const signInWithPasswordMock = vi.fn(async () => ({
            data: {
                user: { id: 'user-1' },
                session: { access_token: 'token-1' },
            },
            error: null,
        }))

        const fromMock = vi.fn((table: string) => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => {
                        if (table === 'profiles') {
                            return {
                                data: { is_system_admin: false },
                                error: null,
                            }
                        }

                        throw new Error(`Unexpected table ${table}`)
                    })
                }))
            }))
        }))

        createClientMock.mockResolvedValue({
            auth: {
                signInWithPassword: signInWithPasswordMock,
                getUser: vi.fn(),
            },
            from: fromMock,
        })

        await expect(login(createLoginFormData({ locale: 'en' }))).resolves.toEqual({
            redirectPath: '/en/inbox'
        })
        expect(resolveActiveOrganizationContextMock).not.toHaveBeenCalled()
    })
})

describe('auth register action', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        delete process.env.NEXT_PUBLIC_SITE_URL
        delete process.env.URL
        delete process.env.VERCEL_URL
        delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
        delete process.env.TURNSTILE_SECRET_KEY
        headersMock.mockResolvedValue(new Headers({
            'x-forwarded-for': '203.0.113.7',
            'x-vercel-ip-country': 'TR',
            'user-agent': 'Mozilla/5.0',
        }))
        cookiesMock.mockResolvedValue({
            get: vi.fn(() => undefined),
        })
        resolveActiveOrganizationContextMock.mockResolvedValue({
            activeOrganizationId: 'org-1',
            activeOrganization: { id: 'org-1', name: 'Org 1', slug: 'org-1' },
            accessibleOrganizations: [{ id: 'org-1', name: 'Org 1', slug: 'org-1' }],
            isSystemAdmin: false,
            readOnlyTenantMode: false,
            source: 'cookie',
            userAvatarUrl: null,
            userEmail: 'jane@example.com',
            userFullName: 'Jane Doe',
            userId: 'user-1',
        })
        redirectMock.mockImplementation(() => {
            throw new Error('NEXT_REDIRECT')
        })
    })

    it('blocks signup when velocity guard is in cooldown', async () => {
        const rpcMock = vi.fn(async (fn: string) => {
            if (fn === 'check_signup_trial_rate_limit') {
                return {
                    data: {
                        allowed: false,
                        cooldown_seconds: 90,
                        reason: 'cooldown_active',
                    },
                    error: null,
                }
            }

            return {
                data: null,
                error: null,
            }
        })

        const signUpMock = vi.fn(async () => ({
            error: null,
        }))

        createClientMock.mockResolvedValue({
            rpc: rpcMock,
            auth: {
                signUp: signUpMock,
            },
        })

        const result = await register(createRegisterFormData())

        expect(result).toEqual({
            errorCode: 'signup_rate_limited',
            cooldownSeconds: 90,
        })
        expect(signUpMock).not.toHaveBeenCalled()
    })

    it('requires captcha token when turnstile is enabled', async () => {
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-key'
        process.env.TURNSTILE_SECRET_KEY = 'secret-key'

        const rpcMock = vi.fn(async () => ({
            data: {
                allowed: true,
                cooldown_seconds: 0,
                reason: null,
            },
            error: null,
        }))

        const signUpMock = vi.fn(async () => ({
            error: null,
        }))

        createClientMock.mockResolvedValue({
            rpc: rpcMock,
            auth: {
                signUp: signUpMock,
            },
        })

        const result = await register(createRegisterFormData())

        expect(result).toEqual({
            errorCode: 'captcha_required',
        })
        expect(signUpMock).not.toHaveBeenCalled()
        expect(rpcMock).not.toHaveBeenCalled()
    })

    it('returns a check-email redirect path when signup requires email confirmation', async () => {
        const rpcMock = vi.fn(async (fn: string) => {
            if (fn === 'check_signup_trial_rate_limit') {
                return {
                    data: {
                        allowed: true,
                        cooldown_seconds: 0,
                        reason: null,
                    },
                    error: null,
                }
            }

            if (fn === 'check_trial_business_identity') {
                return {
                    data: {
                        eligible: true,
                        conflict_signal_type: null,
                    },
                    error: null,
                }
            }

            if (fn === 'record_signup_trial_attempt') {
                return {
                    data: {
                        recorded: true,
                    },
                    error: null,
                }
            }

            throw new Error(`Unexpected rpc ${fn}`)
        })

        const signUpMock = vi.fn(async () => ({
            data: {
                session: null,
            },
            error: null,
        }))

        createClientMock.mockResolvedValue({
            rpc: rpcMock,
            auth: {
                signUp: signUpMock,
            },
        })

        await expect(register(createRegisterFormData())).resolves.toEqual({
            redirectPath: '/register/check-email?email=jane%40example.com',
        })
        expect(redirectMock).not.toHaveBeenCalled()
        expect(rpcMock).toHaveBeenCalledWith('record_signup_trial_attempt', expect.objectContaining({
            input_succeeded: true,
        }))
    })

    it('redirects directly to the localized home route when signup returns a session', async () => {
        const rpcMock = vi.fn(async (fn: string) => {
            if (fn === 'check_signup_trial_rate_limit') {
                return {
                    data: {
                        allowed: true,
                        cooldown_seconds: 0,
                        reason: null,
                    },
                    error: null,
                }
            }

            if (fn === 'check_trial_business_identity') {
                return {
                    data: {
                        eligible: true,
                        conflict_signal_type: null,
                    },
                    error: null,
                }
            }

            if (fn === 'record_signup_trial_attempt') {
                return {
                    data: {
                        recorded: true,
                    },
                    error: null,
                }
            }

            throw new Error(`Unexpected rpc ${fn}`)
        })

        const signUpMock = vi.fn(async () => ({
            data: {
                user: { id: 'user-1' },
                session: { access_token: 'token-1' },
            },
            error: null,
        }))

        const fromMock = vi.fn((table: string) => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => {
                        if (table === 'profiles') {
                            return {
                                data: { is_system_admin: false },
                                error: null,
                            }
                        }

                        throw new Error(`Unexpected table ${table}`)
                    })
                }))
            }))
        }))

        createClientMock.mockResolvedValue({
            rpc: rpcMock,
            auth: {
                signUp: signUpMock,
                getUser: vi.fn(),
            },
            from: fromMock,
        })

        await expect(register(createRegisterFormData({ locale: 'en' }))).resolves.toEqual({
            redirectPath: '/en/inbox'
        })
        expect(resolveActiveOrganizationContextMock).not.toHaveBeenCalled()
    })

    it('records failed attempts after signup errors', async () => {
        const rpcMock = vi.fn(async (fn: string) => {
            if (fn === 'check_signup_trial_rate_limit') {
                return {
                    data: {
                        allowed: true,
                        cooldown_seconds: 0,
                        reason: null,
                    },
                    error: null,
                }
            }

            if (fn === 'check_trial_business_identity') {
                return {
                    data: {
                        eligible: true,
                        conflict_signal_type: null,
                    },
                    error: null,
                }
            }

            if (fn === 'record_signup_trial_attempt') {
                return {
                    data: {
                        recorded: true,
                    },
                    error: null,
                }
            }

            throw new Error(`Unexpected rpc ${fn}`)
        })

        const signUpMock = vi.fn(async () => ({
            error: {
                message: 'User already registered',
            },
        }))

        createClientMock.mockResolvedValue({
            rpc: rpcMock,
            auth: {
                signUp: signUpMock,
            },
        })

        const result = await register(createRegisterFormData())

        expect(result).toEqual({
            error: 'User already registered',
        })
        expect(rpcMock).toHaveBeenCalledWith('record_signup_trial_attempt', expect.objectContaining({
            input_succeeded: false,
        }))
    })

    it('blocks signup when business fingerprint already used trial', async () => {
        const rpcMock = vi.fn(async (fn: string) => {
            if (fn === 'check_signup_trial_rate_limit') {
                return {
                    data: {
                        allowed: true,
                        cooldown_seconds: 0,
                        reason: null,
                    },
                    error: null,
                }
            }

            if (fn === 'check_trial_business_identity') {
                return {
                    data: {
                        eligible: false,
                        conflict_signal_type: 'company_name',
                    },
                    error: null,
                }
            }

            throw new Error(`Unexpected rpc ${fn}`)
        })

        const signUpMock = vi.fn(async () => ({
            error: null,
        }))

        createClientMock.mockResolvedValue({
            rpc: rpcMock,
            auth: {
                signUp: signUpMock,
            },
        })

        const result = await register(createRegisterFormData({
            companyName: 'ACME Studio',
        }))

        expect(result).toEqual({
            errorCode: 'trial_already_used_business',
        })
        expect(signUpMock).not.toHaveBeenCalled()
    })
})

describe('auth password reset action', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        delete process.env.NEXT_PUBLIC_SITE_URL
        delete process.env.URL
        delete process.env.VERCEL_URL
    })

    it('uses Netlify URL env as base redirect when explicit site URL is absent', async () => {
        process.env.URL = 'https://app.askqualy.com'

        const resetPasswordForEmailMock = vi.fn(async () => ({
            error: null,
        }))

        createClientMock.mockResolvedValue({
            auth: {
                resetPasswordForEmail: resetPasswordForEmailMock,
            },
        })

        const formData = new FormData()
        formData.set('email', 'jane@example.com')
        formData.set('locale', 'tr')

        const result = await requestPasswordReset(formData)

        expect(result).toEqual({ success: true })
        expect(resetPasswordForEmailMock).toHaveBeenCalledWith('jane@example.com', {
            redirectTo: 'https://app.askqualy.com/reset-password',
        })
    })
})
