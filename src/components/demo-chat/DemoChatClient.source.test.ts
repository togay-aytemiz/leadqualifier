import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/components/demo-chat/DemoChatClient.tsx')

describe('DemoChatClient source guards', () => {
    it('keeps browser sessions isolated and posts only slug, session, and message to the demo API', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain("localStorage.getItem(storageKey)")
        expect(source).toContain("qualy-demo-chat-messages:${slug}")
        expect(source).toContain('localStorage.setItem(messageStorageKey')
        expect(source).toContain('crypto.randomUUID()')
        expect(source).toContain("fetch(`/api/demo/${slug}/chat`")
        expect(source).toContain('sessionId')
        expect(source).not.toContain('organizationId')
    })

    it('lets demo testers start over with a new browser-local session', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('handleResetConversation')
        expect(source).toContain("localStorage.removeItem(messageStorageKey)")
        expect(source).toContain("t('resetShort')")
        expect(source).toContain("t('resetConversation')")
    })

    it('keeps demo context as an informational panel instead of an assistant message', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain("t('demoNoticeTitle')")
        expect(source).toContain("t('demoNoticeBody', { name: displayName })")
        expect(source).toContain('MessageRichText')
        expect(source).toContain('useState<DemoChatMessage[]>(() => [])')
        expect(source).not.toContain("id: 'intro'")
    })

    it('rotates friendly loading copy while the demo bot is answering', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain("t.raw('thinkingMessages')")
        expect(source).toContain('setInterval')
        expect(source).toContain('THINKING_ROTATION_MS')
        expect(source).toContain('demo-chat-thinking-dot')
        expect(source).toContain('thinkingIndex')
    })

    it('keeps the demo disclaimer near the composer instead of repeating under each bot reply', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain("t('composerDisclaimer')")
        expect(source).toContain('type="text"')
        expect(source).not.toContain('textarea')
    })

    it('keeps the demo surface brandable with a theme toggle', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain("type DemoTheme = 'light' | 'dark'")
        expect(source).toContain('toggleTheme')
        expect(source).toContain("t('themeToggleLight')")
        expect(source).toContain("t('themeToggleDark')")
    })

    it('renders assistant replies as plain answer text with a reveal animation instead of chat bubbles', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('messageContainerClassName')
        expect(source).toContain('messageBodyClassName')
        expect(source).toContain('demo-chat-assistant-reveal')
        expect(source).toContain('assistant text remains unframed')
    })
})
