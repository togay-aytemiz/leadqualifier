# Pilot Inbound Reliability Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the inbound AI path pilot-safe by moving lead extraction and hot-lead escalation side effects off the synchronous reply path, so inbound replies stay fast even when extraction is slow or fails. If time and risk allow after Track 1 is green, start a second hardening pass on durable operator sends.

**Architecture:** Keep inbound message persistence and reply generation on the critical path. Schedule lead extraction plus lead-score-based escalation as post-response work, preserve immediate skill-required human handover, and isolate deferred-task failures so they cannot block bot replies. Use the existing latency primitives without widening scope into a new analytics schema in this pass.

**Tech Stack:** Next.js App Router route handlers, React 19, TypeScript, Supabase server client, Vitest.

---

### Task 1: Write failing tests for deferred extraction behavior

**Files:**
- Modify: `src/lib/channels/inbound-ai-pipeline.test.ts`

**Steps:**
1. Add a failing test that proves a skill reply is sent before deferred lead extraction work runs.
2. Add a failing test that proves a deferred lead extraction failure is isolated and does not cancel the already-selected reply path.
3. Add a failing test that proves hot-lead escalation can still be applied from deferred extraction after the reply path completes.
4. Update any existing extraction-related tests so they explicitly flush deferred callbacks before asserting extraction side effects.
5. Run `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts` and verify the new cases fail for the intended missing behavior.

### Task 2: Implement post-response extraction and escalation side work

**Files:**
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`

**Steps:**
1. Add a small scheduler helper that uses Next.js post-response execution for background work and logs failures with context.
2. Move `runLeadExtraction()` plus lead-score lookup out of the synchronous reply path into a deferred helper.
3. Keep immediate skill handover escalation on the synchronous path, but move lead-score-driven escalation into the deferred helper so it runs after extraction completes.
4. Preserve billing gates, operator-mode gates, and bot-mode rules while preventing deferred extraction failures from bubbling into the main pipeline.
5. Re-run `npm test -- --run src/lib/channels/inbound-ai-pipeline.test.ts` until green.

### Task 3: Verify no regression in adjacent AI guardrails

**Files:**
- Verify only: `src/lib/ai/followup.test.ts`
- Verify only: `src/lib/ai/response-guards.test.ts`

**Steps:**
1. Run `npm test -- --run src/lib/ai/followup.test.ts src/lib/ai/response-guards.test.ts`.
2. Confirm the deferred extraction change does not alter intake suppression or re-ask guard behavior.

### Task 4: Optional second pass after Track 1 is green

**Files:**
- Modify: `src/lib/inbox/actions.test.ts`
- Modify: `src/lib/inbox/actions.ts`

**Steps:**
1. Re-scan the plain operator send path and template send path to confirm the smallest safe durability improvement.
2. If a low-risk change exists without schema/UI churn, write the failing test first and implement it.
3. If not, stop and leave this as the next planned hardening pass instead of forcing a partial durability design.

### Task 5: Update docs and verify the full repo state

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Steps:**
1. Update docs to record the inbound reliability hardening decision and any pilot-launch checklist progress.
2. Run `npm run build`.
3. Report exact verification outcomes and any remaining risk around operator-send durability.
