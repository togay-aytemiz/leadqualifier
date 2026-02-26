import { describe, expect, it } from 'vitest'
import {
    resolveMainSidebarBotMode,
    resolveMainSidebarBotModeTone
} from '@/design/main-sidebar-bot-mode'

describe('resolveMainSidebarBotMode', () => {
    it('keeps current bot mode when workspace is not locked', () => {
        expect(resolveMainSidebarBotMode({
            botMode: 'shadow',
            isWorkspaceLocked: false
        })).toBe('shadow')
    })

    it('forces bot mode to off when workspace is locked', () => {
        expect(resolveMainSidebarBotMode({
            botMode: 'shadow',
            isWorkspaceLocked: true
        })).toBe('off')
    })
})

describe('resolveMainSidebarBotModeTone', () => {
    it('returns emerald tone for active mode', () => {
        expect(resolveMainSidebarBotModeTone('active')).toBe('emerald')
    })

    it('returns amber tone for shadow mode', () => {
        expect(resolveMainSidebarBotModeTone('shadow')).toBe('amber')
    })

    it('returns rose tone for off mode', () => {
        expect(resolveMainSidebarBotModeTone('off')).toBe('rose')
    })
})
