import { describe, expect, it } from 'vitest'
import { buildDefaultSystemSkills, getDefaultSystemSkillTemplates } from '@/lib/skills/default-system-skills'

describe('default system skills', () => {
    it('returns minimal guardrail templates for Turkish locale', () => {
        const templates = getDefaultSystemSkillTemplates('tr')

        expect(templates).toHaveLength(5)
        expect(templates.map((item) => item.title)).toEqual([
            'Karşılama ve İlk Mesaj',
            'İnsan Desteği Talebi',
            'Şikayet ve Memnuniyetsizlik',
            'Acil Talep',
            'Gizlilik ve Veri Talebi'
        ])
        expect(templates[0]).toMatchObject({
            trigger_examples: expect.arrayContaining(['/start', 'Merhaba', 'Selam']),
            response_text: 'Merhaba, yardımcı olayım. Hangi konuda bilgi almak istersiniz?',
            requires_human_handover: false
        })
    })

    it('falls back to English templates for unsupported locale', () => {
        const templates = getDefaultSystemSkillTemplates('de')

        expect(templates).toHaveLength(5)
        expect(templates[0]?.title).toBe('Greeting and First Message')
        expect(templates[0]).toMatchObject({
            trigger_examples: expect.arrayContaining(['/start', 'Hello', 'Hi']),
            response_text: 'Hello, I can help. What would you like to know?',
            requires_human_handover: false
        })
    })

    it('builds insertable skills with mandatory handover and enabled status', () => {
        const skills = buildDefaultSystemSkills('org-1', 'en')

        expect(skills).toHaveLength(5)
        expect(skills.every((skill) => skill.organization_id === 'org-1')).toBe(true)
        expect(skills.every((skill) => skill.enabled)).toBe(true)
        expect(skills.every((skill) => skill.trigger_examples.length >= 3)).toBe(true)
        expect(skills.find((skill) => skill.title === 'Greeting and First Message')).toMatchObject({
            requires_human_handover: false
        })
        expect(skills
            .filter((skill) => skill.title !== 'Greeting and First Message')
            .every((skill) => skill.requires_human_handover)
        ).toBe(true)
    })
})
