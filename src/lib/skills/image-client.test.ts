import { describe, expect, it } from 'vitest'

import {
    SKILL_IMAGE_INPUT_ACCEPT,
    resolveSkillImageTargetSize,
    validateSkillImageFile
} from './image-client'

describe('skill image client helpers', () => {
    it('accepts common image file types and rejects unsupported mime types', () => {
        const validFile = new File(['image'], 'offer.jpg', { type: 'image/jpeg' })
        const invalidFile = new File(['text'], 'notes.txt', { type: 'text/plain' })

        expect(validateSkillImageFile(validFile)).toBeNull()
        expect(validateSkillImageFile(invalidFile)).toBe('invalid_type')
        expect(SKILL_IMAGE_INPUT_ACCEPT).toContain('image/webp')
    })

    it('rejects original files larger than 5 MB', () => {
        const tooLargeFile = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {
            type: 'image/png'
        })

        expect(validateSkillImageFile(tooLargeFile)).toBe('file_too_large')
    })

    it('downscales large images by long edge while preserving aspect ratio', () => {
        expect(resolveSkillImageTargetSize({ width: 2400, height: 1200 })).toEqual({
            width: 1600,
            height: 800
        })
    })

    it('does not upscale images already below the max edge', () => {
        expect(resolveSkillImageTargetSize({ width: 1200, height: 900 })).toEqual({
            width: 1200,
            height: 900
        })
    })
})
