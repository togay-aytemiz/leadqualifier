import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createClientMock,
    headersMock,
    redirectMock,
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    headersMock: vi.fn(),
    redirectMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock,
}))

vi.mock('next/headers', () => ({
    headers: headersMock,
}))

vi.mock('next/navigation', () => ({
    redirect: redirectMock,
}))

import { register, requestPasswordReset } from '@/lib/auth/actions'

function createRegisterFormData(values?: Partial<Record<'email' | 'password' | 'fullName' | 'companyName', string>>) {
    const formData = new FormData()
    formData.set('email', values?.email ?? 'jane@example.com')
    formData.set('password', values?.password ?? 'password123')
    formData.set('fullName', values?.fullName ?? 'Jane Doe')
    formData.set('companyName', values?.companyName ?? '')
    return formData
}

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

    it('redirects to check-email page when signup requires email confirmation', async () => {
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

        await expect(register(createRegisterFormData())).rejects.toThrow('NEXT_REDIRECT')

        expect(redirectMock).toHaveBeenCalledWith('/register/check-email?email=jane%40example.com')
        expect(rpcMock).toHaveBeenCalledWith('record_signup_trial_attempt', expect.objectContaining({
            input_succeeded: true,
        }))
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
