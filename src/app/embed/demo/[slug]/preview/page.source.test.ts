import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/app/embed/demo/[slug]/preview/page.tsx')

describe('demo chat widget preview page source', () => {
    it('renders a local host page that loads the widget script for the selected slug', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('/embed/demo/${encodeURIComponent(slug)}/widget.js')
        expect(source).toContain("from 'next/script'")
        expect(source).toContain('getScopedMessages')
        expect(source).toContain('strategy="afterInteractive"')
        expect(source).toContain('data-qualy-locale')
        expect(source).toContain('data-qualy-open-label')
        expect(source).toContain('widgetPreviewTitle')
    })
})
