import { RegisterForm } from '@/components/auth/RegisterForm'

export default function RegisterPage() {
    const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? ''
    const turnstileEnabled = Boolean(turnstileSiteKey && process.env.TURNSTILE_SECRET_KEY?.trim())

    return <RegisterForm turnstileSiteKey={turnstileEnabled ? turnstileSiteKey : ''} />
}
