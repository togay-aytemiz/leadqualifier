import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ADMIN_PAGE_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/admin/page.tsx'
)

describe('admin dashboard source guards', () => {
    it('shows a hoverable token breakdown info icon on the total token card', () => {
        const source = fs.readFileSync(ADMIN_PAGE_PATH, 'utf8')

        expect(source).toContain('Info')
        expect(source).toContain('tokenBreakdownTooltip')
        expect(source).toContain('inputTokenCount')
        expect(source).toContain('outputTokenCount')
        expect(source).toContain('embeddingTokenCount')
        expect(source).toContain('group-hover:block')
    })
})
