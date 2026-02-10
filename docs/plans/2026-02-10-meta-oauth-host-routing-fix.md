# Meta OAuth Host Routing Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure WhatsApp/Instagram OAuth connect flow always returns to `app.askqualy.com` and expose actionable failure hints for `connect_failed`.

**Architecture:** Centralize origin resolution for Meta OAuth routes (`start` + `callback`) so redirect decisions use configured canonical URL first, then forwarded host, then request origin fallback. Keep webhook and OAuth concerns separate. Add a compact error-code mapping for callback failures to aid production debugging via URL query params.

**Tech Stack:** Next.js App Router route handlers, TypeScript, Vitest, Netlify runtime headers.

---

### Task 1: Canonical origin resolution utility

**Files:**
- Create: `src/lib/channels/meta-origin.ts`
- Test: `src/lib/channels/meta-origin.test.ts`

**Step 1: Write failing tests**
- Cover precedence: configured app URL > configured site URL > forwarded host/proto > request origin.
- Cover invalid URL inputs and safe fallback behavior.

**Step 2: Run tests to confirm failure**
- Run: `npm run test -- src/lib/channels/meta-origin.test.ts`

**Step 3: Implement minimal utility**
- Add parser + resolver for origin selection.

**Step 4: Re-run tests**
- Run: `npm run test -- src/lib/channels/meta-origin.test.ts`

### Task 2: Wire utility into Meta OAuth routes

**Files:**
- Modify: `src/app/api/channels/meta/start/route.ts`
- Modify: `src/app/api/channels/meta/callback/route.ts`

**Step 1: Update redirect base URL**
- Make all channel-status redirects use resolved canonical origin instead of raw request origin.

**Step 2: Keep callback redirect URI deterministic**
- Build OAuth callback URI from canonical origin and preserve popup flag.

### Task 3: Improve callback failure diagnosability

**Files:**
- Modify: `src/app/api/channels/meta/callback/route.ts`

**Step 1: Add compact error-code mapping**
- Map common Meta/permission failures into `meta_oauth_error` query param.

**Step 2: Preserve existing status contract**
- Keep `meta_oauth=connect_failed` for UI compatibility.

### Task 4: Verification + docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Build verification**
- Run: `npm run build`

**Step 2: Update roadmap/prd/release notes**
- Document canonical host routing fix and OAuth diagnostics update.
