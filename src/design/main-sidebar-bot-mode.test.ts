import { describe, expect, it } from 'vitest'
import {
    normalizeMainSidebarBotMode,
    resolveMainSidebarInitialBotModeState,
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

describe('normalizeMainSidebarBotMode', () => {
    it('keeps supported bot modes', () => {
        expect(normalizeMainSidebarBotMode('active')).toBe('active')
        expect(normalizeMainSidebarBotMode('shadow')).toBe('shadow')
        expect(normalizeMainSidebarBotMode('off')).toBe('off')
    })

    it('falls back to active for unsupported values', () => {
        expect(normalizeMainSidebarBotMode(undefined)).toBe('active')
        expect(normalizeMainSidebarBotMode(null)).toBe('active')
        expect(normalizeMainSidebarBotMode('invalid')).toBe('active')
    })
})

describe('resolveMainSidebarInitialBotModeState', () => {
    it('starts in loading state when org exists and initial bot mode is unknown', () => {
        expect(resolveMainSidebarInitialBotModeState({
            organizationId: 'org-1',
            initialBotMode: null
        })).toEqual({
            botMode: 'active',
            isLoading: true
        })
    })

    it('starts with provided mode when initial bot mode is known', () => {
        expect(resolveMainSidebarInitialBotModeState({
            organizationId: 'org-1',
            initialBotMode: 'shadow'
        })).toEqual({
            botMode: 'shadow',
            isLoading: false
        })
    })

    it('does not keep loading state when no org is selected', () => {
        expect(resolveMainSidebarInitialBotModeState({
            organizationId: null,
            initialBotMode: null
        })).toEqual({
            botMode: 'active',
            isLoading: false
        })
    })
})
