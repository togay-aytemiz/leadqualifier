# Phase 0: Project Setup — Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up a production-ready Next.js project with Supabase, i18n, and proper tooling.

**Architecture:** Next.js 14 App Router with TypeScript, Supabase client, next-intl for i18n, and strict linting.

**Tech Stack:** Next.js 14, TypeScript, Supabase, next-intl, ESLint, Prettier

---

## Task 1: Initialize Next.js Project

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, etc.

**Step 1: Create Next.js app with TypeScript**

```bash
cd /Users/togay/Desktop/leadqualifier
npx -y create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

> Note: We use Tailwind here for utility classes but will keep styling minimal. The `--src-dir` keeps code organized.

**Step 2: Verify project runs**

```bash
npm run dev
```

Expected: Dev server starts at http://localhost:3000

**Step 3: Commit**

```bash
git init
git add .
git commit -m "feat(phase-0): initialize Next.js 14 project"
```

---

## Task 2: Configure Strict TypeScript

**Files:**
- Modify: `tsconfig.json`

**Step 1: Update tsconfig for strict mode**

Ensure these options are set:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

**Step 2: Verify no type errors**

```bash
npm run build
```

Expected: Build succeeds with no type errors

**Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore(phase-0): enable strict TypeScript"
```

---

## Task 3: Set Up Prettier

**Files:**
- Create: `.prettierrc`
- Create: `.prettierignore`
- Modify: `package.json` (add format script)

**Step 1: Install Prettier**

```bash
npm install -D prettier eslint-config-prettier
```

**Step 2: Create .prettierrc**

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

**Step 3: Create .prettierignore**

```
node_modules
.next
dist
coverage
```

**Step 4: Add format script to package.json**

```json
{
  "scripts": {
    "format": "prettier --write \"src/**/*.{ts,tsx,js,jsx,json,css,md}\""
  }
}
```

**Step 5: Run format**

```bash
npm run format
```

**Step 6: Commit**

```bash
git add .
git commit -m "chore(phase-0): add Prettier configuration"
```

---

## Task 4: Set Up ESLint (Strict)

**Files:**
- Modify: `.eslintrc.json` or `eslint.config.js`

**Step 1: Update ESLint config**

Extend with Prettier to avoid conflicts:
```json
{
  "extends": [
    "next/core-web-vitals",
    "next/typescript",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "error"
  }
}
```

**Step 2: Verify lint passes**

```bash
npm run lint
```

Expected: No lint errors

**Step 3: Commit**

```bash
git add .
git commit -m "chore(phase-0): configure strict ESLint rules"
```

---

## Task 5: Install Supabase Client

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `.env.local.example`

**Step 1: Install Supabase packages**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

**Step 2: Create browser client**

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 3: Create server client**

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  )
}
```

**Step 4: Create .env.local.example**

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# OpenAI
OPENAI_API_KEY=your-openai-key
```

**Step 5: Add .env.local to .gitignore (should already be there)**

Verify `.gitignore` contains:
```
.env*.local
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat(phase-0): add Supabase client setup"
```

---

## Task 6: Set Up i18n with next-intl

**Files:**
- Create: `src/i18n/request.ts`
- Create: `src/i18n/routing.ts`
- Create: `messages/en.json`
- Create: `messages/tr.json`
- Modify: `next.config.ts`
- Modify: `src/app/layout.tsx` → move to `src/app/[locale]/layout.tsx`
- Modify: `src/app/page.tsx` → move to `src/app/[locale]/page.tsx`
- Create: `src/middleware.ts`

**Step 1: Install next-intl**

```bash
npm install next-intl
```

**Step 2: Create routing config**

```typescript
// src/i18n/routing.ts
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'tr'],
  defaultLocale: 'tr',
})
```

**Step 3: Create request config**

```typescript
// src/i18n/request.ts
import { getRequestConfig } from 'next-intl/server'
import { routing } from './routing'

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale
  if (!locale || !routing.locales.includes(locale as 'en' | 'tr')) {
    locale = routing.defaultLocale
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
```

**Step 4: Create message files**

```json
// messages/en.json
{
  "common": {
    "welcome": "Welcome to Lead Qualifier",
    "loading": "Loading..."
  }
}
```

```json
// messages/tr.json
{
  "common": {
    "welcome": "Lead Qualifier'a Hoş Geldiniz",
    "loading": "Yükleniyor..."
  }
}
```

**Step 5: Create middleware**

```typescript
// src/middleware.ts
import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  matcher: ['/', '/(tr|en)/:path*'],
}
```

**Step 6: Update next.config.ts**

```typescript
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig = {}

export default withNextIntl(nextConfig)
```

**Step 7: Move layout and page to [locale] directory**

Move `src/app/layout.tsx` to `src/app/[locale]/layout.tsx` and update to use next-intl.

**Step 8: Verify i18n works**

```bash
npm run dev
```

Visit http://localhost:3000/tr and http://localhost:3000/en

Expected: Different welcome messages based on locale

**Step 9: Commit**

```bash
git add .
git commit -m "feat(phase-0): add i18n with next-intl (TR/EN)"
```

---

## Task 7: Create Base Layout & Theme

**Files:**
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `src/app/globals.css`

**Step 1: Set up dark mode ready layout**

Clean, minimal global styles. Remove default Next.js demo content.

**Step 2: Verify clean slate**

```bash
npm run dev
```

Expected: Clean page with just welcome message

**Step 3: Commit**

```bash
git add .
git commit -m "chore(phase-0): clean up base layout"
```

---

## Task 8: Create Environment Setup Script

**Files:**
- Modify: `README.md`

**Step 1: Document setup instructions**

Add getting started section with:
- Prerequisites (Node 18+, npm, Supabase account)
- Clone & install
- Copy `.env.local.example` to `.env.local`
- Fill in Supabase credentials
- Run dev server

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs(phase-0): add setup instructions to README"
```

---

## Verification Plan

### Automated Tests
No unit tests for Phase 0 — this is pure setup. We'll add tests starting Phase 1.

### Manual Verification

| Check | Command/Action | Expected Result |
|-------|----------------|-----------------|
| Dev server runs | `npm run dev` | Server starts at localhost:3000 |
| TypeScript strict | `npm run build` | No type errors |
| ESLint passes | `npm run lint` | No lint errors |
| Prettier works | `npm run format` | Files formatted |
| i18n Turkish | Visit `/tr` | Turkish welcome message |
| i18n English | Visit `/en` | English welcome message |

---

## Success Criteria

Phase 0 is complete when:
- [x] Next.js project runs locally
- [x] TypeScript strict mode enabled
- [x] ESLint + Prettier configured
- [x] Supabase client files created
- [x] i18n works with TR/EN
- [x] README has setup instructions
- [x] All commits follow convention
