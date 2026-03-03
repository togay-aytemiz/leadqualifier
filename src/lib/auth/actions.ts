'use server'

import { createClient } from '@/lib/supabase/server'
import { buildPasswordResetRedirectUrl } from '@/lib/auth/reset'
import { normalizeRegisterFormData } from '@/lib/auth/register-data'
import {
    checkTrialBusinessIdentity,
    checkSignupVelocityGuard,
    isTurnstileCaptchaEnabled,
    recordSignupVelocityAttempt,
    resolveSignupRequestMetadata,
    verifyTurnstileCaptcha,
} from '@/lib/auth/signup-guard'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { resolveBillingRegionFromRequestHeaders } from '@/lib/billing/request-region'

export type RegisterActionState = {
    error?: string
    errorCode?: 'signup_rate_limited' | 'captcha_required' | 'captcha_failed' | 'trial_already_used_business'
    cooldownSeconds?: number
}

export async function login(formData: FormData) {
    const supabase = await createClient()

    const data = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
    }

    const { error } = await supabase.auth.signInWithPassword(data)

    if (error) {
        return { error: error.message }
    }

    redirect('/')
}

export async function register(formData: FormData) {
    const supabase = await createClient()
    const requestHeaders = await headers()

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

    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName,
                company_name: companyName,
                billing_region: billingRegion,
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

    redirect('/')
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
