import { describe, expect, it } from 'vitest'
import {
    filterMissingIntakeFields,
    mergeIntakeFields,
    normalizeIntakeFields,
    parseRequiredIntakeFieldsPayload
} from '@/lib/leads/offering-profile-utils'

describe('normalizeIntakeFields', () => {
    it('dedupes, trims, and drops empty values', () => {
        expect(normalizeIntakeFields(['  budget ', 'budget', '', '  '])).toEqual(['budget'])
    })

    it('dedupes case-insensitively and keeps first label', () => {
        expect(normalizeIntakeFields(['Telefon', 'telefon', ' TELEFON ', 'Ad Soyad'])).toEqual([
            'Telefon',
            'Ad Soyad'
        ])
    })
})

describe('mergeIntakeFields', () => {
    it('appends new fields and preserves existing ones', () => {
        expect(mergeIntakeFields(['budget'], ['date', 'budget'])).toEqual(['budget', 'date'])
    })

    it('prevents duplicates even when casing differs', () => {
        expect(mergeIntakeFields(['Telefon'], ['telefon', 'Bölge'])).toEqual(['Telefon', 'Bölge'])
    })
})

describe('filterMissingIntakeFields', () => {
    it('returns only fields missing from existing set', () => {
        expect(filterMissingIntakeFields(['Telefon', 'Bütçe'], ['telefon', 'Adres', ' BÜTÇE '])).toEqual(['Adres'])
    })
})

describe('parseRequiredIntakeFieldsPayload', () => {
    it('parses object payload with required_fields array', () => {
        expect(parseRequiredIntakeFieldsPayload('{"required_fields":["Telefon","telefon","Adres"]}')).toEqual([
            'Telefon',
            'Adres'
        ])
    })

    it('parses array payload directly', () => {
        expect(parseRequiredIntakeFieldsPayload('["Bütçe","Tarih"]')).toEqual(['Bütçe', 'Tarih'])
    })

    it('parses fenced JSON payloads with surrounding text', () => {
        const payload = 'Sonuc:\n```json\n{"required_fields":["Telefon","Adres"]}\n```'
        expect(parseRequiredIntakeFieldsPayload(payload)).toEqual(['Telefon', 'Adres'])
    })

    it('returns null for invalid payload', () => {
        expect(parseRequiredIntakeFieldsPayload('nope')).toBeNull()
    })
})
