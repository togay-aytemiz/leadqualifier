import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/app/embed/layout.tsx')

describe('embed root layout source', () => {
    it('provides html and body tags for non-localized embed routes', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('<html lang="tr">')
        expect(source).toContain('<body')
        expect(source).toContain("../globals.css")
    })
})
