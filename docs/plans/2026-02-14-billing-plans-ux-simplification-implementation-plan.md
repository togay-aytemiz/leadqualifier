# Billing & Plans UX Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify `Settings > Plans` and `Settings > Billing` so users quickly understand plan state, next action, and current usage without policy-heavy or mock/testing-focused UI copy.

**Architecture:** Keep existing billing policy/runtime logic unchanged. Only reduce UI complexity by removing non-essential sections/labels, shortening naming, and tightening translation text in EN/TR. Preserve current routes (`/settings/plans`, `/settings/billing`) and server actions.

**Tech Stack:** Next.js App Router (server components), next-intl (`messages/en.json`, `messages/tr.json`), Tailwind CSS.

---

## Brainstorming Summary

### Option A (Recommended): Minimal Decision-First UX
- Keep only: current plan status, actionable purchase cards, current-month usage, and credit history.
- Remove explanatory “policy” paragraphs and mock/payment simulation controls from the UI surface.
- Keep backend mock checkout logic but hide testing affordances from user-facing page.

**Pros:** Fast scan, fewer cognitive steps, closer to SaaS billing best practices.
**Cons:** Less in-page transparency about policy edge cases.

### Option B: Medium Simplification
- Keep current structure but shorten all text.
- Keep mock outcome select and all sections, just relabel.

**Pros:** Lowest implementation risk.
**Cons:** Most clutter remains.

### Option C: Aggressive Restructure
- Merge plans + billing into one page with tabs.
- Remove route separation.

**Pros:** Single billing center.
**Cons:** Scope/risk too large for current request.

---

## UX Benchmark Inputs (External)
- OpenAI (prepaid billing + usage limits): balance, auto-recharge, monthly budget controls.
- Vercel (base subscription + usage-based line items): predictable base + metered overages.
- Intercom (seat package + usage caps): clear monthly included quota and overage pricing.
- GitHub Copilot (plan + monthly premium request quotas): plan explains included limits and resets.
- Twilio (trial credit + usage records): transparent trial credit and usage tracking.
- Stripe Billing docs (credit grants): append-only/immutable credit ledger approach.

---

### Task 1: Simplify `Settings > Plans` surface

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/plans/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Remove non-essential UI blocks**
- Remove/mock-hide payment simulation controls:
  - simulated outcome dropdown label + select
  - mock mode notice banner
- Keep purchase buttons active using default success simulation in current server action.

**Step 2: Reduce status copy noise**
- Remove/stop rendering long policy helper paragraphs where they do not influence immediate action.
- Keep compact essentials:
  - Membership state
  - Remaining trial/package/top-up credits
  - Trial end date or package reset date

**Step 3: Simplify action labels**
- Shorten titles/buttons to direct action language (e.g., “Start premium”, “Buy top-up”).
- Keep one lightweight link to usage page.

**Step 4: Run focused verification**
Run: `npm run i18n:check`
Expected: pass (no missing EN/TR keys).

---

### Task 2: Simplify `Settings > Billing` surface

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/billing/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/billing/UsageBreakdownDetails.tsx` (if no longer needed by IA)
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Keep only high-signal sections**
- Keep:
  - account snapshot (compact)
  - credit history ledger
  - AI usage (monthly + total)
- Remove low-priority clutter for MVP decision flow:
  - verbose description banners
  - optional deep usage modal CTA
  - message/storage sub-analytics blocks (if not essential to billing decisions)

**Step 2: Shorten section names and labels**
- Rename long section titles/descriptions to plain language.
- Remove duplicate explanatory text that repeats Plans page guidance.

**Step 3: Ensure no dead imports/keys**
- Remove unused imports/components after section removal.
- Keep translations mirrored in EN/TR.

**Step 4: Run focused verification**
Run: `npm run i18n:check`
Expected: pass.

---

### Task 3: Keep settings navigation naming concise

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`
- Validate usage in: `src/components/settings/SettingsResponsiveShell.tsx`

**Step 1: Simplify sidebar labels**
- Reduce long labels like “Plans & Credits” / “Usage & Billing” to shorter user-friendly labels while preserving route intent.

**Step 2: Verify UI mapping**
Run: `npm run test -- src/components/settings/mobilePaneState.test.ts`
Expected: pass (route mapping unchanged).

---

### Task 4: Documentation updates (required by project workflow)

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: ROADMAP**
- Add/mark completed item for billing/plans UX simplification.
- Update `Last Updated` note with concrete change summary and date `2026-02-14`.

**Step 2: PRD**
- Add tech decision note documenting “decision-first billing UX simplification”.
- Update `Last Updated` with this iteration summary.

**Step 3: RELEASE**
- Add `[Unreleased]` entries:
  - `Changed`: simplified plans/billing naming and removed non-essential billing UI noise.
  - `Changed/Fixed` as applicable for copy and IA clarity.

---

### Task 5: Final verification and delivery

**Files:**
- N/A (verification commands)

**Step 1: Build verification**
Run: `npm run build`
Expected: successful Next.js production build with no type errors.

**Step 2: Working tree check**
Run: `git status --short`
Expected: only intended file changes plus any pre-existing user edits.

**Step 3: Provide commit message suggestion**
- `feat(phase-8.5): simplify plans and billing UX copy`

