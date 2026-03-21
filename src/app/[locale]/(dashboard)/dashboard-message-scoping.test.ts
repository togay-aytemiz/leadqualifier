import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DASHBOARD_LAYOUT_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/layout.tsx')
const PROVIDER_PATH = path.resolve(process.cwd(), 'src/components/i18n/DashboardRouteIntlProvider.tsx')
const SETTINGS_LAYOUT_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/settings/layout.tsx')
const KNOWLEDGE_LAYOUT_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/knowledge/layout.tsx')
const INBOX_LAYOUT_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/inbox/layout.tsx')
const LEADS_LAYOUT_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/leads/layout.tsx')
const SKILLS_LAYOUT_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/skills/layout.tsx')
const SIMULATOR_LAYOUT_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/simulator/layout.tsx')
const CALENDAR_LAYOUT_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/calendar/layout.tsx')
const ADMIN_LAYOUT_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/admin/layout.tsx')

describe('dashboard message scoping', () => {
    it('keeps the root dashboard provider on shell-only namespaces', () => {
        const source = fs.readFileSync(DASHBOARD_LAYOUT_PATH, 'utf8')

        expect(source).toContain('DASHBOARD_SHELL_MESSAGE_NAMESPACES')
        expect(source).toContain('getScopedMessages(locale, DASHBOARD_SHELL_MESSAGE_NAMESPACES)')
    })

    it('uses a reusable dashboard route intl provider', () => {
        expect(fs.existsSync(PROVIDER_PATH)).toBe(true)

        const source = fs.readFileSync(PROVIDER_PATH, 'utf8')

        expect(source).toContain('mergeMessageNamespaceLists')
        expect(source).toContain('DASHBOARD_SHELL_MESSAGE_NAMESPACES')
        expect(source).toContain('NextIntlClientProvider')
    })

    it('wraps heavyweight dashboard route groups in scoped providers', () => {
        const layouts = [
            SETTINGS_LAYOUT_PATH,
            KNOWLEDGE_LAYOUT_PATH,
            INBOX_LAYOUT_PATH,
            LEADS_LAYOUT_PATH,
            SKILLS_LAYOUT_PATH,
            SIMULATOR_LAYOUT_PATH,
            CALENDAR_LAYOUT_PATH,
            ADMIN_LAYOUT_PATH
        ]

        layouts.forEach((layoutPath) => {
            expect(fs.existsSync(layoutPath)).toBe(true)
            const source = fs.readFileSync(layoutPath, 'utf8')
            expect(source).toContain('DashboardRouteIntlProvider')
        })
    })
})
