import { describe, expect, it } from 'vitest'

import {
    buildReplyButtonsForSkill,
    buildSkillActionButtonId,
    parseSkillActionButtonId,
    sanitizeSkillActions
} from '@/lib/skills/skill-actions'

describe('skill action helpers', () => {
    it('sanitizes and filters invalid actions', () => {
        const actions = sanitizeSkillActions([
            {
                id: 'action-1',
                type: 'trigger_skill',
                label: 'Randevu Al',
                target_skill_id: 'skill-2'
            },
            {
                id: 'action-2',
                type: 'open_url',
                label: 'Instagram',
                url: 'https://instagram.com/acme'
            },
            {
                id: 'action-3',
                type: 'open_url',
                label: 'Invalid URL',
                url: 'javascript:alert(1)'
            },
            {
                id: 'action-4',
                type: 'trigger_skill',
                label: '',
                target_skill_id: 'skill-3'
            }
        ])

        expect(actions).toEqual([
            {
                id: 'action-1',
                type: 'trigger_skill',
                label: 'Randevu Al',
                target_skill_id: 'skill-2'
            },
            {
                id: 'action-2',
                type: 'open_url',
                label: 'Instagram',
                url: 'https://instagram.com/acme'
            }
        ])
    })

    it('does not cap sanitized skill actions by channel-specific button limits', () => {
        const actions = sanitizeSkillActions([
            {
                id: 'action-1',
                type: 'trigger_skill',
                label: 'Aksiyon 1',
                target_skill_id: 'skill-1'
            },
            {
                id: 'action-2',
                type: 'trigger_skill',
                label: 'Aksiyon 2',
                target_skill_id: 'skill-2'
            },
            {
                id: 'action-3',
                type: 'trigger_skill',
                label: 'Aksiyon 3',
                target_skill_id: 'skill-3'
            },
            {
                id: 'action-4',
                type: 'open_url',
                label: 'Aksiyon 4',
                url: 'https://example.com/4'
            }
        ])

        expect(actions).toHaveLength(4)
        expect(actions.map((action) => action.id)).toEqual([
            'action-1',
            'action-2',
            'action-3',
            'action-4'
        ])
    })

    it('builds and parses skill action button ids', () => {
        const buttonId = buildSkillActionButtonId('skill-1', 'action-1')
        expect(buttonId).toBe('skill_action:skill-1:action-1')
        expect(parseSkillActionButtonId(buttonId)).toEqual({
            sourceSkillId: 'skill-1',
            actionId: 'action-1'
        })

        expect(parseSkillActionButtonId('invalid')).toBeNull()
    })

    it('builds reply buttons from skill actions', () => {
        const buttons = buildReplyButtonsForSkill('skill-1', [
            {
                id: 'action-1',
                type: 'trigger_skill',
                label: 'Randevu Al',
                target_skill_id: 'skill-2'
            },
            {
                id: 'action-2',
                type: 'open_url',
                label: 'Instagram',
                url: 'https://instagram.com/acme'
            },
            {
                id: 'action-3',
                type: 'open_url',
                label: 'Web',
                url: 'https://acme.com'
            },
            {
                id: 'action-4',
                type: 'open_url',
                label: 'LinkedIn',
                url: 'https://linkedin.com/company/acme'
            }
        ])

        expect(buttons).toEqual([
            { id: 'skill_action:skill-1:action-1', title: 'Randevu Al' },
            { id: 'skill_action:skill-1:action-2', title: 'Instagram' },
            { id: 'skill_action:skill-1:action-3', title: 'Web' }
        ])
    })
})
