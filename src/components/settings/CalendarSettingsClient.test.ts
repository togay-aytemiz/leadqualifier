import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const CALENDAR_SETTINGS_CLIENT_PATH = path.resolve(
    process.cwd(),
    'src/components/settings/CalendarSettingsClient.tsx'
)

describe('CalendarSettingsClient source', () => {
    it('uses inline info tooltips for timing-rule labels', () => {
        const source = fs.readFileSync(CALENDAR_SETTINGS_CLIENT_PATH, 'utf8')

        expect(source).toContain('function InfoTooltip')
        expect(source).toContain("t('settings.fieldHints.maxConcurrentBookings')")
        expect(source).toContain("t('settings.fieldHints.slotInterval')")
        expect(source).toContain("t('settings.fieldHints.minimumNotice')")
        expect(source).toContain("t('settings.fieldHints.bufferBefore')")
        expect(source).toContain("t('settings.fieldHints.bufferAfter')")
    })

    it('keeps availability rows compact with day, switch, start, and end in one grid', () => {
        const source = fs.readFileSync(CALENDAR_SETTINGS_CLIENT_PATH, 'utf8')

        expect(source).toContain('lg:grid-cols-[minmax(0,1.4fr)_minmax(0,11rem)_minmax(0,11rem)_auto]')
        expect(source).not.toContain('md:grid-cols-[auto,1fr,1fr]')
    })

    it('disables the save action until the active tab has unsaved changes', () => {
        const source = fs.readFileSync(CALENDAR_SETTINGS_CLIENT_PATH, 'utf8')

        expect(source).toContain('const isActiveTabDirty = activeTab === \'availability\'')
        expect(source).toContain('disabled={isPending || isReadOnly || !isActiveTabDirty}')
    })

    it('exposes the simple maximum concurrent bookings field in general settings', () => {
        const source = fs.readFileSync(CALENDAR_SETTINGS_CLIENT_PATH, 'utf8')

        expect(source).toContain("t('settings.maxConcurrentBookings')")
        expect(source).toContain('value={settingsDraft.maxConcurrentBookings}')
        expect(source).toContain('max_concurrent_bookings: maxConcurrentBookings')
    })

    it('opens organization details from the empty service durations state', () => {
        const source = fs.readFileSync(CALENDAR_SETTINGS_CLIENT_PATH, 'utf8')

        expect(source).toContain('href="/settings/organization?focus=organization-details"')
    })
})
