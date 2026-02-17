import { afterEach, describe, expect, it } from 'vitest'

import {
    resetSkillsMaintenanceCache,
    shouldRunSkillsMaintenanceForOrganization
} from '@/lib/skills/maintenance-cache'

describe('shouldRunSkillsMaintenanceForOrganization', () => {
    afterEach(() => {
        resetSkillsMaintenanceCache()
    })

    it('runs once per organization in a process', () => {
        expect(shouldRunSkillsMaintenanceForOrganization('org-a')).toBe(true)
        expect(shouldRunSkillsMaintenanceForOrganization('org-a')).toBe(false)
    })

    it('tracks organizations independently', () => {
        expect(shouldRunSkillsMaintenanceForOrganization('org-a')).toBe(true)
        expect(shouldRunSkillsMaintenanceForOrganization('org-b')).toBe(true)
    })

    it('skips invalid organization ids', () => {
        expect(shouldRunSkillsMaintenanceForOrganization('')).toBe(false)
        expect(shouldRunSkillsMaintenanceForOrganization('   ')).toBe(false)
    })
})
