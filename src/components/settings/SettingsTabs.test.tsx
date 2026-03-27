import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SETTINGS_TABS_PATH = path.resolve(process.cwd(), 'src/components/settings/SettingsTabs.tsx')

describe('SettingsTabs source', () => {
  it('derives controlled tab state during render instead of mirroring props in an effect', () => {
    const source = fs.readFileSync(SETTINGS_TABS_PATH, 'utf8')

    expect(source).toContain('const controlledActiveTabId =')
    expect(source).toContain(
      'activeTabId && tabs.some((tab) => tab.id === activeTabId) ? activeTabId : undefined'
    )
    expect(source).toContain(
      'const fallbackTabId = resolveInitialTabId(tabs, controlledActiveTabId, defaultTabId)'
    )
    expect(source).not.toContain('setInternalActiveTabId(activeTabId)')
  })
})
