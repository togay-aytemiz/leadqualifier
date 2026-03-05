import { describe, expect, it } from 'vitest'

import { getAvailableActionTargetSkills } from '@/components/skills/action-target-skills'
import type { Skill } from '@/types/database'

function buildSkill(overrides: Partial<Skill>): Skill {
    return {
        id: 'skill-1',
        organization_id: 'org-1',
        title: 'Skill',
        trigger_examples: ['a', 'b', 'c'],
        response_text: 'response',
        enabled: true,
        requires_human_handover: false,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        ...overrides
    }
}

describe('getAvailableActionTargetSkills', () => {
    it('excludes selected skill and disabled skills', () => {
        const skills = [
            buildSkill({ id: 'skill-1', enabled: true, title: 'Selected' }),
            buildSkill({ id: 'skill-2', enabled: true, title: 'Enabled target' }),
            buildSkill({ id: 'skill-3', enabled: false, title: 'Disabled target' })
        ]

        const targets = getAvailableActionTargetSkills(skills, 'skill-1')

        expect(targets.map((skill) => skill.id)).toEqual(['skill-2'])
    })

    it('returns all enabled skills when no selected skill exists', () => {
        const skills = [
            buildSkill({ id: 'skill-1', enabled: true }),
            buildSkill({ id: 'skill-2', enabled: false }),
            buildSkill({ id: 'skill-3', enabled: true })
        ]

        const targets = getAvailableActionTargetSkills(skills, null)

        expect(targets.map((skill) => skill.id)).toEqual(['skill-1', 'skill-3'])
    })
})
