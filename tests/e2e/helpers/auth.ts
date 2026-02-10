import type { Page } from '@playwright/test'

interface LoginAsSystemAdminOptions {
    locale?: string
}

export async function loginAsSystemAdmin(page: Page, options: LoginAsSystemAdminOptions = {}) {
    const locale = options.locale ?? 'tr'
    const email = process.env.E2E_SYSTEM_ADMIN_EMAIL
    const password = process.env.E2E_SYSTEM_ADMIN_PASSWORD

    if (!email || !password) {
        throw new Error('Missing E2E_SYSTEM_ADMIN_EMAIL or E2E_SYSTEM_ADMIN_PASSWORD')
    }

    await page.goto(`/${locale}/login`)
    await page.fill('input[name="email"]', email)
    await page.fill('input[name="password"]', password)

    await Promise.all([
        page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20_000 }),
        page.locator('form button[type="submit"]').click()
    ])
}
