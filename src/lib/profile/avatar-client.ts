'use client'

import {
    PROFILE_AVATAR_MAX_BYTES,
    PROFILE_AVATAR_OUTPUT_EXTENSION,
    PROFILE_AVATAR_OUTPUT_MIME_TYPE,
    PROFILE_AVATAR_SIZE_PX
} from './avatar'

const PROFILE_AVATAR_INPUT_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
])

export const PROFILE_AVATAR_INPUT_ACCEPT = Array.from(PROFILE_AVATAR_INPUT_MIME_TYPES).join(',')

export type ProfileAvatarValidationError = 'invalid_type' | 'file_too_large'

export function validateProfileAvatarFile(file: File): ProfileAvatarValidationError | null {
    const mimeType = file.type.trim().toLowerCase()
    if (!PROFILE_AVATAR_INPUT_MIME_TYPES.has(mimeType)) {
        return 'invalid_type'
    }

    if (file.size > PROFILE_AVATAR_MAX_BYTES) {
        return 'file_too_large'
    }

    return null
}

function createImageElement(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('Could not load avatar image'))
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
    return { width: PROFILE_AVATAR_SIZE_PX, height: PROFILE_AVATAR_SIZE_PX }
}

export async function convertProfileAvatarToWebP(file: File) {
    const source = await loadImageSource(file)
    const canvas = document.createElement('canvas')
    canvas.width = PROFILE_AVATAR_SIZE_PX
    canvas.height = PROFILE_AVATAR_SIZE_PX

    const context = canvas.getContext('2d')
    if (!context) {
        throw new Error('Canvas is not available for avatar conversion')
    }

    const { width, height } = resolveSourceDimensions(source)
    const shortestSide = Math.min(width, height)
    const sourceX = Math.max(0, (width - shortestSide) / 2)
    const sourceY = Math.max(0, (height - shortestSide) / 2)

    context.drawImage(
        source,
        sourceX,
        sourceY,
        shortestSide,
        shortestSide,
        0,
        0,
        PROFILE_AVATAR_SIZE_PX,
        PROFILE_AVATAR_SIZE_PX
    )

    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((value) => resolve(value), PROFILE_AVATAR_OUTPUT_MIME_TYPE, 0.82)
    })

    if (!blob) {
        throw new Error('Avatar conversion failed')
    }

    const originalName = file.name.replace(/\.[^.]+$/, '') || 'avatar'
    return new File([blob], `${originalName}.${PROFILE_AVATAR_OUTPUT_EXTENSION}`, {
        type: PROFILE_AVATAR_OUTPUT_MIME_TYPE
    })
}
