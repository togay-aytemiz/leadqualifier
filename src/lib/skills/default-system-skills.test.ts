import { describe, expect, it } from 'vitest'
import { buildDefaultSystemSkills, getDefaultSystemSkillTemplates } from '@/lib/skills/default-system-skills'

describe('default system skills', () => {
    it('returns minimal guardrail templates for Turkish locale', () => {
        const templates = getDefaultSystemSkillTemplates('tr')

        expect(templates).toHaveLength(4)
        expect(templates.map((item) => item.title)).toEqual([
            'İnsan Desteği Talebi',
            'Şikayet ve Memnuniyetsizlik',
            'Acil Talep',
            'Gizlilik ve Veri Talebi'
        ])
    })

    it('falls back to English templates for unsupported locale', () => {
        const templates = getDefaultSystemSkillTemplates('de')

        expect(templates).toHaveLength(4)
        expect(templates[0]?.title).toBe('Request Human Support')
    })

    it('builds insertable skills with mandatory handover and enabled status', () => {
        const skills = buildDefaultSystemSkills('org-1', 'en')

        expect(skills).toHaveLength(4)
        expect(skills.every((skill) => skill.organization_id === 'org-1')).toBe(true)
        expect(skills.every((skill) => skill.enabled && skill.requires_human_handover)).toBe(true)
        expect(skills.every((skill) => skill.trigger_examples.length >= 3)).toBe(true)
    })
})
