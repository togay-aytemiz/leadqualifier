import { describe, expect, it, vi } from 'vitest'
import {
    checkSignupVelocityGuard,
    recordSignupVelocityAttempt,
    resolveSignupRequestMetadata,
} from '@/lib/auth/signup-guard'

function createHeaders(values: Record<string, string>): Headers {
    const headers = new Headers()
    for (const [key, value] of Object.entries(values)) {
        headers.set(key, value)
    }
    return headers
}

describe('signup velocity guard', () => {
    it('extracts primary client ip from x-forwarded-for chain', () => {
        const metadata = resolveSignupRequestMetadata(createHeaders({
            'x-forwarded-for': '203.0.113.4, 10.0.0.1',
            'user-agent': 'Mozilla/5.0',
        }))

        expect(metadata).toEqual({
            ipAddress: '203.0.113.4',
            userAgent: 'Mozilla/5.0',
        })
    })

    it('blocks when rpc reports active cooldown window', async () => {
        const rpcMock = vi.fn(async () => ({
            data: {
                allowed: false,
                cooldown_seconds: 180,
                reason: 'cooldown_active',
            },
            error: null,
        }))

        const result = await checkSignupVelocityGuard({
            supabase: {
                rpc: rpcMock,
            },
            email: 'Test@Example.com',
            metadata: {
                ipAddress: '203.0.113.10',
                userAgent: 'UA',
            },
        })

        expect(result).toEqual({
            allowed: false,
            cooldownSeconds: 180,
            reason: 'cooldown_active',
        })
        expect(rpcMock).toHaveBeenCalledWith('check_signup_trial_rate_limit', {
            input_email: 'test@example.com',
            input_ip: '203.0.113.10',
            input_user_agent: 'UA',
        })
    })

    it('fails open when rpc returns an unexpected error', async () => {
        const rpcMock = vi.fn(async () => ({
            data: null,
            error: { message: 'db unavailable' },
        }))

        const result = await checkSignupVelocityGuard({
            supabase: {
                rpc: rpcMock,
            },
            email: 'test@example.com',
            metadata: {
                ipAddress: null,
                userAgent: null,
            },
        })

        expect(result).toEqual({
            allowed: true,
            cooldownSeconds: 0,
            reason: null,
        })
    })

    it('records failed signup attempts for cooldown escalation', async () => {
        const rpcMock = vi.fn(async () => ({
            data: {
                recorded: true,
            },
            error: null,
        }))

        const result = await recordSignupVelocityAttempt({
            supabase: {
                rpc: rpcMock,
            },
            email: 'another@example.com',
            metadata: {
                ipAddress: '203.0.113.99',
                userAgent: 'UA',
            },
            succeeded: false,
        })

        expect(result).toBe(true)
        expect(rpcMock).toHaveBeenCalledWith('record_signup_trial_attempt', {
            input_email: 'another@example.com',
            input_ip: '203.0.113.99',
            input_user_agent: 'UA',
            input_succeeded: false,
        })
    })
})
