import { describe, expect, it } from 'vitest'
import { buildExternalLegalUrl, createExternalLegalLink } from './external-links'

describe('external legal links', () => {
    it('keeps Turkish legal docs on the root askqualy.com path', () => {
        expect(buildExternalLegalUrl('terms', 'tr')).toBe('https://askqualy.com/terms')
        expect(buildExternalLegalUrl('pre-information', 'tr')).toBe('https://askqualy.com/pre-information')
    })

    it('prefixes English legal docs with /en', () => {
        expect(buildExternalLegalUrl('terms', 'en')).toBe('https://askqualy.com/en/terms')
        expect(buildExternalLegalUrl('distance-sales-agreement', 'en')).toBe('https://askqualy.com/en/distance-sales-agreement')
    })

    it('creates safe external links that open in a new tab', () => {
        expect(createExternalLegalLink('kvkk', 'tr')).toEqual({
            href: 'https://askqualy.com/kvkk',
            target: '_blank',
            rel: 'noopener noreferrer'
        })
    })
})
