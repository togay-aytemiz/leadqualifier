# Semantic Required Intake Resolution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make required-field filling sector-agnostic by resolving custom field labels semantically instead of relying on exact label matches only.

**Architecture:** Strengthen lead extraction so `required_intake_collected` prefers exact required-field labels and can include high-confidence implied answers. Add a deterministic runtime resolver fallback that semantically matches collected key variants to required fields, so existing and future leads display more accurate values across Inbox and Leads surfaces without sector-specific hardcoding.

**Tech Stack:** TypeScript, Vitest, Next.js app code, existing lead extraction + required-intake resolver modules.

---

### Task 1: Lock the missing behavior with failing tests

**Files:**
- Modify: `src/lib/leads/required-intake.test.ts`
- Modify: `src/lib/leads/extraction.test.ts`

**Step 1: Write the failing tests**

- Add a resolver test showing `required_intake_collected: { "Doğum Tarihi": "Mayıs başı - ortası gibi" }` should satisfy required field `Bebek Doğum Tarihi`.
- Add an extraction-prompt test showing the prompt explicitly instructs the model to use exact required-field labels and include high-confidence semantic/implied answers.

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/lib/leads/required-intake.test.ts src/lib/leads/extraction.test.ts`

Expected: FAIL because the resolver requires exact normalized key equality and the prompt does not yet encode the new contract clearly enough.

### Task 2: Implement semantic required-field key matching

**Files:**
- Modify: `src/lib/leads/required-intake.ts`

**Step 1: Add a high-confidence semantic key matcher**

- Match exact keys first.
- For remaining fields, allow semantically close collected keys when they share strong normalized token overlap/category-level meaning.
- Keep the matcher conservative enough to avoid cross-field leakage.

**Step 2: Keep existing manual override precedence**

- Manual overrides must still win over AI-collected values.
- Metadata behavior must stay unchanged.

### Task 3: Strengthen extraction prompt contract

**Files:**
- Modify: `src/lib/leads/extraction.ts`

**Step 1: Tighten required-intake prompt instructions**

- Tell the model to use the exact required-field labels provided.
- Allow semantically inferred but high-confidence answers.
- Allow approximate/range values when that is what the customer provided.
- Keep low-confidence inferred answers omitted.

**Step 2: Export prompt builder only if needed for unit coverage**

- Prefer a minimal change that allows direct test coverage without affecting runtime behavior.

### Task 4: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run verification**

Run:
- `npm test -- --run src/lib/leads/required-intake.test.ts src/lib/leads/extraction.test.ts`
- `npm test -- --run src/components/leads/mobile-table.test.ts`
- `npm run build`

**Step 2: Update docs**

- Record the new semantic required-field resolution behavior and extraction contract in roadmap, PRD, and release notes.

**Step 3: Commit**

```bash
git add src/lib/leads/required-intake.ts src/lib/leads/required-intake.test.ts src/lib/leads/extraction.ts src/lib/leads/extraction.test.ts src/components/leads/mobile-table.test.ts docs/ROADMAP.md docs/PRD.md docs/RELEASE.md docs/plans/2026-03-22-semantic-required-intake-resolution-plan.md
git commit -m "fix(phase-3): resolve required intake fields semantically"
```
