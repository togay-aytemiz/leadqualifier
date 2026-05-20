import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/components/inbox/InboxContainer.tsx')

describe('InboxContainer demo chat source guards', () => {
    it('disables the composer and send affordances for demo_chat conversations', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain("selectedConversation?.platform === 'demo_chat'")
        expect(source).toContain('demoChatComposerDisabled')
        expect(source).toContain("t('demoChatReplyDisabled')")
    })
})
