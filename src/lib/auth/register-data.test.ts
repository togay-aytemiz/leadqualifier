import { describe, expect, it } from 'vitest'
import { normalizeRegisterFormData } from './register-data'

describe('normalizeRegisterFormData', () => {
    it('normalizes and trims values, defaulting optional companyName to empty', () => {
        const formData = new FormData()
        formData.set('email', '  jane@example.com  ')
        formData.set('password', '  secret123  ')
        formData.set('fullName', '  Jane Doe  ')

        expect(normalizeRegisterFormData(formData)).toEqual({
            email: 'jane@example.com',
            password: 'secret123',
            fullName: 'Jane Doe',
            companyName: '',
        })
    })

    it('keeps companyName when provided', () => {
        const formData = new FormData()
        formData.set('email', 'user@example.com')
        formData.set('password', '123456')
        formData.set('fullName', 'User Name')
        formData.set('companyName', '  ACME  ')

        expect(normalizeRegisterFormData(formData).companyName).toBe('ACME')
    })
})
