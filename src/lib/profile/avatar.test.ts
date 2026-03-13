import { describe, expect, it } from 'vitest'
import {
    PROFILE_AVATAR_BUCKET,
    PROFILE_AVATAR_OUTPUT_EXTENSION,
    PROFILE_AVATAR_OUTPUT_MIME_TYPE,
    PROFILE_AVATAR_SIZE_PX,
    buildProfileAvatarStoragePath,
    extractProfileAvatarStoragePathFromUrl
} from './avatar'

describe('profile avatar helpers', () => {
    it('builds a versioned webp storage path per user', () => {
        const storagePath = buildProfileAvatarStoragePath({
            userId: 'user-1',
            version: '20260313120000'
        })

        expect(storagePath).toBe('user-1/avatar-20260313120000.webp')
        expect(storagePath.endsWith(`.${PROFILE_AVATAR_OUTPUT_EXTENSION}`)).toBe(true)
    })

    it('extracts storage path from the public avatar url', () => {
        const storagePath = extractProfileAvatarStoragePathFromUrl(
            'https://project.supabase.co/storage/v1/object/public/profile-avatars/user-1/avatar-20260313120000.webp'
        )

        expect(storagePath).toBe('user-1/avatar-20260313120000.webp')
    })

    it('returns null for urls outside the profile avatar bucket', () => {
        const storagePath = extractProfileAvatarStoragePathFromUrl(
            'https://project.supabase.co/storage/v1/object/public/whatsapp-media/org-1/file.webp'
        )

        expect(storagePath).toBeNull()
    })

    it('exposes stable avatar output rules', () => {
        expect(PROFILE_AVATAR_BUCKET).toBe('profile-avatars')
        expect(PROFILE_AVATAR_OUTPUT_MIME_TYPE).toBe('image/webp')
        expect(PROFILE_AVATAR_SIZE_PX).toBe(512)
    })
})
