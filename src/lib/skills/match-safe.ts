import type { SkillMatch } from '@/types/database'

export async function matchSkillsSafely(options: {
    matcher: () => Promise<SkillMatch[]>
    context?: Record<string, unknown>
}) {
    try {
        const matches = await options.matcher()
        return Array.isArray(matches) ? matches : []
    } catch (error) {
        console.warn('Skill matching failed; continuing with KB/fallback path.', {
            ...options.context,
            error
        })
        return [] as SkillMatch[]
    }
}
