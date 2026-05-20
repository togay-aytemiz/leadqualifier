import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/components/demo-chat/DemoChatClient.tsx')

describe('DemoChatClient source guards', () => {
    it('keeps browser sessions isolated and posts only slug, session, and message to the demo API', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain("localStorage.getItem(storageKey)")
        expect(source).toContain('crypto.randomUUID()')
        expect(source).toContain("fetch(`/api/demo/${slug}/chat`")
        expect(source).toContain('sessionId')
        expect(source).not.toContain('organizationId')
    })
})
