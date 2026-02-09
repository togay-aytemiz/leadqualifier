import { describe, expect, it } from 'vitest'

import {
    getAuthPreviewBubbleEnterClasses,
    getAuthPreviewMessageStackClasses,
    getAuthPreviewThreadFrameClasses,
    getAuthPreviewThreadTopFadeClasses,
    getAuthPreviewThreadViewportClasses,
} from '@/components/auth/authMessengerPreviewStyles'

describe('auth messenger preview styles', () => {
    it('keeps long conversations inside a fixed viewport so new bubbles do not push layout', () => {
        const threadClasses = getAuthPreviewThreadViewportClasses()

        expect(threadClasses).toContain('h-[clamp(12rem,35vh,18rem)]')
        expect(threadClasses).toContain('overflow-y-auto')
        expect(threadClasses).toContain('[scrollbar-width:none]')
        expect(threadClasses).toContain('[&::-webkit-scrollbar]:hidden')
        expect(threadClasses).toContain('pb-4')
        expect(threadClasses).toContain(
            '[mask-image:linear-gradient(to_bottom,transparent_0%,black_12%,black_100%)]'
        )
    })

    it('adds a top gradient fade to cut older messages', () => {
        const fadeClasses = getAuthPreviewThreadTopFadeClasses()

        expect(fadeClasses).toContain('bg-gradient-to-b')
        expect(fadeClasses).toContain('from-gray-50')
        expect(fadeClasses).toContain('to-transparent')
    })

    it('keeps the thread frame width capped for stable bubble layout', () => {
        const frameClasses = getAuthPreviewThreadFrameClasses()

        expect(frameClasses).toContain('w-full')
        expect(frameClasses).toContain('max-w-xl')
    })

    it('keeps stacked messages bottom-aligned with safe spacing above composer', () => {
        const stackClasses = getAuthPreviewMessageStackClasses()

        expect(stackClasses).toContain('justify-end')
        expect(stackClasses).toContain('gap-3')
        expect(stackClasses).toContain('pb-4')
    })

    it('applies smooth enter animation to incoming bubbles', () => {
        const animationClasses = getAuthPreviewBubbleEnterClasses()

        expect(animationClasses).toContain('motion-safe:animate-[auth-preview-bubble-in_220ms_ease-out]')
        expect(animationClasses).toContain('will-change-transform')
    })
})
