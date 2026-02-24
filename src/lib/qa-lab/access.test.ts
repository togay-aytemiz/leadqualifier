import { describe, expect, it } from 'vitest'

import { canAccessQaLab, isQaLabAllowedAdminEmail } from '@/lib/qa-lab/access'

describe('qa lab access', () => {
    it('allows only the configured admin email', () => {
        expect(isQaLabAllowedAdminEmail('togayaytemiz@gmail.com')).toBe(true)
        expect(isQaLabAllowedAdminEmail('  TOGAYAYTEMIZ@GMAIL.COM  ')).toBe(true)
        expect(isQaLabAllowedAdminEmail('someone@example.com')).toBe(false)
        expect(isQaLabAllowedAdminEmail(null)).toBe(false)
    })

    it('allows tenant QA Lab only for admin role with configured email', () => {
        expect(canAccessQaLab({
            userEmail: 'togayaytemiz@gmail.com',
            userRole: 'admin'
        })).toBe(true)

        expect(canAccessQaLab({
            userEmail: 'togayaytemiz@gmail.com',
            userRole: 'owner'
        })).toBe(false)

        expect(canAccessQaLab({
            userEmail: 'someone@example.com',
            userRole: 'admin'
        })).toBe(false)
    })

    it('allows system-admin QA Lab only for configured email', () => {
        expect(canAccessQaLab({
            userEmail: 'togayaytemiz@gmail.com',
            isSystemAdmin: true
        })).toBe(true)

        expect(canAccessQaLab({
            userEmail: 'someone@example.com',
            isSystemAdmin: true
        })).toBe(false)
    })
})
