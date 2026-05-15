import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Telegram RAG prompt source guard', () => {
    it('keeps chat-channel link instructions aligned with shared inbound RAG replies', () => {
        const source = readFileSync('src/app/api/webhooks/telegram/route.ts', 'utf8')

        expect(source).toContain('Treat document titles, section labels, and source URLs in the context as valid evidence.')
        expect(source).toContain('Do not use Markdown links like [label](url).')
        expect(source).toContain('put the full raw URL on its own final line')
        expect(source).toContain('Copy source URLs exactly and never insert spaces inside a URL.')
        expect(source).toContain('Do not add punctuation or words after the URL.')
    })
})
