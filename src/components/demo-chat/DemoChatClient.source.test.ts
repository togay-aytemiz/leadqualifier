import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/components/demo-chat/DemoChatClient.tsx')

describe('DemoChatClient source guards', () => {
    it('keeps browser sessions isolated and posts only slug, session, message, and signed access to the demo API', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain("localStorage.getItem(storageKey)")
        expect(source).toContain("qualy-demo-chat-messages:${slug}")
        expect(source).toContain('localStorage.setItem(messageStorageKey')
        expect(source).toContain('crypto.randomUUID()')
        expect(source).toContain("fetch(`/api/demo/${slug}/chat`")
        expect(source).toContain('accessToken')
        expect(source).toContain('Authorization')
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

    it('polls pending demo replies instead of surfacing platform timeout failures', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('REPLY_POLL_INTERVAL_MS')
        expect(source).toContain('pollPendingReply')
        expect(source).toContain('response.status === 202')
        expect(source).toContain('messageId')
        expect(source).toContain('encodeURIComponent(sessionId)')
    })

    it('refreshes stale signed access tokens before sending demo API requests', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('readAccessTokenExpiryMs')
        expect(source).toContain('isAccessTokenStale')
        expect(source).toContain('window.location.reload()')
        expect(source).toContain("t('sessionExpired')")
    })

    it('keeps the header and composer fixed while only the message timeline scrolls', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('h-dvh overflow-hidden')
        expect(source).toContain('shrink-0 border-b')
        expect(source).toContain('flex-1 overflow-hidden')
        expect(source).toContain('overflow-y-auto')
        expect(source).toContain('shrink-0 rounded-b-xl')
    })

    it('keeps the demo disclaimer near the composer instead of repeating under each bot reply', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain("t('composerDisclaimer')")
        expect(source).not.toContain('AI disclaimer')
    })

    it('renders the demo composer as an autosizing textarea with a bottom-right send button', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('textareaRef')
        expect(source).toContain('resetComposerHeight')
        expect(source).toContain('<textarea')
        expect(source).toContain('rows={1}')
        expect(source).toContain('resize-none')
        expect(source).toContain('scrollbar-none')
        expect(source).toContain('maxHeight =')
        expect(source).toContain("event.key === 'Enter' && !event.shiftKey")
        expect(source).toContain('items-end')
        expect(source).toContain('self-end')
    })

    it('keeps the mobile composer textarea at 16px to avoid iOS focus zoom', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')
        const textareaMatch = source.match(/<textarea[\s\S]*?className={`([\s\S]*?)`}/)

        expect(textareaMatch?.[1]).toContain('text-base')
        expect(textareaMatch?.[1]).not.toContain('text-sm')
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
