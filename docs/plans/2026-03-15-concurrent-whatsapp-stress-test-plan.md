# Concurrent WhatsApp Stress Test Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a realistic concurrent-user WhatsApp stress-test scenario that measures latency and error rate for 8-10 simultaneous customer conversations.

**Architecture:** Keep the existing `autocannon` baseline as the raw webhook throughput check, and add a second scenario runner that simulates distinct contacts sending multi-turn WhatsApp webhook payloads against either a lightweight local harness or a real app URL. Centralize payload/metric helpers in a small reusable module so the scenario output is testable and thresholds stay deterministic.

**Tech Stack:** Node.js ESM scripts, built-in `fetch`, `crypto`, `http`, Vitest, existing npm script surface.

---

### Task 1: Define the scenario helper contract

**Files:**
- Create: `scripts/load/whatsapp-webhook.scenario-helpers.mjs`
- Test: `scripts/load/whatsapp-webhook.scenario-helpers.test.mjs`

**Step 1: Write the failing test**

Cover:
- WhatsApp text payload creation with explicit phone/contact/message inputs
- Latency percentile + success/error summary calculation
- Threshold evaluation for success ratio and p95 latency

**Step 2: Run test to verify it fails**

Run: `npm test -- --run scripts/load/whatsapp-webhook.scenario-helpers.test.mjs`

Expected: FAIL because helper module does not exist yet.

**Step 3: Write minimal implementation**

Implement helper exports for:
- payload construction
- percentile/summary calculation
- threshold evaluation

**Step 4: Run test to verify it passes**

Run: `npm test -- --run scripts/load/whatsapp-webhook.scenario-helpers.test.mjs`

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/load/whatsapp-webhook.scenario-helpers.mjs scripts/load/whatsapp-webhook.scenario-helpers.test.mjs docs/plans/2026-03-15-concurrent-whatsapp-stress-test-plan.md
git commit -m "test(phase-9): define whatsapp stress scenario helpers"
```

### Task 2: Add the concurrent-user scenario runner

**Files:**
- Create: `scripts/load/whatsapp-webhook.scenario.mjs`
- Modify: `package.json`

**Step 1: Write the failing test**

Reuse helper-level test coverage from Task 1 as the executable behavior contract; no new integration test is required for the runner wiring.

**Step 2: Run test to verify it still passes**

Run: `npm test -- --run scripts/load/whatsapp-webhook.scenario-helpers.test.mjs`

Expected: PASS.

**Step 3: Write minimal implementation**

Implement a scenario runner that:
- starts a local harness when `LOAD_BASE_URL` is absent
- simulates configurable concurrent users with unique contact IDs + message IDs
- sends multi-turn text payloads with optional signature generation
- records latency, non-2xx, timeout, and transport errors
- prints p50/p95/p99/max latency and request-per-second summary
- exits non-zero when thresholds fail

Add npm script:
- `test:load:users`

**Step 4: Run direct verification**

Run: `node scripts/load/whatsapp-webhook.scenario.mjs`

Expected: PASS in harness mode with summary output.

**Step 5: Commit**

```bash
git add scripts/load/whatsapp-webhook.scenario.mjs package.json
git commit -m "feat(phase-9): add concurrent whatsapp stress test runner"
```

### Task 3: Update project docs and verify the full task

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`
- Modify: `docs/plans/phase-9-load-test-thresholds.md`

**Step 1: Document the new test surface**

Update:
- roadmap Phase 9 checklist
- PRD QA strategy / tech decision notes
- release notes
- load-test thresholds doc with real run commands and required env vars

**Step 2: Run verification commands**

Run:
- `npm test -- --run scripts/load/whatsapp-webhook.scenario-helpers.test.mjs`
- `npm run test:load:users`
- `npm run build`

Expected: all exit successfully.

**Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md docs/plans/phase-9-load-test-thresholds.md
git commit -m "docs: document concurrent whatsapp stress testing"
```
