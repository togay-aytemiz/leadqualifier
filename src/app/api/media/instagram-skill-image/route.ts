import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

export const runtime = 'nodejs'

const SKILL_IMAGE_BUCKET_PATH = '/storage/v1/object/public/skill-images/'

function readTrimmedString(value: string | null | undefined) {
    const trimmed = value?.trim() ?? ''
    return trimmed.length > 0 ? trimmed : null
}

function isAllowedSkillImageSource(sourceUrl: string) {
    const supabaseUrl = readTrimmedString(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? ''

    try {
        const source = new URL(sourceUrl)
        const supabase = new URL(supabaseUrl)

        return source.origin === supabase.origin && source.pathname.includes(SKILL_IMAGE_BUCKET_PATH)
    } catch {
        return false
    }
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

    const sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer())
    const jpegBuffer = await sharp(sourceBuffer)
        .jpeg({
            quality: 92,
            mozjpeg: true
        })
        .toBuffer()

    return new NextResponse(new Uint8Array(jpegBuffer), {
        headers: {
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Type': 'image/jpeg'
        }
    })
}
