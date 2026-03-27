import type { Page } from '@playwright/test'

interface LoginOptions {
  locale?: string
}

async function loginWithCredentials(
  page: Page,
  {
    locale = 'tr',
    email,
    password,
    missingCredentialsMessage,
  }: {
    locale?: string
    email?: string
    password?: string
    missingCredentialsMessage: string
  }
) {
  if (!email || !password) {
    throw new Error(missingCredentialsMessage)
  }

  await page.goto(`/${locale}/login`)
  await page.fill('input[name="email"]', email)
  await page.fill('input[name="password"]', password)

  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 20_000 }),
    page.locator('form button[type="submit"]').click(),
  ])
}

export async function loginAsSystemAdmin(page: Page, options: LoginOptions = {}) {
  const locale = options.locale ?? 'tr'
  const email = process.env.E2E_SYSTEM_ADMIN_EMAIL
  const password = process.env.E2E_SYSTEM_ADMIN_PASSWORD

  await loginWithCredentials(page, {
    locale,
    email,
    password,
    missingCredentialsMessage: 'Missing E2E_SYSTEM_ADMIN_EMAIL or E2E_SYSTEM_ADMIN_PASSWORD',
  })
}

export async function loginAsWorkspaceUser(page: Page, options: LoginOptions = {}) {
  const locale = options.locale ?? 'tr'
  const email = process.env.E2E_WORKSPACE_EMAIL
  const password = process.env.E2E_WORKSPACE_PASSWORD

  await loginWithCredentials(page, {
    locale,
    email,
    password,
    missingCredentialsMessage: 'Missing E2E_WORKSPACE_EMAIL or E2E_WORKSPACE_PASSWORD',
  })
}
