'use server'

import { createClient } from '@/lib/supabase/server'
import { buildPasswordResetRedirectUrl } from '@/lib/auth/reset'
import { normalizeRegisterFormData } from '@/lib/auth/register-data'
import { ACTIVE_ORG_COOKIE } from '@/lib/organizations/active-context'
import { resolvePostAuthRedirectPath } from '@/lib/auth/post-auth-redirect'
import type { PostAuthSupabase } from '@/lib/auth/post-auth-redirect'
import { normalizeAppLocale } from '@/lib/i18n/locale-path'
import { getOrganizationOnboardingState } from '@/lib/onboarding/state'
import {
    checkTrialBusinessIdentity,
    checkSignupVelocityGuard,
    isTurnstileCaptchaEnabled,
    recordSignupVelocityAttempt,
    resolveSignupRequestMetadata,
    verifyTurnstileCaptcha,
} from '@/lib/auth/signup-guard'
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { resolveBillingRegionFromRequestHeaders } from '@/lib/billing/request-region'

export type LoginActionState = {
    error?: string
    errorCode?: 'invalid_credentials'
    redirectPath?: string
}

export type RegisterActionState = {
    error?: string
    errorCode?: 'signup_rate_limited' | 'captcha_required' | 'captcha_failed' | 'trial_already_used_business'
    cooldownSeconds?: number
    redirectPath?: string
}

function resolveLoginErrorCode(error: unknown): LoginActionState['errorCode'] | null {
    if (!error || typeof error !== 'object') {
        return null
    }

    const errorCode = 'code' in error && typeof error.code === 'string'
        ? error.code.trim().toLowerCase()
        : ''
    if (errorCode === 'invalid_credentials') {
        return 'invalid_credentials'
    }

    const errorMessage = 'message' in error && typeof error.message === 'string'
        ? error.message.trim().toLowerCase()
        : ''
    if (errorMessage === 'invalid login credentials') {
        return 'invalid_credentials'
    }

    return null
}

async function buildPostAuthRedirectPath(
    locale: string | null | undefined,
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string | null | undefined
) {
    if (!userId) {
        return '/inbox'
    }

    const cookieStore = await cookies()
    const organizationId = await resolvePostAuthOrganizationId(
        supabase,
        userId
    )
    const onboardingState = organizationId
        ? await getOrganizationOnboardingState(organizationId, {
            supabase
        })
        : null

    return resolvePostAuthRedirectPath({
        cookieOrganizationId: cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null,
        locale,
        onboarding: {
            shouldAutoOpen: onboardingState?.shouldAutoOpen ?? false,
            resolveOrganizationId: async () => organizationId
        },
        supabase: supabase as unknown as PostAuthSupabase,
        userId
    })
}

async function resolvePostAuthOrganizationId(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string
) {
    const { data, error } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()

    if (error) {
        console.warn('Failed to resolve post-auth organization for onboarding:', error)
        return null
    }

    return typeof data?.organization_id === 'string'
        ? data.organization_id
        : null
}

export async function login(formData: FormData) {
    const supabase = await createClient()
    const locale = String(formData.get('locale') ?? '')

    const data = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
    }

    const { data: authResult, error } = await supabase.auth.signInWithPassword(data)

    if (error) {
        const errorCode = resolveLoginErrorCode(error)
        if (errorCode) {
            return { errorCode }
        }

        return { error: error.message }
    }

    return {
        redirectPath: await buildPostAuthRedirectPath(
            locale,
            supabase,
            authResult.user?.id ?? authResult.session?.user?.id
        )
    } satisfies LoginActionState
}

export async function register(formData: FormData) {
    const supabase = await createClient()
    const requestHeaders = await headers()
    const locale = String(formData.get('locale') ?? '')

    const { email, password, fullName, companyName } = normalizeRegisterFormData(formData)
    const signupRequestMetadata = resolveSignupRequestMetadata(requestHeaders)
    const billingRegion = resolveBillingRegionFromRequestHeaders(requestHeaders)
    const turnstileEnabled = isTurnstileCaptchaEnabled()

    if (turnstileEnabled) {
        const captchaToken = String(formData.get('cf-turnstile-response') ?? '').trim()

        if (!captchaToken) {
            return {
                errorCode: 'captcha_required',
            } satisfies RegisterActionState
        }

        const captchaResult = await verifyTurnstileCaptcha({
            token: captchaToken,
            secretKey: process.env.TURNSTILE_SECRET_KEY ?? '',
            ipAddress: signupRequestMetadata.ipAddress,
        })

        if (!captchaResult.success) {
            return {
                errorCode: 'captcha_failed',
            } satisfies RegisterActionState
        }
    }

    const signupVelocityGuard = await checkSignupVelocityGuard({
        supabase,
        email,
        metadata: signupRequestMetadata,
    })

    if (!signupVelocityGuard.allowed) {
        return {
            errorCode: 'signup_rate_limited',
            cooldownSeconds: signupVelocityGuard.cooldownSeconds,
        } satisfies RegisterActionState
    }

    const trialBusinessIdentity = await checkTrialBusinessIdentity({
        supabase,
        email,
        companyName,
    })

    if (!trialBusinessIdentity.eligible) {
        return {
            errorCode: 'trial_already_used_business',
        } satisfies RegisterActionState
    }

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName,
                company_name: companyName,
                billing_region: billingRegion,
                locale: normalizeAppLocale(locale),
            },
        },
    })

    if (error) {
        await recordSignupVelocityAttempt({
            supabase,
            email,
            metadata: signupRequestMetadata,
            succeeded: false,
        })

        return { error: error.message }
    }

    await recordSignupVelocityAttempt({
        supabase,
        email,
        metadata: signupRequestMetadata,
        succeeded: true,
    })

    if (data.session) {
        return {
            redirectPath: await buildPostAuthRedirectPath(
                locale,
                supabase,
                data.user?.id ?? data.session?.user?.id
            )
        } satisfies RegisterActionState
    }

    return {
        redirectPath: `/register/check-email?email=${encodeURIComponent(email)}`,
    } satisfies RegisterActionState
}

export async function logout() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/register')
}

function getBaseUrl() {
    if (process.env.NEXT_PUBLIC_SITE_URL) {
        return process.env.NEXT_PUBLIC_SITE_URL
    }
    if (process.env.URL) {
        return process.env.URL
    }
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`
    }
    return 'http://localhost:3000'
}

export async function requestPasswordReset(formData: FormData) {
    const email = String(formData.get('email') ?? '').trim()
    const locale = String(formData.get('locale') ?? '')

    if (!email) {
        return { error: 'missing_email' }
    }

    const supabase = await createClient()
    const redirectTo = buildPasswordResetRedirectUrl(getBaseUrl(), locale)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    if (error) {
        return { error: 'reset_failed' }
    }

    return { success: true }
}
