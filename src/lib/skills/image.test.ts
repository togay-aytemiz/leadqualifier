import { describe, expect, it } from 'vitest'

import {
    SKILL_IMAGE_BUCKET,
    SKILL_IMAGE_MAX_BYTES,
    SKILL_IMAGE_MAX_EDGE_PX,
    SKILL_IMAGE_MIN_QUALITY,
    SKILL_IMAGE_OUTPUT_EXTENSION,
    SKILL_IMAGE_OUTPUT_MIME_TYPE,
    SKILL_IMAGE_TARGET_QUALITY,
    buildSkillImageStoragePath,
    extractSkillImageStoragePathFromUrl
} from './image'

describe('skill image helpers', () => {
    it('builds a versioned jpeg storage path per organization', () => {
        const storagePath = buildSkillImageStoragePath({
            organizationId: 'org-1',
            version: '20260406120000'
        })

        expect(storagePath).toBe('org-1/skill-image-20260406120000.jpg')
        expect(storagePath.endsWith(`.${SKILL_IMAGE_OUTPUT_EXTENSION}`)).toBe(true)
    })

    it('extracts storage path from the public skill image url', () => {
        const storagePath = extractSkillImageStoragePathFromUrl(
            'https://project.supabase.co/storage/v1/object/public/skill-images/org-1/skill-image-20260406120000.jpg'
        )

        expect(storagePath).toBe('org-1/skill-image-20260406120000.jpg')
    })

    it('returns null for urls outside the skill image bucket', () => {
        const storagePath = extractSkillImageStoragePathFromUrl(
            'https://project.supabase.co/storage/v1/object/public/profile-avatars/user-1/avatar.webp'
        )

        expect(storagePath).toBeNull()
    })

    it('exposes stable output rules for skill images', () => {
        expect(SKILL_IMAGE_BUCKET).toBe('skill-images')
        expect(SKILL_IMAGE_OUTPUT_MIME_TYPE).toBe('image/jpeg')
        expect(SKILL_IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024)
        expect(SKILL_IMAGE_MAX_EDGE_PX).toBe(1600)
        expect(SKILL_IMAGE_TARGET_QUALITY).toBe(0.92)
        expect(SKILL_IMAGE_MIN_QUALITY).toBe(0.9)
    })
})
