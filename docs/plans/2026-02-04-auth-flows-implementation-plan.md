# Auth Flows Redesign + Password Recovery Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign Sign In/Sign Up/Forgot/Reset screens to match dashboard styling and add a full password recovery flow (including Profile “Change Password”).

**Architecture:** A shared server action triggers Supabase reset emails with locale-aware redirects. Auth pages are redesigned with a unified light UI. Reset page uses Supabase recovery session to update the password. Profile settings uses the same server action with a 120s cooldown.

**Tech Stack:** Next.js App Router, next-intl, Supabase Auth (supabase-js v2), Tailwind CSS.

---

### Task 1: Add minimal test harness (Vitest + RTL)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Test: `src/__tests__/smoke.test.tsx`

**Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest'

describe('smoke', () => {
    it('runs', () => {
        expect(true).toBe(false)
    })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL (script missing)

**Step 3: Write minimal implementation**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
    },
})
```

```ts
// src/test/setup.ts
import '@testing-library/jest-dom'
```

```json
// package.json (snippet)
"scripts": {
  "test": "vitest run"
},
"devDependencies": {
  "vitest": "^3.x",
  "@testing-library/react": "^16.x",
  "@testing-library/jest-dom": "^6.x",
  "jsdom": "^26.x"
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json vitest.config.ts src/test/setup.ts src/__tests__/smoke.test.tsx
git commit -m "test: add vitest harness"
```

### Task 2: Add reset URL helper

**Files:**
- Create: `src/lib/auth/reset.ts`
- Test: `src/__tests__/auth/reset-url.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildPasswordResetRedirectUrl } from '@/lib/auth/reset'

describe('buildPasswordResetRedirectUrl', () => {
    it('builds locale-aware URL', () => {
        expect(buildPasswordResetRedirectUrl('https://app.test', 'en')).toBe(
            'https://app.test/en/reset-password'
        )
        expect(buildPasswordResetRedirectUrl('https://app.test', 'tr')).toBe(
            'https://app.test/reset-password'
        )
    })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- reset-url`
Expected: FAIL with "module not found"

**Step 3: Write minimal implementation**

```ts
import { routing } from '@/i18n/routing'

export function buildPasswordResetRedirectUrl(baseUrl: string, locale: string) {
    const normalized = baseUrl.replace(/\/$/, '')
    const prefix = locale === routing.defaultLocale ? '' : `/${locale}`
    return `${normalized}${prefix}/reset-password`
}
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- reset-url`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/auth/reset.ts src/__tests__/auth/reset-url.test.ts
git commit -m "test: cover password reset redirect url"
```

### Task 3: Add password reset server action

**Files:**
- Modify: `src/lib/auth/actions.ts`
- Modify: `.env.local.example`
- Test: `src/__tests__/auth/request-password-reset.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { getBaseUrl } from '@/lib/auth/actions'

describe('getBaseUrl', () => {
    it('prefers env url', () => {
        process.env.NEXT_PUBLIC_SITE_URL = 'https://app.test'
        expect(getBaseUrl()).toBe('https://app.test')
    })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- request-password-reset`
Expected: FAIL

**Step 3: Write minimal implementation**

```ts
export function getBaseUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

export async function requestPasswordReset(email: string, locale: string) {
    const supabase = await createClient()
    const redirectTo = buildPasswordResetRedirectUrl(getBaseUrl(), locale)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) return { error: error.message }
    return { success: true }
}
```

```env
# .env.local.example
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- request-password-reset`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/auth/actions.ts .env.local.example src/__tests__/auth/request-password-reset.test.ts
git commit -m "feat(phase-5): add password reset server action"
```

### Task 4: Redesign auth layout + Sign In/Sign Up

**Files:**
- Modify: `src/app/[locale]/(auth)/layout.tsx`
- Modify: `src/components/auth/LoginForm.tsx`
- Modify: `src/components/auth/RegisterForm.tsx`
- Test: `src/__tests__/auth/login-form.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { LoginForm } from '@/components/auth/LoginForm'

it('shows forgot password link', () => {
    render(<LoginForm />)
    expect(screen.getByText(/forgot password/i)).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- login-form`
Expected: FAIL (link missing)

**Step 3: Write minimal implementation**

- Update auth layout to light background.
- Update login/register styles to match settings UI.
- Add “Forgot password” link to login.

**Step 4: Run test to verify it passes**

Run: `npm run test -- login-form`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/[locale]/(auth)/layout.tsx src/components/auth/LoginForm.tsx src/components/auth/RegisterForm.tsx src/__tests__/auth/login-form.test.tsx
git commit -m "feat(phase-5): align auth ui with settings"
```

### Task 5: Add Forgot Password page + cooldown

**Files:**
- Create: `src/components/auth/ForgotPasswordForm.tsx`
- Create: `src/app/[locale]/(auth)/forgot-password/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Test: `src/__tests__/auth/forgot-password-form.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm'

it('renders email input', () => {
    render(<ForgotPasswordForm />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- forgot-password-form`
Expected: FAIL

**Step 3: Write minimal implementation**

- Form calls `requestPasswordReset(email, locale)`.
- On success, show success banner.
- Disable resend button for 120 seconds with countdown.

**Step 4: Run test to verify it passes**

Run: `npm run test -- forgot-password-form`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/auth/ForgotPasswordForm.tsx src/app/[locale]/(auth)/forgot-password/page.tsx messages/en.json messages/tr.json src/__tests__/auth/forgot-password-form.test.tsx
git commit -m "feat(phase-5): add forgot password screen"
```

### Task 6: Add Reset Password page

**Files:**
- Create: `src/components/auth/ResetPasswordForm.tsx`
- Create: `src/app/[locale]/(auth)/reset-password/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Test: `src/__tests__/auth/reset-password-form.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import ResetPasswordForm from '@/components/auth/ResetPasswordForm'

it('renders new password fields', () => {
    render(<ResetPasswordForm />)
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- reset-password-form`
Expected: FAIL

**Step 3: Write minimal implementation**

- If no recovery session: show expired state + CTA to resend.
- If session exists: show form to update password and confirm.
- On success: show CTA to sign in.

**Step 4: Run test to verify it passes**

Run: `npm run test -- reset-password-form`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/auth/ResetPasswordForm.tsx src/app/[locale]/(auth)/reset-password/page.tsx messages/en.json messages/tr.json src/__tests__/auth/reset-password-form.test.tsx
git commit -m "feat(phase-5): add reset password screen"
```

### Task 7: Update Profile settings password section

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/profile/ProfileSettingsClient.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Test: `src/__tests__/settings/profile-password.test.tsx`

**Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import ProfileSettingsClient from '@/app/[locale]/(dashboard)/settings/profile/ProfileSettingsClient'

it('shows change password button', () => {
    render(<ProfileSettingsClient initialName="Test" email="a@b.com" />)
    expect(screen.getByText(/change password/i)).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- profile-password`
Expected: FAIL

**Step 3: Write minimal implementation**

- Add read-only email note under the email input.
- Add “Password” section with description and “Change Password” button.
- Use `requestPasswordReset` with 120s cooldown.

**Step 4: Run test to verify it passes**

Run: `npm run test -- profile-password`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/profile/ProfileSettingsClient.tsx messages/en.json messages/tr.json src/__tests__/settings/profile-password.test.tsx
git commit -m "feat(phase-5): add profile password reset action"
```

### Task 8: Docs updates

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update roadmap**

- Add auth redesign and recovery flow items.
- Update “Last Updated”.

**Step 2: Update PRD**

- Profile & Security: add password reset flow details.
- Tech Decisions: add reset flow redirect strategy.

**Step 3: Update release notes**

- Note auth flow redesign plan in `[Unreleased]` → `Changed`.

**Step 4: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: document auth flow redesign"
```

### Task 9: Build verification

**Step 1: Run build**

Run: `npm run build`
Expected: PASS

**Step 2: Commit build status (if needed)**

```bash
# No commit needed if build is clean
```
