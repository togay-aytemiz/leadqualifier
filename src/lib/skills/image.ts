export const SKILL_IMAGE_BUCKET = 'skill-images'
export const SKILL_IMAGE_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/webp'] as const
export const SKILL_IMAGE_OUTPUT_EXTENSION = 'jpg'
export const SKILL_IMAGE_OUTPUT_MIME_TYPE = 'image/jpeg'
export const SKILL_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const SKILL_IMAGE_MAX_EDGE_PX = 1600
export const SKILL_IMAGE_TARGET_QUALITY = 0.92
export const SKILL_IMAGE_MIN_QUALITY = 0.9

function normalizeVersion(version: string) {
    const trimmed = version.trim()
    return trimmed.length > 0 ? trimmed : `${Date.now()}`
}

export function buildSkillImageStoragePath(args: { organizationId: string; version?: string }) {
    const organizationId = args.organizationId.trim()
    const version = normalizeVersion(args.version ?? `${Date.now()}`)
    return `${organizationId}/skill-image-${version}.${SKILL_IMAGE_OUTPUT_EXTENSION}`
}

export function extractSkillImageStoragePathFromUrl(url: string | null | undefined) {
    if (typeof url !== 'string') return null
    const trimmed = url.trim()
    if (!trimmed) return null

    try {
        const parsedUrl = new URL(trimmed)
        const marker = `/storage/v1/object/public/${SKILL_IMAGE_BUCKET}/`
        const markerIndex = parsedUrl.pathname.indexOf(marker)
        if (markerIndex === -1) return null

        const storagePath = parsedUrl.pathname.slice(markerIndex + marker.length)
        return storagePath.length > 0 ? decodeURIComponent(storagePath) : null
    } catch {
        return null
    }
}
