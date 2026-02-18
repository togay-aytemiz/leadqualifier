import { describe, expect, it } from 'vitest'
import { normalizeDeleteOrganizationDataInput } from './data-deletion'

describe('normalizeDeleteOrganizationDataInput', () => {
    it('normalizes valid input', () => {
        const result = normalizeDeleteOrganizationDataInput({
            organizationId: '  org-1  ',
            password: '  secret123  '
        })

        expect(result).toEqual({
            organizationId: 'org-1',
            password: 'secret123'
        })
    })

    it('rejects empty password', () => {
        expect(() => normalizeDeleteOrganizationDataInput({
            organizationId: 'org-1',
            password: '   '
        })).toThrow('Missing password')
    })

    it('rejects missing organization id', () => {
        expect(() => normalizeDeleteOrganizationDataInput({
            organizationId: '   ',
            password: 'secret123'
        })).toThrow('Invalid organization id')
    })
})
