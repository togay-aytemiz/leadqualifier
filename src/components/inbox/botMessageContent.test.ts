import { describe, expect, it } from 'vitest'
import { extractSkillTitleFromMetadata, splitBotMessageDisclaimer } from './botMessageContent'

describe('splitBotMessageDisclaimer', () => {
    it('splits trailing disclaimer line from bot content', () => {
        const parsed = splitBotMessageDisclaimer('Merhaba\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')

        expect(parsed.body).toBe('Merhaba')
        expect(parsed.disclaimer).toBe('Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
    })

    it('does not split regular content without trailing quote line', () => {
        const parsed = splitBotMessageDisclaimer('Merhaba nasılsınız?')

        expect(parsed.body).toBe('Merhaba nasılsınız?')
        expect(parsed.disclaimer).toBeNull()
    })

    it('does not split inline > characters in normal text', () => {
        const parsed = splitBotMessageDisclaimer('A > B karşılaştırması')

        expect(parsed.body).toBe('A > B karşılaştırması')
        expect(parsed.disclaimer).toBeNull()
    })
})

describe('extractSkillTitleFromMetadata', () => {
    it('returns skill title from metadata', () => {
        expect(extractSkillTitleFromMetadata({
            skill_id: 'skill-1',
            skill_title: 'Şikayet ve Memnuniyetsizlik'
        })).toBe('Şikayet ve Memnuniyetsizlik')
    })

    it('returns null for non-object metadata', () => {
        expect(extractSkillTitleFromMetadata(null)).toBeNull()
        expect(extractSkillTitleFromMetadata('x')).toBeNull()
    })
})
