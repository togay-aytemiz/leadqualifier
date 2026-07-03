import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/app/embed/demo/[slug]/widget.js/route.ts')

describe('demo chat widget script route source', () => {
    it('returns a JavaScript launcher that mounts an iframe pointed at the embed page', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('content-type')
        expect(source).toContain('application/javascript')
        expect(source).toContain('iframe')
        expect(source).toContain('/embed/demo/')
        expect(source).toContain('top:20px;bottom:20px')
        expect(source).toContain('qualy-widget[data-open="true"] .qualy-launcher')
        expect(source).toContain('inset:10px')
        expect(source).toContain('currentScript')
        expect(source).toContain('data-qualy-locale')
        expect(source).toContain('data-qualy-logo-url')
        expect(source).toContain('markHtml')
        expect(source).toContain('<img src="')
        expect(source).toContain('escapeHtml')
        expect(source).toContain('&lt;')
        expect(source).toContain('DOMContentLoaded')
        expect(source).not.toContain('qualy-close')
        expect(source).toContain('qualy-demo-widget-close')
        expect(source).toContain("event.origin !== scriptUrl.origin")
    })

    it('keeps the customer snippet isolated from Supabase and organization ids', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
        expect(source).not.toContain('organizationId')
    })
})
