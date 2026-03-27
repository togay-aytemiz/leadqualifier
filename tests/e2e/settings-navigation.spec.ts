import { expect, test, type Page, type Route } from '@playwright/test'
import { loginAsWorkspaceUser } from './helpers/auth'

const hasWorkspaceCredentials = Boolean(
  process.env.E2E_WORKSPACE_EMAIL && process.env.E2E_WORKSPACE_PASSWORD
)

const locale = 'tr'
const settingsShellHeading = 'Ayarlar'
const organizationLabel = 'Organizasyon'
const plansLabel = 'Planlar'
const plansPageTitle = 'Planlar ve Krediler'

function createDelayedRoute(page: Page, pattern: string, delayMs: number) {
  let hitCount = 0
  let resolveFirstHit: ((url: string) => void) | null = null
  const firstHit = new Promise<string>((resolve) => {
    resolveFirstHit = resolve
  })

  const handler = async (route: Route) => {
    hitCount += 1

    if (hitCount === 1) {
      resolveFirstHit?.(route.request().url())
      resolveFirstHit = null
      await page.waitForTimeout(delayMs)
    }

    await route.continue()
  }

  return {
    firstHit,
    hitCount: () => hitCount,
    attach: () => page.route(pattern, handler),
    detach: () => page.unroute(pattern, handler),
  }
}

async function waitForFirstHit(firstHit: Promise<string>, timeoutMs: number) {
  try {
    await Promise.race([
      firstHit,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      }),
    ])
    return true
  } catch {
    return false
  }
}

test.describe('settings navigation performance', () => {
  test.skip(
    !hasWorkspaceCredentials,
    'Set E2E_WORKSPACE_EMAIL and E2E_WORKSPACE_PASSWORD to run settings E2E.'
  )

  test('keeps the shell visible on cold settings nav and reuses warmed detail content on revisit', async ({
    page,
  }) => {
    test.slow()

    const delayedPlansRoute = createDelayedRoute(page, '**/tr/settings/plans**', 3_000)
    await delayedPlansRoute.attach()

    const delayedOrganizationRoute = createDelayedRoute(
      page,
      '**/tr/settings/organization**',
      3_000
    )

    try {
      await loginAsWorkspaceUser(page, { locale })
      await page.goto('/tr/settings/organization')

      const shellHeading = page.getByRole('heading', { name: settingsShellHeading })
      const organizationNavLink = page.getByRole('link', { name: organizationLabel }).first()
      const plansNavLink = page.getByRole('link', { name: plansLabel }).first()
      const organizationPageHeading = page.getByRole('heading', { name: organizationLabel }).last()
      const plansPageHeading = page.getByRole('heading', { name: plansPageTitle })

      await expect(shellHeading).toBeVisible()
      await expect(organizationNavLink).toBeVisible()
      await expect(organizationPageHeading).toBeVisible()

      await delayedOrganizationRoute.attach()

      const plansPrefetchStarted = await waitForFirstHit(delayedPlansRoute.firstHit, 900)
      await plansNavLink.click()

      if (!plansPrefetchStarted) {
        await delayedPlansRoute.firstHit
      }

      await expect(shellHeading).toBeVisible()
      await expect(organizationNavLink).toBeVisible()
      expect(delayedPlansRoute.hitCount()).toBeGreaterThan(0)
      await expect(plansPageHeading).toBeVisible()
      await expect(page).toHaveURL(/\/tr\/settings\/plans(?:\?.*)?$/)

      const organizationPrefetchStarted = await waitForFirstHit(
        delayedOrganizationRoute.firstHit,
        900
      )
      await organizationNavLink.click()

      if (!organizationPrefetchStarted) {
        await delayedOrganizationRoute.firstHit
      }

      const warmedDetailPane = page.locator('[aria-busy="true"]')

      await expect(shellHeading).toBeVisible()
      await expect(organizationPageHeading).toBeVisible({ timeout: 250 })
      await expect(warmedDetailPane).toBeVisible()
      expect(delayedOrganizationRoute.hitCount()).toBeGreaterThan(0)
      await expect(page).toHaveURL(/\/tr\/settings\/organization(?:\?.*)?$/)
      await expect(warmedDetailPane).toHaveCount(0, { timeout: 6_000 })
    } finally {
      await delayedPlansRoute.detach()
      await delayedOrganizationRoute.detach()
    }
  })
})
