'use client'

import {
    SKILL_IMAGE_MAX_BYTES,
    SKILL_IMAGE_MAX_EDGE_PX,
    SKILL_IMAGE_OUTPUT_EXTENSION,
    SKILL_IMAGE_OUTPUT_MIME_TYPE,
    SKILL_IMAGE_TARGET_QUALITY
} from './image'

const SKILL_IMAGE_INPUT_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
])

export const SKILL_IMAGE_INPUT_ACCEPT = Array.from(SKILL_IMAGE_INPUT_MIME_TYPES).join(',')

export type SkillImageValidationError = 'invalid_type' | 'file_too_large'

export function validateSkillImageFile(file: File): SkillImageValidationError | null {
    const mimeType = file.type.trim().toLowerCase()
    if (!SKILL_IMAGE_INPUT_MIME_TYPES.has(mimeType)) {
        return 'invalid_type'
    }

    if (file.size > SKILL_IMAGE_MAX_BYTES) {
        return 'file_too_large'
    }

    return null
}

export function resolveSkillImageTargetSize(args: {
    width: number
    height: number
    maxEdgePx?: number
}) {
    const maxEdgePx = args.maxEdgePx ?? SKILL_IMAGE_MAX_EDGE_PX
    const width = Math.max(1, Math.round(args.width))
    const height = Math.max(1, Math.round(args.height))
    const longEdge = Math.max(width, height)

    if (longEdge <= maxEdgePx) {
        return { width, height }
    }

    const scale = maxEdgePx / longEdge
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
    }
}

function createImageElement(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('Could not load skill image'))
        image.src = src
    })
}

async function loadImageSource(file: File) {
    if (typeof createImageBitmap === 'function') {
        try {
            return await createImageBitmap(file)
        } catch {
            // Fall through to Image-based decoding.
        }
    }

    const objectUrl = URL.createObjectURL(file)
    try {
        return await createImageElement(objectUrl)
    } finally {
        URL.revokeObjectURL(objectUrl)
    }
}

function resolveSourceDimensions(source: ImageBitmap | HTMLImageElement) {
    if ('width' in source && 'height' in source) {
        return { width: source.width, height: source.height }
    }

    return { width: SKILL_IMAGE_MAX_EDGE_PX, height: SKILL_IMAGE_MAX_EDGE_PX }
}

export async function convertSkillImageToJpeg(file: File) {
    const source = await loadImageSource(file)
    const sourceDimensions = resolveSourceDimensions(source)
    const targetSize = resolveSkillImageTargetSize(sourceDimensions)
    const canvas = document.createElement('canvas')
    canvas.width = targetSize.width
    canvas.height = targetSize.height

    const context = canvas.getContext('2d')
    if (!context) {
        throw new Error('Canvas is not available for skill image conversion')
    }

    // JPEG does not preserve transparency; flatten onto white first.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, targetSize.width, targetSize.height)
    context.drawImage(source, 0, 0, targetSize.width, targetSize.height)

    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((value) => resolve(value), SKILL_IMAGE_OUTPUT_MIME_TYPE, SKILL_IMAGE_TARGET_QUALITY)
    })

    if (!blob) {
        throw new Error('Skill image conversion failed')
    }

    const originalName = file.name.replace(/\.[^.]+$/, '') || 'skill-image'
    return {
        file: new File([blob], `${originalName}.${SKILL_IMAGE_OUTPUT_EXTENSION}`, {
            type: SKILL_IMAGE_OUTPUT_MIME_TYPE
        }),
        width: targetSize.width,
        height: targetSize.height
    }
}
