import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

export const runtime = 'nodejs'

const SKILL_IMAGE_BUCKET_PATH = '/storage/v1/object/public/skill-images/'
const MAX_SOURCE_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_SOURCE_CONTENT_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
])

function readTrimmedString(value: string | null | undefined) {
    const trimmed = value?.trim() ?? ''
    return trimmed.length > 0 ? trimmed : null
}

function isAllowedSkillImageSource(sourceUrl: string) {
    const supabaseUrl = readTrimmedString(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? ''

    try {
        const source = new URL(sourceUrl)
        const supabase = new URL(supabaseUrl)

        return source.origin === supabase.origin && source.pathname.startsWith(SKILL_IMAGE_BUCKET_PATH)
    } catch {
        return false
    }
}

function readContentLength(headers: Headers) {
    const raw = headers.get('content-length')
    if (!raw) return null

    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function readContentType(headers: Headers) {
    const raw = headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
    return raw || null
}

export async function GET(req: NextRequest) {
    const sourceUrl = readTrimmedString(req.nextUrl.searchParams.get('source'))
    if (!sourceUrl || !isAllowedSkillImageSource(sourceUrl)) {
        return NextResponse.json({ error: 'Invalid skill image source' }, { status: 400 })
    }

    let sourceResponse: Response
    try {
        sourceResponse = await fetch(sourceUrl, {
            headers: {
                Accept: 'image/*'
            },
            cache: 'force-cache'
        })
    } catch {
        return NextResponse.json({ error: 'Could not fetch skill image' }, { status: 502 })
    }

    if (!sourceResponse.ok) {
        return NextResponse.json({ error: 'Could not fetch skill image' }, { status: 502 })
    }

    const contentType = readContentType(sourceResponse.headers)
    if (!contentType || !ALLOWED_SOURCE_CONTENT_TYPES.has(contentType)) {
        return NextResponse.json({ error: 'Unsupported skill image type' }, { status: 415 })
    }

    const contentLength = readContentLength(sourceResponse.headers)
    if (contentLength !== null && contentLength > MAX_SOURCE_IMAGE_BYTES) {
        return NextResponse.json({ error: 'Skill image is too large' }, { status: 413 })
    }

    const sourceArrayBuffer = await sourceResponse.arrayBuffer()
    if (sourceArrayBuffer.byteLength > MAX_SOURCE_IMAGE_BYTES) {
        return NextResponse.json({ error: 'Skill image is too large' }, { status: 413 })
    }

    let jpegBuffer: Buffer
    try {
        jpegBuffer = await sharp(Buffer.from(sourceArrayBuffer))
            .jpeg({
                quality: 92,
                mozjpeg: true
            })
            .toBuffer()
    } catch {
        return NextResponse.json({ error: 'Could not convert skill image' }, { status: 502 })
    }

    return new NextResponse(new Uint8Array(jpegBuffer), {
        headers: {
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Type': 'image/jpeg'
        }
    })
}
