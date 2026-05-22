import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    jpegMock,
    sharpMock,
    toBufferMock
} = vi.hoisted(() => ({
    jpegMock: vi.fn(),
    sharpMock: vi.fn(),
    toBufferMock: vi.fn()
}))

vi.mock('sharp', () => ({
    default: sharpMock
}))

import { GET } from '@/app/api/media/instagram-skill-image/route'

describe('instagram skill image proxy route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'

        jpegMock.mockReturnValue({ toBuffer: toBufferMock })
        sharpMock.mockReturnValue({ jpeg: jpegMock })
        toBufferMock.mockResolvedValue(Buffer.from('jpeg-binary'))
        vi.stubGlobal('fetch', vi.fn())
    })

    it('rejects non-supabase skill image sources', async () => {
        const req = new NextRequest(
            'https://app.askqualy.com/api/media/instagram-skill-image?source=https://cdn.example.com/skill-image.webp'
        )

        const res = await GET(req)

        expect(res.status).toBe(400)
        await expect(res.json()).resolves.toEqual({ error: 'Invalid skill image source' })
    })

    it('rejects sources that only contain the skill-images path as a prefix trick', async () => {
        const req = new NextRequest(
            'https://app.askqualy.com/api/media/instagram-skill-image?source='
            + encodeURIComponent('https://example.supabase.co/storage/v1/object/public/skill-images-malicious/org-1/image.webp')
        )

        const res = await GET(req)

        expect(res.status).toBe(400)
        expect(sharpMock).not.toHaveBeenCalled()
    })

    it('rejects oversized source images before buffering them into sharp', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock.mockResolvedValue(new Response(Buffer.from('too-large'), {
            status: 200,
            headers: {
                'content-type': 'image/webp',
                'content-length': String((5 * 1024 * 1024) + 1)
            }
        }))

        const req = new NextRequest(
            'https://app.askqualy.com/api/media/instagram-skill-image?source='
            + encodeURIComponent('https://example.supabase.co/storage/v1/object/public/skill-images/org-1/skill-image.webp')
        )

        const res = await GET(req)

        expect(res.status).toBe(413)
        await expect(res.json()).resolves.toEqual({ error: 'Skill image is too large' })
        expect(sharpMock).not.toHaveBeenCalled()
    })

    it('rejects non-raster content types before image conversion', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock.mockResolvedValue(new Response('<svg />', {
            status: 200,
            headers: {
                'content-type': 'image/svg+xml'
            }
        }))

        const req = new NextRequest(
            'https://app.askqualy.com/api/media/instagram-skill-image?source='
            + encodeURIComponent('https://example.supabase.co/storage/v1/object/public/skill-images/org-1/skill-image.svg')
        )

        const res = await GET(req)

        expect(res.status).toBe(415)
        await expect(res.json()).resolves.toEqual({ error: 'Unsupported skill image type' })
        expect(sharpMock).not.toHaveBeenCalled()
    })

    it('converts allowed skill images to jpeg', async () => {
        const fetchMock = vi.mocked(fetch)
        fetchMock.mockResolvedValue(new Response(Buffer.from('webp-binary'), {
            status: 200,
            headers: {
                'content-type': 'image/webp'
            }
        }))

        const req = new NextRequest(
            'https://app.askqualy.com/api/media/instagram-skill-image?source='
            + encodeURIComponent('https://example.supabase.co/storage/v1/object/public/skill-images/org-1/skill-image.webp')
        )

        const res = await GET(req)

        expect(fetchMock).toHaveBeenCalledWith(
            'https://example.supabase.co/storage/v1/object/public/skill-images/org-1/skill-image.webp',
            expect.objectContaining({
                cache: 'force-cache'
            })
        )
        expect(sharpMock).toHaveBeenCalledWith(expect.any(Buffer))
        expect(jpegMock).toHaveBeenCalledWith({
            quality: 92,
            mozjpeg: true
        })
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toBe('image/jpeg')
        const body = Buffer.from(await res.arrayBuffer())
        expect(body.toString()).toBe('jpeg-binary')
    })
})
