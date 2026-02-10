import { test, expect } from '@playwright/test'
import { loginAsSystemAdmin } from './helpers/auth'

const hasCredentials = Boolean(
    process.env.E2E_SYSTEM_ADMIN_EMAIL && process.env.E2E_SYSTEM_ADMIN_PASSWORD
)

test.describe('admin panel smoke', () => {
    test.skip(!hasCredentials, 'Set E2E_SYSTEM_ADMIN_EMAIL and E2E_SYSTEM_ADMIN_PASSWORD to run admin E2E.')

    test('system admin can open dashboard and leads pages in read-only mode', async ({ page }) => {
        await loginAsSystemAdmin(page, { locale: 'tr' })

        await page.goto('/tr/admin')
        await expect(page.getByTestId('admin-dashboard-page')).toBeVisible()
        await expect(page.getByTestId('admin-readonly-banner')).toBeVisible()

        await page.goto('/tr/admin/leads')
        await expect(page.getByTestId('admin-leads-page')).toBeVisible()
        await expect(page.getByTestId('admin-readonly-banner')).toBeVisible()
    })
})
