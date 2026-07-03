import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/proxy.ts')

describe('next-intl proxy source', () => {
    it('leaves API and iframe embed routes outside locale rewriting', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('api|embed')
        expect(source).toContain('/(en|tr)/:path*')
    })
})
