import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SKILLS_CONTAINER_PATH = path.join(
    process.cwd(),
    'src/components/skills/SkillsContainer.tsx'
)

describe('skills container source guard', () => {
    it('keeps the skill action editor hidden behind a temporary feature flag', () => {
        expect(fs.existsSync(SKILLS_CONTAINER_PATH)).toBe(true)

        const source = fs.existsSync(SKILLS_CONTAINER_PATH)
            ? fs.readFileSync(SKILLS_CONTAINER_PATH, 'utf8')
            : ''

        expect(source).toContain('const SKILL_ACTIONS_EDITOR_ENABLED = false')
        expect(source).toContain('{SKILL_ACTIONS_EDITOR_ENABLED && (')
    })
})
