import { describe, expect, it } from 'vitest'
import {
    filterMissingIntakeFields,
    mergeIntakeFields,
    normalizeIntakeFields,
    normalizeServiceCatalogNames,
    parseServiceCandidatesPayload,
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

describe('normalizeServiceCatalogNames', () => {
    it('dedupes, trims, and drops empty service names', () => {
        expect(normalizeServiceCatalogNames(['  Newborn  ', 'newborn', '', '  '])).toEqual(['Newborn'])
    })

    it('dedupes case-insensitively and keeps first label', () => {
        expect(normalizeServiceCatalogNames(['Yenidoğan çekimi', 'yenidogan cekimi', 'Aile Çekimi'])).toEqual([
            'Yenidoğan çekimi',
            'Aile Çekimi'
        ])
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

describe('parseServiceCandidatesPayload', () => {
    it('parses object payload with services array', () => {
        expect(parseServiceCandidatesPayload('{"services":["Yenidoğan çekimi"," yenidoğan çekimi ","Hamile çekimi"]}')).toEqual([
            'Yenidoğan çekimi',
            'Hamile çekimi'
        ])
    })

    it('parses serviceNames alias key and dedupes values', () => {
        expect(parseServiceCandidatesPayload('{"serviceNames":["newborn shoot","Newborn Shoot","Maternity"]}')).toEqual([
            'newborn shoot',
            'Maternity'
        ])
    })

    it('parses array payload directly', () => {
        expect(parseServiceCandidatesPayload('["Aile çekimi","1 yaş çekimi"]')).toEqual([
            'Aile çekimi',
            '1 yaş çekimi'
        ])
    })

    it('parses fenced JSON payloads', () => {
        const payload = 'Sonuç:\n```json\n{"services":["Yenidoğan","Hamile"]}\n```'
        expect(parseServiceCandidatesPayload(payload)).toEqual([
            'Yenidoğan',
            'Hamile'
        ])
    })

    it('returns null for invalid payload', () => {
        expect(parseServiceCandidatesPayload('not-json')).toBeNull()
    })
})
