# Human Escalation Policy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add centralized human escalation that supports skill-triggered handover and hot-lead-triggered escalation with configurable action/notice in AI Settings.

**Architecture:** Extend org AI settings + skills schema, add a pure escalation policy helper, and integrate policy execution into live webhook flow. Keep skill-triggered handover as strict override (`switch_to_operator` + `assistant_promise`). Reuse one org-level handover message source with a read-only preview in Skills and editable source in AI Settings.

**Tech Stack:** Next.js App Router, Supabase Postgres + RLS, next-intl, Vitest.

---

### Task 1: Add DB fields for escalation settings and skill handover flag

**Files:**
- Create: `supabase/migrations/00051_human_escalation_policy.sql`
- Modify: `src/types/database.ts`

**Step 1: Write the failing test**

```ts
// src/lib/ai/settings.test.ts
// Expect returned settings to include:
// - hot_lead_score_threshold
// - hot_lead_action
// - hot_lead_notice_mode
// - hot_lead_handover_message
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/ai/settings.test.ts`  
Expected: FAIL (missing fields in types/defaults).

**Step 3: Write minimal implementation**

```sql
ALTER TABLE public.organization_ai_settings
ADD COLUMN IF NOT EXISTS hot_lead_score_threshold INT NOT NULL DEFAULT 7
CHECK (hot_lead_score_threshold >= 0 AND hot_lead_score_threshold <= 10),
ADD COLUMN IF NOT EXISTS hot_lead_action TEXT NOT NULL DEFAULT 'notify_only'
CHECK (hot_lead_action IN ('notify_only', 'switch_to_operator')),
ADD COLUMN IF NOT EXISTS hot_lead_notice_mode TEXT NOT NULL DEFAULT 'assistant_promise'
CHECK (hot_lead_notice_mode IN ('assistant_promise', 'silent')),
ADD COLUMN IF NOT EXISTS hot_lead_handover_message TEXT NOT NULL DEFAULT 'I''ve notified the team. Since they might be with a client, they''ll get back to you as soon as possible.';

ALTER TABLE public.skills
ADD COLUMN IF NOT EXISTS requires_human_handover BOOLEAN NOT NULL DEFAULT FALSE;
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/ai/settings.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add supabase/migrations/00051_human_escalation_policy.sql src/types/database.ts src/lib/ai/settings.test.ts
git commit -m "feat(phase-6): add human escalation schema fields"
```

### Task 2: Extend AI settings defaults/normalization/update actions

**Files:**
- Modify: `src/lib/ai/settings.ts`

**Step 1: Write the failing test**

```ts
// src/lib/ai/settings.test.ts
// Clamp threshold to 0..10 and normalize invalid action/notice values.
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/ai/settings.test.ts`  
Expected: FAIL (normalization not implemented).

**Step 3: Write minimal implementation**

```ts
// Add defaults + normalize helpers:
// normalizeHotLeadAction, normalizeNoticeMode, normalizeHotLeadThreshold
// Include fields in getOrgAiSettings + updateOrgAiSettings payloads.
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/ai/settings.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/ai/settings.ts src/lib/ai/settings.test.ts
git commit -m "feat(phase-6): normalize and persist escalation ai settings"
```

### Task 3: Add Human Escalation UI in AI Settings + i18n

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

```tsx
// AI settings form test
// Assert hot score input, action radios, notice radios, message textarea.
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/app/[locale]/(dashboard)/settings/ai`  
Expected: FAIL (section missing).

**Step 3: Write minimal implementation**

```tsx
// Add "Human Escalation" section:
// - hot score number input
// - action radio group
// - notice mode radio group
// - handover message textarea
// Save/discard/dirty-state support in AiSettingsClient.
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/app/[locale]/(dashboard)/settings/ai`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.tsx messages/en.json messages/tr.json
git commit -m "feat(phase-6): add human escalation controls to ai settings"
```

### Task 4: Add skill-level handover toggle + read-only promise preview

**Files:**
- Modify: `src/components/skills/SkillsContainer.tsx`
- Modify: `src/lib/skills/actions.ts`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

```tsx
// skills form test
// Assert "Requires Human Handover" toggle persists.
// Assert read-only promise preview is rendered.
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/skills`  
Expected: FAIL (field missing).

**Step 3: Write minimal implementation**

```ts
// Include requires_human_handover in createSkill/updateSkill.
```

```tsx
// Add toggle in skill form.
// Show read-only handover message preview.
// Add deep-link button to AI Settings Human Escalation section.
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/components/skills`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/skills/SkillsContainer.tsx src/lib/skills/actions.ts messages/en.json messages/tr.json
git commit -m "feat(phase-6): add skill-level human handover toggle and readonly preview"
```

### Task 5: Implement centralized escalation policy helper

**Files:**
- Create: `src/lib/ai/escalation.ts`
- Create: `src/lib/ai/escalation.test.ts`

**Step 1: Write the failing test**

```ts
import { decideEscalation } from '@/lib/ai/escalation'

// Cases:
// 1) skill override => switch + promise
// 2) hot score + notify_only => notify only
// 3) hot score + switch => switch
// 4) below threshold => none
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/ai/escalation.test.ts`  
Expected: FAIL (module missing).

**Step 3: Write minimal implementation**

```ts
// Pure function with precedence:
// skill override > hot lead rule > none
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/ai/escalation.test.ts`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/ai/escalation.ts src/lib/ai/escalation.test.ts
git commit -m "feat(phase-6): add centralized escalation policy helper"
```

### Task 6: Integrate policy in Telegram webhook runtime

**Files:**
- Modify: `src/app/api/webhooks/telegram/route.ts`
- Modify: `src/lib/inbox/actions.ts` (only if helper for switch/notice insertion is needed)

**Step 1: Write the failing test**

```ts
// webhook integration test (or policy execution integration around route helpers)
// Verify order: AI reply -> promise (if enabled) -> operator switch
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/app/api/webhooks/telegram`  
Expected: FAIL.

**Step 3: Write minimal implementation**

```ts
// After response generation:
// - evaluate decideEscalation(...)
// - optionally send promise message
// - optionally switch conversation to operator
// - suppress duplicate promise when already operator-active
```

**Step 4: Run test to verify it passes**

Run: `npm run test -- src/app/api/webhooks/telegram`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/api/webhooks/telegram/route.ts src/lib/inbox/actions.ts
git commit -m "feat(phase-6): execute escalation policy in telegram webhook"
```

### Task 7: Docs + verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**

- Roadmap: mark completed escalation items and keep any deferred sub-items unchecked.
- PRD: ensure final behavior and precedence are documented.
- Release: add delivered escalation feature bullets.

**Step 2: Run full build**

Run: `npm run build`  
Expected: SUCCESS.

**Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: document human escalation rollout"
```
