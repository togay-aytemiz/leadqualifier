import type { Skill } from '@/types/database'

export function getAvailableActionTargetSkills(skills: Skill[], selectedSkillId: string | null) {
    return skills.filter((skill) => skill.id !== selectedSkillId && skill.enabled)
}
