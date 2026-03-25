import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const dashboardRoot = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)')

describe('dashboard route metadata source', () => {
  it('defines translated metadata titles for primary dashboard workspaces', () => {
    const layouts = [
      { file: 'inbox/layout.tsx', titleCall: "tNav('inbox')" },
      { file: 'calendar/layout.tsx', titleCall: "tNav('calendar')" },
      { file: 'leads/layout.tsx', titleCall: "tNav('leads')" },
      { file: 'skills/layout.tsx', titleCall: "tNav('skills')" },
      { file: 'knowledge/layout.tsx', titleCall: "tNav('knowledgeBase')" },
      { file: 'simulator/layout.tsx', titleCall: "tNav('simulator')" },
      { file: 'settings/layout.tsx', titleCall: "tNav('settings')" },
      { file: 'admin/layout.tsx', titleCall: "tSidebar('adminDashboard')" },
    ] as const

    for (const layout of layouts) {
      const source = fs.readFileSync(path.join(dashboardRoot, layout.file), 'utf8')

      expect(source).toContain('export async function generateMetadata')
      expect(source).toContain(layout.titleCall)
    }
  })
})
