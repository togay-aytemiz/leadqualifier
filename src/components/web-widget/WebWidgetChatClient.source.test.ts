import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/components/web-widget/WebWidgetChatClient.tsx')

describe('WebWidgetChatClient source guards', () => {
    it('uses in-memory simulator-style chat state and posts to the web widget API', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('organizationId')
        expect(source).toContain('fetch(`/api/web-widget/${organizationId}/chat`')
        expect(source).toContain('conversationHistory')
        expect(source).toContain('setMessages([])')
        expect(source).toContain('themeColor')
        expect(source).toContain('showLogo')
        expect(source).toContain('showHeaderSubtitle')
        expect(source).toContain('showFooter')
        expect(source).toContain('footerText')
        expect(source).toContain('--web-widget-accent')
        expect(source).toContain("type: 'qualy-web-widget-close'")
        expect(source).not.toContain('localStorage')
        expect(source).not.toContain('/api/demo/')
        expect(source).not.toContain('accessToken')
    })
})
