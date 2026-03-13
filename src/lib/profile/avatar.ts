export const PROFILE_AVATAR_BUCKET = 'profile-avatars'
export const PROFILE_AVATAR_OUTPUT_EXTENSION = 'webp'
export const PROFILE_AVATAR_OUTPUT_MIME_TYPE = 'image/webp'
export const PROFILE_AVATAR_SIZE_PX = 512
export const PROFILE_AVATAR_MAX_BYTES = 10 * 1024 * 1024

function normalizeVersion(version: string) {
    const trimmed = version.trim()
    return trimmed.length > 0 ? trimmed : `${Date.now()}`
}

export function buildProfileAvatarStoragePath(args: { userId: string; version?: string }) {
    const userId = args.userId.trim()
    const version = normalizeVersion(args.version ?? `${Date.now()}`)
    return `${userId}/avatar-${version}.${PROFILE_AVATAR_OUTPUT_EXTENSION}`
}

export function extractProfileAvatarStoragePathFromUrl(url: string | null | undefined) {
    if (typeof url !== 'string') return null
    const trimmed = url.trim()
    if (!trimmed) return null

    try {
        const parsedUrl = new URL(trimmed)
        const marker = `/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/`
        const markerIndex = parsedUrl.pathname.indexOf(marker)
        if (markerIndex === -1) return null

        const storagePath = parsedUrl.pathname.slice(markerIndex + marker.length)
        return storagePath.length > 0 ? decodeURIComponent(storagePath) : null
    } catch {
        return null
    }
}
