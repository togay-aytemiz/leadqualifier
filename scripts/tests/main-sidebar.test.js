import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('main sidebar integration', () => {
    it('keeps the shared sidebar wired into dashboard layout', () => {
        const globalsPath = path.join(root, 'src', 'app', 'globals.css')
        const globals = fs.readFileSync(globalsPath, 'utf8')
        expect(globals.includes('Plus Jakarta Sans')).toBe(true)

        const sidebarPath = path.join(root, 'src', 'design', 'MainSidebar.tsx')
        expect(fs.existsSync(sidebarPath)).toBe(true)
        const sidebarContent = fs.readFileSync(sidebarPath, 'utf8')
        expect(sidebarContent.includes('export function MainSidebar')).toBe(true)

        const designIndex = fs.readFileSync(path.join(root, 'src', 'design', 'index.ts'), 'utf8')
        expect(designIndex.includes('MainSidebar')).toBe(true)

        const dashboardLayout = fs.readFileSync(
            path.join(root, 'src', 'app', '[locale]', '(dashboard)', 'layout.tsx'),
            'utf8'
        )
        expect(dashboardLayout.includes('MainSidebar')).toBe(true)
    })
})
