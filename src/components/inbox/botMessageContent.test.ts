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

    it('splits disclaimer when line endings are CRLF and quote line has leading space', () => {
        const parsed = splitBotMessageDisclaimer('Merhaba\r\n\r\n > Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')

        expect(parsed.body).toBe('Merhaba')
        expect(parsed.disclaimer).toBe('Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
    })

    it('splits disclaimer when there is a single newline before quote line', () => {
        const parsed = splitBotMessageDisclaimer('Merhaba\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')

        expect(parsed.body).toBe('Merhaba')
        expect(parsed.disclaimer).toBe('Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
    })

    it('splits disclaimer when trailing whitespace exists after quoted line', () => {
        const parsed = splitBotMessageDisclaimer('Merhaba\n\n> Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.\n')

        expect(parsed.body).toBe('Merhaba')
        expect(parsed.disclaimer).toBe('Bu mesaj AI bot tarafından oluşturuldu, hata içerebilir.')
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

    it('falls back to alternative metadata keys and nested skill object', () => {
        expect(extractSkillTitleFromMetadata({ skillTitle: 'Hizmet Bilgisi' })).toBe('Hizmet Bilgisi')
        expect(extractSkillTitleFromMetadata({ matched_skill_title: 'Hizmet Bilgisi 2' })).toBe('Hizmet Bilgisi 2')
        expect(extractSkillTitleFromMetadata({ skill_name: 'Hizmet Bilgisi 3' })).toBe('Hizmet Bilgisi 3')
        expect(extractSkillTitleFromMetadata({ skill: { title: 'Hizmet Bilgisi 4' } })).toBe('Hizmet Bilgisi 4')
    })

    it('does not show skill id when title is missing', () => {
        expect(extractSkillTitleFromMetadata({ skill_id: 'skill-complaint' })).toBeNull()
        expect(extractSkillTitleFromMetadata({ skill_id: 'd2d41d40-63d1-4c81-ba74-2289945c99af' })).toBeNull()
    })

    it('parses metadata when realtime payload provides JSON as string', () => {
        expect(extractSkillTitleFromMetadata('{"skill_title":"Şikayet ve Memnuniyetsizlik"}'))
            .toBe('Şikayet ve Memnuniyetsizlik')
    })
})
