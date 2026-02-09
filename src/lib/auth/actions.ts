'use server'

import { createClient } from '@/lib/supabase/server'
import { buildPasswordResetRedirectUrl } from '@/lib/auth/reset'
import { normalizeRegisterFormData } from '@/lib/auth/register-data'
import { redirect } from 'next/navigation'

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

    redirect('/inbox')
}

export async function register(formData: FormData) {
    const supabase = await createClient()

    const { email, password, fullName, companyName } = normalizeRegisterFormData(formData)

    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName,
                company_name: companyName,
            },
        },
    })

    if (error) {
        return { error: error.message }
    }

    redirect('/inbox')
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
