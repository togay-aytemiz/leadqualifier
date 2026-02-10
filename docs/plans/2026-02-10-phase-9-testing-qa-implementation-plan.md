# Phase 9 Testing & QA Closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close all open `Phase 9: Testing & QA` roadmap items by shipping missing unit tests for core logic, WhatsApp integration tests, admin panel E2E tests, and repeatable load tests for message handling.

**Architecture:** Implement a pragmatic test pyramid in the existing stack: keep most coverage in Vitest unit/integration tests, add a thin Playwright E2E smoke layer for admin-critical flows, and add a scripted load baseline for webhook message handling. Keep each layer deterministic with mockable boundaries and explicit env-gated execution paths.

**Tech Stack:** Next.js 16 App Router, Vitest, Playwright, `autocannon`, Supabase server/service-role clients, npm scripts.

---

## Execution Rules
- Use `@test-driven-development` for each task (write failing test first, then minimum implementation).
- Use `@troubleshooting` for flaky async behavior and environment-driven failures.
- Use `@verification-before-completion` before claiming Phase 9 done.
- Keep i18n parity intact (no user-facing hardcoded strings introduced while adding test IDs/helpers).

### Task 1: Establish Phase 9 test runners and command surface

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `tests/e2e/.gitkeep`
- Create: `scripts/load/.gitkeep`

**Step 1: Add failing script placeholders**
- Add scripts before implementation to make missing files fail visibly:
```json
{
  "scripts": {
    "test:unit:core": "vitest run src/lib/channels/actions.test.ts src/lib/channels/inbound-ai-pipeline.test.ts",
    "test:integration:whatsapp": "vitest run src/app/api/webhooks/whatsapp/route.test.ts",
    "test:e2e:admin": "playwright test tests/e2e/admin-panel.spec.ts",
    "test:load:messages": "node scripts/load/whatsapp-webhook.autocannon.mjs"
  }
}
```

**Step 2: Run scripts and confirm expected failures**
- Run: `npm run test:unit:core`
- Run: `npm run test:integration:whatsapp`
- Run: `npm run test:e2e:admin`
- Expected: missing-file/module errors.

**Step 3: Add minimal Playwright config**
```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000' }
})
```

**Step 4: Re-run script checks**
- Re-run same commands; failures should now narrow to not-yet-written tests.

**Step 5: Commit**
```bash
git add package.json playwright.config.ts tests/e2e/.gitkeep scripts/load/.gitkeep
git commit -m "test(phase-9): scaffold qa command surface"
```

### Task 2: Add unit tests for channel core logic (`actions.ts`)

**Files:**
- Create: `src/lib/channels/actions.test.ts`
- Modify: `src/lib/channels/actions.ts` (only if testability seams are needed)

**Step 1: Write failing tests for WhatsApp channel actions**
```ts
it('returns validation error when required WhatsApp fields are missing', async () => {
  const result = await connectWhatsAppChannel('org-1', {
    phoneNumberId: '', businessAccountId: '', permanentAccessToken: '', appSecret: '', verifyToken: ''
  })
  expect(result.error).toContain('Missing required WhatsApp channel fields')
})

it('maps debug response from WhatsApp graph details', async () => {
  const result = await debugWhatsAppChannel('channel-1')
  expect(result.success).toBe(true)
})
```

**Step 2: Run targeted test file to verify fail**
- Run: `npx vitest run src/lib/channels/actions.test.ts`
- Expected: fail due to missing mocks/coverage.

**Step 3: Implement minimal mocking + seams**
- Mock `@/lib/supabase/server` and `WhatsAppClient`.
- Assert DB call shape (`upsert`, `onConflict`) and debug payload normalization.
- Keep production behavior unchanged.

**Step 4: Run tests until green**
- Run: `npx vitest run src/lib/channels/actions.test.ts`
- Expected: PASS.

**Step 5: Commit**
```bash
git add src/lib/channels/actions.test.ts src/lib/channels/actions.ts
git commit -m "test(phase-9): cover channel action core logic"
```

### Task 3: Add unit tests for shared inbound pipeline guardrails

**Files:**
- Create: `src/lib/channels/inbound-ai-pipeline.test.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.ts` (only if dependency injection seams are needed)

**Step 1: Write failing guardrail tests**
```ts
it('skips processing when inbound message id is already stored (dedupe)', async () => {
  await processInboundAiPipeline(buildInput())
  expect(sendOutboundMock).not.toHaveBeenCalled()
})

it('does not auto-reply when operator is active', async () => {
  await processInboundAiPipeline(buildInput({ activeAgent: 'operator' }))
  expect(sendOutboundMock).not.toHaveBeenCalled()
})

it('sends matched skill response and persists bot metadata', async () => {
  await processInboundAiPipeline(buildInput({ matchSkill: true }))
  expect(sendOutboundMock).toHaveBeenCalledWith('skill-response')
})
```

**Step 2: Run targeted test file and verify fail**
- Run: `npx vitest run src/lib/channels/inbound-ai-pipeline.test.ts`
- Expected: fail due to unimplemented mocks/assertions.

**Step 3: Add deterministic test harness**
- Mock: `matchSkillsSafely`, `getOrgAiSettings`, `runLeadExtraction`, `buildFallbackResponse`, `decideKnowledgeBaseRoute`.
- Stub Supabase fluent chains with per-table query queues (same style as `src/lib/inbox/actions.test.ts`).

**Step 4: Re-run and stabilize**
- Run: `npx vitest run src/lib/channels/inbound-ai-pipeline.test.ts`
- Expected: PASS with no network calls.

**Step 5: Commit**
```bash
git add src/lib/channels/inbound-ai-pipeline.test.ts src/lib/channels/inbound-ai-pipeline.ts
git commit -m "test(phase-9): add inbound pipeline guardrail unit coverage"
```

### Task 4: Add WhatsApp webhook integration tests (`route.ts`)

**Files:**
- Create: `src/app/api/webhooks/whatsapp/route.test.ts`
- Modify: `src/app/api/webhooks/whatsapp/route.ts` (only if minimal seams are needed)

**Step 1: Write failing integration tests around route handlers**
```ts
it('GET returns challenge when global verify token matches', async () => {
  const req = new NextRequest('http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=t&hub.challenge=c')
  const res = await GET(req)
  expect(res.status).toBe(200)
})

it('POST rejects invalid signature with 401', async () => {
  const req = new NextRequest('http://localhost/api/webhooks/whatsapp', { method: 'POST', body: JSON.stringify(payload) })
  const res = await POST(req)
  expect(res.status).toBe(401)
})

it('POST forwards valid text event into shared inbound pipeline', async () => {
  const res = await POST(validRequest)
  expect(processInboundAiPipelineMock).toHaveBeenCalledTimes(1)
  expect(res.status).toBe(200)
})
```

**Step 2: Run test file and confirm fail**
- Run: `npx vitest run src/app/api/webhooks/whatsapp/route.test.ts`
- Expected: failing mocks/assertions.

**Step 3: Implement deterministic integration harness**
- Mock `createClient` from `@supabase/supabase-js`.
- Mock `extractWhatsAppTextMessages` + `isValidMetaSignature` + `processInboundAiPipeline`.
- Assert channel lookup by `config->>phone_number_id` and correct pipeline payload mapping.

**Step 4: Re-run integration suite**
- Run: `npm run test:integration:whatsapp`
- Expected: PASS.

**Step 5: Commit**
```bash
git add src/app/api/webhooks/whatsapp/route.test.ts src/app/api/webhooks/whatsapp/route.ts
git commit -m "test(phase-9): add whatsapp webhook integration coverage"
```

### Task 5: Add admin E2E testability hooks and Playwright smoke specs

**Files:**
- Modify: `src/app/[locale]/(dashboard)/admin/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/admin/leads/page.tsx`
- Create: `tests/e2e/admin-panel.spec.ts`
- Create: `tests/e2e/helpers/auth.ts`

**Step 1: Write failing Playwright spec first**
```ts
test('system admin can open dashboard and leads pages in read-only mode', async ({ page }) => {
  await loginAsSystemAdmin(page)
  await page.goto('/tr/admin')
  await expect(page.getByTestId('admin-readonly-banner')).toBeVisible()
  await page.goto('/tr/admin/leads')
  await expect(page.getByTestId('admin-leads-page')).toBeVisible()
})
```

**Step 2: Run Playwright and verify fail**
- Run: `npm run test:e2e:admin`
- Expected: selector/auth/config failures.

**Step 3: Implement minimal hooks + auth helper**
- Add stable `data-testid` attributes in admin pages.
- Implement `loginAsSystemAdmin` using env-driven credentials (`E2E_SYSTEM_ADMIN_EMAIL`, `E2E_SYSTEM_ADMIN_PASSWORD`).
- Skip test with clear message if env is missing.

**Step 4: Re-run E2E spec**
- Run: `npm run test:e2e:admin`
- Expected: PASS (or explicit skip when env absent).

**Step 5: Commit**
```bash
git add src/app/[locale]/(dashboard)/admin/page.tsx src/app/[locale]/(dashboard)/admin/leads/page.tsx tests/e2e/admin-panel.spec.ts tests/e2e/helpers/auth.ts
git commit -m "test(phase-9): add admin panel e2e smoke coverage"
```

### Task 6: Add load test baseline for message handling

**Files:**
- Create: `scripts/load/whatsapp-webhook.autocannon.mjs`
- Modify: `package.json`
- Create: `docs/plans/phase-9-load-test-thresholds.md` (optional, if thresholds need separate tracking)

**Step 1: Write failing load script assertion first**
```js
if (summary['2xx'] < requests * 0.99) {
  throw new Error('2xx ratio below 99%')
}
```

**Step 2: Run load script and confirm setup failures**
- Run: `npm run test:load:messages`
- Expected: missing dependency/server/env failure before thresholds pass.

**Step 3: Implement load harness**
- Use `autocannon` with configurable env:
  - `LOAD_BASE_URL` (default `http://127.0.0.1:3000`)
  - `LOAD_CONNECTIONS` (default `20`)
  - `LOAD_DURATION_SECONDS` (default `30`)
- Target endpoint: `/api/webhooks/whatsapp` with deterministic signed payload fixture.
- Print p95 latency + req/sec + non-2xx count.

**Step 4: Re-run load script in local/staging**
- Run: `npm run test:load:messages`
- Expected: metrics printed and thresholds enforced.

**Step 5: Commit**
```bash
git add scripts/load/whatsapp-webhook.autocannon.mjs package.json docs/plans/phase-9-load-test-thresholds.md
git commit -m "test(phase-9): add message handling load baseline"
```

### Task 7: Roadmap closure + verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md` (if QA decisions changed)
- Modify: `docs/RELEASE.md`

**Step 1: Update docs after each completed sub-scope**
- Mark Phase 9 items done only when each suite is green.
- Add QA tooling decision in PRD appendix if introduced.
- Add release notes under `[Unreleased]`.

**Step 2: Run full verification matrix**
- Run: `npm run lint`
- Run: `npm run test`
- Run: `npm run test:integration:whatsapp`
- Run: `npm run test:e2e:admin`
- Run: `npm run test:load:messages`
- Run: `npm run build`

**Step 3: Final commit for docs and status**
```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs(phase-9): close testing and qa roadmap items"
```

---

## Done Criteria (Phase 9)
- `Unit tests for core logic` checkbox is checked in roadmap with green Vitest evidence.
- `Integration tests for WhatsApp flow` checkbox is checked with green route integration suite.
- `E2E tests for admin panel` checkbox is checked with Playwright smoke coverage.
- `Load testing for message handling` checkbox is checked with reproducible script + threshold output.
- `npm run build` passes at the end.
