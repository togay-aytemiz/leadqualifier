import { describe, expect, it } from 'vitest'
import { resolveMainSidebarBotMode } from '@/design/main-sidebar-bot-mode'

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
