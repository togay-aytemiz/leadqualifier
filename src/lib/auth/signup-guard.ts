interface RpcResponse {
    data: unknown
    error: unknown
}

interface SignupGuardSupabaseClient {
    rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResponse> | RpcResponse
}

export interface SignupRequestMetadata {
    ipAddress: string | null
    userAgent: string | null
}

export interface SignupVelocityGuardResult {
    allowed: boolean
    cooldownSeconds: number
    reason: string | null
}

interface TurnstileVerificationResult {
    success: boolean
    reason: string | null
}

const IP_HEADER_KEYS = [
    'x-forwarded-for',
    'cf-connecting-ip',
    'x-real-ip',
    'x-client-ip',
    'x-vercel-forwarded-for',
] as const

function normalizeEmail(value: string): string {
    return value.trim().toLowerCase()
}

function normalizeIp(value: string | null | undefined): string | null {
    const raw = (value ?? '').trim()
    if (!raw) return null

    const candidate = raw
        .split(',')[0]
        ?.trim()
        .replace(/^\[/, '')
        .replace(/\]$/, '')

    if (!candidate) return null

    if (candidate.length > 64) {
        return null
    }

    return candidate
}

export function resolveSignupRequestMetadata(headers: Pick<Headers, 'get'>): SignupRequestMetadata {
    let ipAddress: string | null = null

    for (const key of IP_HEADER_KEYS) {
        ipAddress = normalizeIp(headers.get(key))
        if (ipAddress) break
    }

    const userAgent = (headers.get('user-agent') ?? '').trim() || null

    return {
        ipAddress,
        userAgent,
    }
}

function parseCooldownSeconds(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0
    }

    return Math.max(0, Math.floor(value))
}

export async function checkSignupVelocityGuard(options: {
    supabase: SignupGuardSupabaseClient
    email: string
    metadata: SignupRequestMetadata
}): Promise<SignupVelocityGuardResult> {
    const normalizedEmail = normalizeEmail(options.email)

    if (!normalizedEmail) {
        return {
            allowed: true,
            cooldownSeconds: 0,
            reason: null,
        }
    }

    const { data, error } = await options.supabase.rpc('check_signup_trial_rate_limit', {
        input_email: normalizedEmail,
        input_ip: options.metadata.ipAddress,
        input_user_agent: options.metadata.userAgent,
    })

    if (error) {
        console.error('Signup velocity guard check failed:', error)
        return {
            allowed: true,
            cooldownSeconds: 0,
            reason: null,
        }
    }

    if (!data || typeof data !== 'object') {
        return {
            allowed: true,
            cooldownSeconds: 0,
            reason: null,
        }
    }

    const payload = data as Record<string, unknown>
    const allowed = payload.allowed !== false

    return {
        allowed,
        cooldownSeconds: parseCooldownSeconds(payload.cooldown_seconds),
        reason: typeof payload.reason === 'string' ? payload.reason : null,
    }
}

export async function recordSignupVelocityAttempt(options: {
    supabase: SignupGuardSupabaseClient
    email: string
    metadata: SignupRequestMetadata
    succeeded: boolean
}): Promise<boolean> {
    const normalizedEmail = normalizeEmail(options.email)

    if (!normalizedEmail) {
        return false
    }

    const { error } = await options.supabase.rpc('record_signup_trial_attempt', {
        input_email: normalizedEmail,
        input_ip: options.metadata.ipAddress,
        input_user_agent: options.metadata.userAgent,
        input_succeeded: options.succeeded,
    })

    if (error) {
        console.error('Signup velocity guard attempt record failed:', error)
        return false
    }

    return true
}

export function isTurnstileCaptchaEnabled(): boolean {
    return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY)
}

export async function verifyTurnstileCaptcha(options: {
    token: string
    secretKey: string
    ipAddress: string | null
}): Promise<TurnstileVerificationResult> {
    const token = options.token.trim()
    const secretKey = options.secretKey.trim()

    if (!token) {
        return {
            success: false,
            reason: 'missing_token',
        }
    }

    if (!secretKey) {
        return {
            success: false,
            reason: 'missing_secret',
        }
    }

    try {
        const payload = new URLSearchParams({
            secret: secretKey,
            response: token,
        })

        if (options.ipAddress) {
            payload.set('remoteip', options.ipAddress)
        }

        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: payload,
            cache: 'no-store',
        })

        if (!response.ok) {
            return {
                success: false,
                reason: 'captcha_http_error',
            }
        }

        const data = await response.json() as {
            success?: boolean
            ['error-codes']?: string[]
        }

        if (data.success) {
            return {
                success: true,
                reason: null,
            }
        }

        return {
            success: false,
            reason: data['error-codes']?.[0] ?? 'captcha_verification_failed',
        }
    } catch (error) {
        console.error('Turnstile verification failed:', error)
        return {
            success: false,
            reason: 'captcha_request_failed',
        }
    }
}
