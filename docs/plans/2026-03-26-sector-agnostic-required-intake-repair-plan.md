# Sector-Agnostic Required Intake Repair Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure Qualy treats contextually answered required fields as collected, persists high-confidence values under the exact configured field labels, and stops re-asking those fields in the same conversation turn.

**Architecture:** Introduce one shared sector-agnostic intake analyzer that combines persisted required-field values with live conversational evidence from recent assistant asks and customer replies. Use that analyzer in two places: a conservative post-extraction repair step that backfills `required_intake_collected` for clearly answered fields, and the live follow-up/response-guard path so same-turn implied answers are treated as fulfilled before extraction reruns. Keep persistence conservative: direct contextual answers may be materialized, but adjacent sibling fields should not be silently filled from weak implication alone unless explicit field metadata or a constrained repair pass confirms them.

**Tech Stack:** TypeScript, Vitest, Next.js app code, existing lead extraction flow, live follow-up guards, QA Lab intake coverage heuristics, OpenAI `gpt-4o-mini`.

---

## Recommended Approach

**Option A: Prompt-only tightening**
- Fastest change.
- Lowest code churn.
- Not reliable enough because the current extraction prompt already asks for high-confidence implied answers, yet underfilled `required_intake_collected` can still be persisted.

**Option B: Deterministic contextual repair only**
- Strong for “assistant asked field X, customer gave a short contextual answer”.
- Good for same-turn re-ask suppression.
- Still misses summary-only or broader semantic cases where the answer is present but not in a narrow ask/reply pair.

**Option C: Hybrid shared analyzer + conservative repair + live guard integration**
- Best balance of reliability and safety.
- Deterministic layer handles runtime no-reask behavior and direct ask/reply attribution.
- Optional constrained repair pass can recover remaining missing fields without sector hardcoding.

**Recommendation:** Implement Option C. It is the only approach that closes both failures in the reported case: fields staying blank in lead surfaces and the assistant re-asking something the customer already answered.

## Scope Decisions

- Treat the reported bug as a **general conversational attribution problem**, not a baby/pregnancy special case.
- A direct contextual answer like `Mayıs sonu haziran başı` should fill the field that was just asked if the field semantically expects a timeline/date-like answer.
- Do **not** auto-fill adjacent sibling fields like `Hamilelik Durumu` from the same date answer unless there is explicit evidence (`hamileyim`, `32 haftalık`, `doğum bekliyoruz`, etc.) or a later approved metadata/repair model says that field allows such inference.
- Runtime follow-up suppression should be broader than persistence. A field may be considered “fulfilled enough to avoid re-ask in this turn” before it is considered “safe enough to persist as a structured value”.

### Task 1: Lock the Bug with Failing Regressions

**Files:**
- Modify: `src/lib/leads/extraction.test.ts`
- Modify: `src/lib/ai/followup.test.ts`
- Modify: `src/lib/ai/response-guards.test.ts`
- Create: `src/lib/ai/required-intake-runtime.test.ts`

**Step 1: Write the failing extraction regression**

Add a test proving that a contextual reply can populate a missing required field even when the customer does not repeat the field label.

```ts
it('backfills a required date-like field from the latest ask/reply pair', () => {
  const repaired = repairRequiredIntakeFromConversation({
    requiredFields: ['Bebek Doğum Tarihi', 'Hamilelik Durumu'],
    existingCollected: {},
    recentAssistantMessages: ['Tahminen bebişin gelişi ne zaman?'],
    recentCustomerMessages: ['Mayıs sonu haziran başı'],
  })

  expect(repaired).toEqual({
    'Bebek Doğum Tarihi': 'Mayıs sonu haziran başı',
  })
})
```

**Step 2: Write the failing negative twin**

Add a test proving that the same answer does **not** automatically fill an adjacent status-like field without explicit evidence.

```ts
it('does not infer sibling status fields from a date-only contextual answer', () => {
  const repaired = repairRequiredIntakeFromConversation({
    requiredFields: ['Bebek Doğum Tarihi', 'Hamilelik Durumu'],
    existingCollected: {},
    recentAssistantMessages: ['Tahminen bebişin gelişi ne zaman?'],
    recentCustomerMessages: ['Mayıs sonu haziran başı'],
  })

  expect(repaired['Hamilelik Durumu']).toBeUndefined()
})
```

**Step 3: Add cross-sector live-state regressions**

Cover generic same-turn fulfillment and re-ask suppression for multiple categories so the fix is not baby-specific.

```ts
it('treats business size as fulfilled from a contextual reply before extraction reruns', () => {
  const state = analyzeRequiredIntakeState({
    requiredFields: ['Ekip Büyüklüğü', 'Bütçe'],
    recentAssistantMessages: ['Ekibiniz kaç kişiden oluşuyor?'],
    recentCustomerMessages: ['6 kişilik ekibiz'],
  })

  expect(state.collectedFields).toContain('Ekip Büyüklüğü')
  expect(state.missingFields).not.toContain('Ekip Büyüklüğü')
})
```

```ts
it('strips a re-ask for a field already fulfilled semantically in the current turn', () => {
  const response = applyLiveAssistantResponseGuards({
    response: 'Anladım. Ekip büyüklüğünüzü de paylaşır mısınız?',
    userMessage: '6 kişilik ekibiz.',
    responseLanguage: 'tr',
    blockedReaskFields: ['Ekip Büyüklüğü'],
    recentAssistantMessages: [],
  })

  expect(response).toContain('Anladım.')
  expect(response).not.toContain('Ekip büyüklüğünüzü')
})
```

**Step 4: Run the targeted tests to verify failure**

Run: `npm test -- --run src/lib/leads/extraction.test.ts src/lib/ai/followup.test.ts src/lib/ai/response-guards.test.ts src/lib/ai/required-intake-runtime.test.ts`

Expected: FAIL on the new contextual-attribution assertions.

**Step 5: Commit**

```bash
git add src/lib/leads/extraction.test.ts src/lib/ai/followup.test.ts src/lib/ai/response-guards.test.ts src/lib/ai/required-intake-runtime.test.ts
git commit -m "test(phase-3): cover contextual required intake attribution"
```

### Task 2: Extract a Shared Runtime Intake Analyzer

**Files:**
- Create: `src/lib/ai/required-intake-runtime.ts`
- Modify: `src/lib/qa-lab/intake-coverage.ts`
- Modify: `src/lib/ai/intake-field-match.ts`
- Test: `src/lib/ai/required-intake-runtime.test.ts`

**Step 1: Create the shared matcher/analyzer module**

Implement a pure helper that returns per-field state from recent conversation evidence.

```ts
export interface RuntimeRequiredIntakeFieldState {
  field: string
  asked: boolean
  fulfilled: boolean
  deferred: boolean
  blocked: boolean
  inferredValue: string | null
}

export function analyzeRuntimeRequiredIntake(input: {
  requiredFields: string[]
  recentAssistantMessages: string[]
  recentCustomerMessages: string[]
  persistedCollectedFields?: Record<string, string>
}): RuntimeRequiredIntakeFieldState[] {
  // Port the minimal sector-agnostic category and semantic helpers
  // from QA Lab into a live-safe module.
}
```

**Step 2: Port only the reusable QA heuristics**

Move or duplicate the smallest stable subset from `src/lib/qa-lab/intake-coverage.ts`:
- field-category construction
- question-intent detection
- informative semantic reply detection
- category-level fulfillment detection
- “assistant asked one field, customer replied informatively” fallback

Do **not** import the full QA pipeline or scenario-readiness logic.

**Step 3: Broaden shared field matching conservatively**

Extend `messageMentionsField` or wrap it so non-contact categories are not limited to raw label overlap.

```ts
const FIELD_CONCEPT_GROUPS = [
  ['telefon', 'phone', 'numara', 'number', 'iletisim', 'contact', 'mobile', 'gsm'],
  ['butce', 'bütçe', 'fiyat', 'price', 'ucret', 'ücret', 'budget', 'cost'],
  ['tarih', 'date', 'zaman', 'time', 'timeline', 'schedule', 'uygunluk'],
]
```

Keep this list category-driven and generic. Do not add baby/pregnancy-only aliases here.

**Step 4: Make QA Lab reuse the shared helper where practical**

Refactor `src/lib/qa-lab/intake-coverage.ts` to consume the shared matcher/analyzer helpers rather than keeping a second divergent implementation of the same semantics.

**Step 5: Run tests**

Run: `npm test -- --run src/lib/ai/required-intake-runtime.test.ts src/lib/qa-lab/intake-coverage.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/ai/required-intake-runtime.ts src/lib/ai/required-intake-runtime.test.ts src/lib/qa-lab/intake-coverage.ts src/lib/ai/intake-field-match.ts
git commit -m "refactor(phase-3): share required intake semantic analyzer"
```

### Task 3: Use the Shared Analyzer in Live Follow-Up and Guard Paths

**Files:**
- Modify: `src/lib/ai/followup.ts`
- Modify: `src/lib/ai/response-guards.ts`
- Modify: `src/lib/chat/actions.ts`
- Modify: `src/lib/ai/fallback.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/app/api/webhooks/telegram/route.ts`
- Test: `src/lib/ai/followup.test.ts`
- Test: `src/lib/ai/response-guards.test.ts`

**Step 1: Replace follow-up state derivation with the shared analyzer**

In `analyzeRequiredIntakeState`, seed the analyzer with persisted resolved fields and recent messages, then derive:
- `collectedFields`
- `blockedReaskFields`
- `missingFields`
- `suppressIntakeQuestions`

```ts
const runtimeStates = analyzeRuntimeRequiredIntake({
  requiredFields,
  recentAssistantMessages: assistantMessages,
  recentCustomerMessages: customerMessages,
  persistedCollectedFields,
})
```

**Step 2: Treat same-turn fulfillment as collected enough for no-reask**

If a field is semantically fulfilled in the current turn, exclude it from `missingFields` even if lead extraction has not yet persisted it.

**Step 3: Broaden ask detection beyond literal `?`**

Stop relying on `message.includes('?')` alone when deciding whether the assistant previously asked a field.

```ts
const assistantQuestionMessages = input.recentAssistantMessages
  .filter((message) => hasQuestionIntent(message))
  .slice(-3)
```

**Step 4: Use the same blocked-field semantics in response guards**

Make `stripBlockedFieldReaskQuestions` consume the broadened analyzer output so question wording drift and non-contact custom fields are handled consistently.

**Step 5: Pass lead snapshot consistently**

Update simulator/fallback/live call sites so they all provide the same snapshot inputs and do not diverge in collection behavior.

**Step 6: Run the mandatory live-intake guard suite**

Run: `npm test -- --run src/lib/ai/followup.test.ts`

Expected: PASS

Run: `npm test -- --run src/lib/ai/response-guards.test.ts`

Expected: PASS

**Step 7: Commit**

```bash
git add src/lib/ai/followup.ts src/lib/ai/response-guards.ts src/lib/chat/actions.ts src/lib/ai/fallback.ts src/lib/channels/inbound-ai-pipeline.ts src/app/api/webhooks/telegram/route.ts src/lib/ai/followup.test.ts src/lib/ai/response-guards.test.ts
git commit -m "fix(phase-3): stop live re-asks for semantically fulfilled intake fields"
```

### Task 4: Add Conservative Post-Extraction Required-Field Repair

**Files:**
- Create: `src/lib/leads/required-intake-repair.ts`
- Modify: `src/lib/leads/extraction.ts`
- Modify: `src/lib/leads/required-intake.ts`
- Test: `src/lib/leads/extraction.test.ts`
- Test: `src/lib/leads/required-intake.test.ts`

**Step 1: Create a repair helper for persisted required fields**

Implement a helper that inspects missing required fields after parsing the LLM payload and backfills only high-confidence contextual answers using the exact configured field labels.

```ts
export function repairRequiredIntakeFromConversation(input: {
  requiredFields: string[]
  existingCollected: Record<string, string>
  recentAssistantMessages: string[]
  recentCustomerMessages: string[]
}): Record<string, string> {
  // Use the shared analyzer and only persist direct field-attribution cases.
}
```

**Step 2: Apply the repair step before persistence**

In `runLeadExtraction`, after `safeParseLeadExtraction` and before `mergeExtractionWithExisting`, repair `required_intake_collected` for missing required fields using recent assistant/customer context.

**Step 3: Add a constrained repair retry when needed**

If required fields are configured, `summary` contains structured evidence, and `required_intake_collected` is still empty or clearly underfilled, run one small repair prompt for only the unresolved fields.

```ts
Return ONLY valid JSON with this shape:
{
  "required_intake_collected": {
    "<Exact Field Label>": "<value>"
  }
}
```

This repair prompt must:
- receive only unresolved field labels
- use recent conversation turns
- forbid low-confidence guesses
- return exact configured field labels only

**Step 4: Keep resolver fallback conservative**

Do not broaden `resolveCollectedRequiredIntake` into summary scraping. Resolution should still prefer structured fields. The repair step is the right place to turn conversational evidence into structured data.

**Step 5: Run extraction-focused tests**

Run: `npm test -- --run src/lib/leads/extraction.test.ts src/lib/leads/required-intake.test.ts src/components/leads/mobile-table.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/leads/required-intake-repair.ts src/lib/leads/extraction.ts src/lib/leads/required-intake.ts src/lib/leads/extraction.test.ts src/lib/leads/required-intake.test.ts src/components/leads/mobile-table.test.ts
git commit -m "fix(phase-3): repair missing required intake fields from conversation context"
```

### Task 5: Full Verification and Documentation

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run the required regression suite**

Run: `npm test -- --run src/lib/ai/followup.test.ts src/lib/ai/response-guards.test.ts`

Expected: PASS

**Step 2: Run the wider targeted suite**

Run: `npm test -- --run src/lib/leads/extraction.test.ts src/lib/leads/required-intake.test.ts src/lib/ai/required-intake-runtime.test.ts src/lib/qa-lab/intake-coverage.test.ts`

Expected: PASS

**Step 3: Run the production build**

Run: `npm run build`

Expected: PASS

**Step 4: Update roadmap, PRD, and release notes**

- `docs/ROADMAP.md`
  - Mark the new required-intake repair / live semantic fulfillment work complete.
  - Update `Last Updated`.
- `docs/PRD.md`
  - Add/update a tech decision stating that required-intake fulfillment now uses a shared sector-agnostic runtime analyzer plus conservative structured repair.
  - Update `Last Updated`.
- `docs/RELEASE.md`
  - Under `[Unreleased]`, add:
    - `Fixed`: contextual required-field answers now persist under exact configured labels
    - `Changed`: live assistant no longer re-asks semantically fulfilled required fields in the same turn

**Step 5: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: record sector-agnostic required intake repair"
```

## Verification Checklist

- A short contextual reply after an assistant ask fills the correct required field without label repetition.
- The same field is not re-asked in the same response cycle before lead extraction reruns.
- Cross-sector fields behave correctly: business size, frequency, timeline, urgency, level, contact.
- Sibling fields are not silently over-inferred from weak evidence.
- Inbox and Leads both render the repaired structured values through the existing resolver.
- QA Lab and live runtime share the same semantic foundations instead of drifting.

## Risks and Mitigations

- **Risk:** Over-inference creates false structured data.
  - **Mitigation:** Persist only direct contextual attributions or constrained repair-pass outputs. Use runtime-only fulfillment for weaker evidence.
- **Risk:** QA Lab and live logic diverge again.
  - **Mitigation:** Extract shared helpers into `src/lib/ai/required-intake-runtime.ts`.
- **Risk:** Existing dirty worktree edits in `src/lib/leads/extraction.ts` conflict with implementation.
  - **Mitigation:** Rebase this work on top of current extraction changes and avoid reverting unrelated edits.

