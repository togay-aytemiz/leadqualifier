# Bot Mode Onboarding Lock Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** New workspaces created after this rollout should start with bot mode locked in `off`, complete `Başlangıç` onboarding before enabling `Dinleyici` or `Aktif`, and see a one-time completion modal when onboarding reaches `5/5`.

**Architecture:** Do not globally force all existing organizations into `off`. Instead, introduce a per-organization onboarding lock flag for new organizations only, keep runtime behavior fail-safe by resolving effective bot mode as `off` while locked, and unlock the bot only after onboarding is fully complete and the user explicitly chooses `Aktif`, `Dinleyici`, or `Şimdilik kapalı kalsın` in a completion modal. The modal should be driven from the cached onboarding shell snapshot so it can appear regardless of which step completed last.

**Tech Stack:** Next.js App Router, Supabase Postgres/RLS, next-intl, existing onboarding shell state, existing AI settings server actions, existing sidebar quick-switch UI.

---

## Product Direction

### Recommended Approach

Use a **new org-scoped bot-mode onboarding lock** instead of deriving lock from all incomplete onboarding states globally.

Why this is the right fit:
- It satisfies your latest decision: **new users default to `Kapalı`**.
- It avoids unexpectedly shutting off existing active customers/workspaces.
- It gives us a clean unlock moment tied to the `5/5` modal.
- It keeps runtime safe even if someone tries to bypass the UI.

### Rollout Rule

For this plan, **new kullanıcılar** means **new organizations/workspaces created after the migration ships**.

- Existing organizations must keep their current bot-mode behavior.
- Existing organizations must not be forced to `Kapalı`.
- New organizations must be created with:
  - `bot_mode = 'off'`
  - `bot_mode_unlock_required = true`
- The lock remains active until onboarding reaches `5/5` and the operator makes an explicit choice in the completion modal.

### Alternatives Considered

1. **Global derived lock from incomplete onboarding**
- Simpler technically.
- Bad rollout risk: existing active workspaces could become `Kapalı`.
- Not recommended.

2. **Store both `saved_mode` and `effective_mode`**
- Flexible, but overengineered for MVP.
- Adds cognitive and runtime complexity.
- Not recommended.

3. **Recommended: `bot_mode_unlock_required` + default `off` for new orgs**
- New orgs start locked and `off`.
- Existing orgs stay unchanged.
- Runtime/UI/server all enforce the same rule.

---

### Task 1: Add New-User Bot Lock Persistence

**Files:**
- Create: `supabase/migrations/00105_bot_mode_onboarding_lock.sql`
- Modify: `src/types/database.ts`
- Test: `src/lib/ai/settings.test.ts`

**Step 1: Write the failing test**

Add a test in `src/lib/ai/settings.test.ts` proving that when the lock flag is present for a new org, the returned settings expose that lock metadata and resolve default bot mode as `off`.

Expected cases:
- New org with no saved bot mode → `off`
- Existing org backfilled with unlocked state → unchanged behavior
- Locked org with saved `active/shadow` → effective mode still resolves to `off`

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run src/lib/ai/settings.test.ts
```

Expected: FAIL because lock metadata/effective off behavior does not exist yet.

**Step 3: Write minimal implementation**

Create migration `00105_bot_mode_onboarding_lock.sql`:
- Add `bot_mode_unlock_required boolean not null default true` to `organization_ai_settings`
- Add `bot_mode_unlocked_at timestamptz null`
- Backfill existing rows to `bot_mode_unlock_required = false`
- Update the `handle_new_org_ai_settings()` trigger path so newly inserted organizations create AI settings rows with locked onboarding behavior
- Ensure `bot_mode` default becomes `off` for newly created org rows without silently changing persisted bot mode for existing rows

Update `src/types/database.ts`:
- Extend `OrganizationAiSettings` with:
  - `bot_mode_unlock_required: boolean`
  - `bot_mode_unlocked_at: string | null`

Update `src/lib/ai/settings.ts`:
- `DEFAULT_AI_SETTINGS.bot_mode` becomes `off`
- Return both persisted and effective mode data cleanly
- Existing rows without the new columns should fail safe to unlocked behavior to avoid regressions during partial rollout

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- --run src/lib/ai/settings.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add supabase/migrations/00105_bot_mode_onboarding_lock.sql src/types/database.ts src/lib/ai/settings.ts src/lib/ai/settings.test.ts
git commit -m "feat(phase-3): add onboarding bot-mode lock for new organizations"
```

---

### Task 2: Add Runtime Enforcement for Locked Workspaces

**Files:**
- Modify: `src/lib/ai/settings.ts`
- Modify: `src/lib/ai/bot-mode.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/app/api/webhooks/telegram/route.ts`
- Test: `src/lib/ai/bot-mode.test.ts`
- Test: `src/lib/channels/inbound-ai-pipeline.test.ts`
- Test: `src/app/api/webhooks/telegram/route.test.ts`

**Step 1: Write the failing test**

Add tests covering:
- Locked org returns effective `off` even if stored mode is `active`
- Locked org does not reply
- Locked org does not extract leads
- Simulator behavior remains unchanged if product wants simulator unaffected

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run src/lib/ai/bot-mode.test.ts src/lib/channels/inbound-ai-pipeline.test.ts src/app/api/webhooks/telegram/route.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

Introduce a helper in `src/lib/ai/settings.ts` or `src/lib/ai/bot-mode.ts`:
- `resolveEffectiveBotMode({ storedMode, onboardingLockRequired })`

Apply it consistently:
- Anywhere runtime reads org AI settings for actual bot behavior
- Never trust raw stored `bot_mode` directly when lock is active

Important:
- While locked, behavior must be exactly `off`:
  - messages saved
  - no reply
  - no lead extraction

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- --run src/lib/ai/bot-mode.test.ts src/lib/channels/inbound-ai-pipeline.test.ts src/app/api/webhooks/telegram/route.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/ai/settings.ts src/lib/ai/bot-mode.ts src/lib/channels/inbound-ai-pipeline.ts src/app/api/webhooks/telegram/route.ts src/lib/ai/bot-mode.test.ts src/lib/channels/inbound-ai-pipeline.test.ts src/app/api/webhooks/telegram/route.test.ts
git commit -m "feat(phase-3): enforce off bot mode while onboarding lock is active"
```

---

### Task 3: Lock Bot Mode in AI Settings Screen

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/ai/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.tsx`
- Test: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.test.tsx`

**Step 1: Write the failing test**

Add tests for:
- Locked state shows bot mode options visually disabled
- Hover/help text explains: `Başlangıç adımlarını tamamladıktan sonra bot durumunu değiştirebilirsiniz.`
- Save flow rejects `active/shadow` while locked
- `off` remains selected and immutable while locked

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run 'src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.test.tsx'
```

Expected: FAIL

**Step 3: Write minimal implementation**

In `AiSettingsPage` / `AiSettingsClient`:
- Fetch onboarding shell state alongside AI settings
- Derive `isBotModeLocked = aiSettings.bot_mode_unlock_required && !onboardingState.isComplete`

In `AiSettingsForm`:
- Disable all bot mode cards while locked
- Keep `Kapalı` selected visually
- Add locked helper copy under bot mode section
- Add tooltip/info text on disabled options

UX requirement:
- The `Genel > Bot durumu` section must still explain the three states.
- Only `Dinleyici` and `Aktif` are locked.
- Hover/focus copy should make it explicit that the operator must finish `Başlangıç` first.

Server-side safety:
- `updateOrgAiSettings` must reject attempts to persist `active` or `shadow` when lock is active
- Return a localized error code/message for this case

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- --run 'src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.test.tsx'
```

Expected: PASS

**Step 5: Commit**

```bash
git add 'src/app/[locale]/(dashboard)/settings/ai/page.tsx' 'src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx' 'src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.tsx' 'src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.test.tsx'
git commit -m "feat(phase-3): lock ai settings bot mode until onboarding completion"
```

---

### Task 4: Lock Sidebar Quick Switch and Status Card

**Files:**
- Modify: `src/design/MainSidebar.tsx`
- Test: `src/design/main-sidebar-onboarding.test.ts`
- Test: `src/design/main-sidebar-tooltip-immediacy.test.ts`

**Step 1: Write the failing test**

Add tests/source assertions for:
- Locked workspaces show sidebar bot status as `Kapalı`
- Quick switch options are disabled while locked
- Helper text says onboarding must be completed first
- Hover/focus explanation exists on locked state

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run src/design/main-sidebar-onboarding.test.ts src/design/main-sidebar-tooltip-immediacy.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

In `MainSidebar.tsx`:
- Compute `isBotModeLockedByOnboarding`
- Override effective visible mode to `off` while locked
- Disable quick switch interaction for `active` / `shadow`
- Keep dropdown openable if useful, but only as explanatory UI
- Add helper text:
  - `Başlangıç adımlarını tamamlayınca bot durumunu açabilirsiniz.`

Optional improvement:
- Add a small lock badge/icon near the bot card while locked

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- --run src/design/main-sidebar-onboarding.test.ts src/design/main-sidebar-tooltip-immediacy.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/design/MainSidebar.tsx src/design/main-sidebar-onboarding.test.ts src/design/main-sidebar-tooltip-immediacy.test.ts
git commit -m "feat(phase-3): lock sidebar bot quick switch behind onboarding completion"
```

---

### Task 5: Show a One-Time 5/5 Completion Modal

**Files:**
- Modify: `src/lib/onboarding/state.ts`
- Modify: `src/lib/onboarding/actions.ts`
- Create: `src/components/onboarding/OnboardingCompletionModal.tsx`
- Modify: `src/app/[locale]/(dashboard)/layout.tsx`
- Test: `src/lib/onboarding/state.test.ts`
- Test: `src/components/onboarding/OnboardingPageClient.test.tsx` or new modal test

**Step 1: Write the failing test**

Add tests proving:
- When onboarding transitions to `5/5`, shell state exposes `showCompletionModal`
- Modal is one-time, not shown repeatedly after acknowledgement
- Final completion can come from any step order

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run src/lib/onboarding/state.test.ts src/components/onboarding/OnboardingPageClient.test.tsx
```

Expected: FAIL

**Step 3: Write minimal implementation**

Add persistence for completion modal:
- Either add to `organization_onboarding_states`:
  - `completion_modal_seen_at timestamptz null`
- Or use cookie fallback pattern similar to AI review if rollout safety is needed

Expose in onboarding shell state:
- `showCompletionModal`
- `isBotModeLocked`

Render modal globally in dashboard layout, not only on `/onboarding`, because final completion may happen from:
- Knowledge Base
- Skills
- Organization settings
- AI settings
- Channels

Modal content:
- Headline: onboarding complete / bot is ready to be enabled
- Explain current state: bot is still `Kapalı`
- Three choice cards:
  - `Dinleyici`
    - yellow/amber theme
    - saves messages + lead extraction, no replies
  - `Aktif`
    - green theme
    - bot replies + lead extraction
  - `Şimdilik kapalı kalsın`
    - neutral theme
    - unlocks control but keeps mode off

Important recommendation:
- Do not allow dismiss with bare close only.
- Require one explicit choice so the lock state resolves cleanly.
- After the user chooses one of the three options once, do not show the modal again for that organization.

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- --run src/lib/onboarding/state.test.ts src/components/onboarding/OnboardingPageClient.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/onboarding/state.ts src/lib/onboarding/actions.ts src/components/onboarding/OnboardingCompletionModal.tsx 'src/app/[locale]/(dashboard)/layout.tsx' src/lib/onboarding/state.test.ts src/components/onboarding/OnboardingPageClient.test.tsx
git commit -m "feat(phase-3): add onboarding completion modal for bot mode activation"
```

---

### Task 6: Unlock Bot Mode After Explicit Completion Choice

**Files:**
- Modify: `src/lib/ai/settings.ts`
- Modify: `src/lib/onboarding/actions.ts`
- Modify: `src/components/onboarding/OnboardingCompletionModal.tsx`
- Test: `src/lib/onboarding/actions.test.ts`
- Test: `src/lib/ai/settings.test.ts`

**Step 1: Write the failing test**

Add tests for:
- Choosing `Dinleyici` clears lock and saves `shadow`
- Choosing `Aktif` clears lock and saves `active`
- Choosing `Şimdilik kapalı kalsın` clears lock and saves `off`
- After unlock, AI settings and sidebar quick switch become interactive

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run src/lib/onboarding/actions.test.ts src/lib/ai/settings.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

Add a dedicated action, for example:
- `completeOnboardingBotModeUnlock({ organizationId, selectedMode })`

It should:
- verify onboarding is complete
- persist:
  - `bot_mode_unlock_required = false`
  - `bot_mode_unlocked_at = now()`
  - `bot_mode = selectedMode`
- refresh onboarding shell and AI settings consumers

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- --run src/lib/onboarding/actions.test.ts src/lib/ai/settings.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/ai/settings.ts src/lib/onboarding/actions.ts src/components/onboarding/OnboardingCompletionModal.tsx src/lib/onboarding/actions.test.ts src/lib/ai/settings.test.ts
git commit -m "feat(phase-3): unlock bot mode after explicit onboarding completion choice"
```

---

### Task 7: Localize New Lock + Completion Copy

**Files:**
- Modify: `messages/tr.json`
- Modify: `messages/en.json`
- Test: `src/i18n/messages.test.ts`

**Step 1: Write the failing test**

Add message tests for:
- locked helper text
- locked tooltip text
- completion modal title/body
- `Dinleyici` / `Aktif` / `Kapalı` benefit copy

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run src/i18n/messages.test.ts
```

Expected: FAIL

**Step 3: Write minimal implementation**

Add TR/EN copy for:
- sidebar locked helper
- AI settings locked helper
- completion modal title/body
- three mode cards
- explicit explanation that current bot is still off

Tone recommendation:
- `Kapalı`: neutral/slate
- `Dinleyici`: amber/yellow
- `Aktif`: emerald/green

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- --run src/i18n/messages.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add messages/tr.json messages/en.json src/i18n/messages.test.ts
git commit -m "feat(phase-3): add onboarding-locked bot mode copy and completion modal translations"
```

---

### Task 8: Regression Coverage for End-to-End Behavior

**Files:**
- Modify: `src/lib/navigation/default-home-route.test.ts`
- Modify: `src/design/main-sidebar-onboarding.test.ts`
- Modify: `src/components/settings/SettingsResponsiveShell.test.tsx`
- Optional: add new focused test for completion modal source if needed

**Step 1: Write the failing test**

Cover the full story:
- New org lands with onboarding incomplete and bot effectively off
- Bot mode controls remain locked before `5/5`
- After `5/5`, modal appears
- Choosing `Dinleyici` or `Aktif` unlocks controls and persists selection

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run src/lib/navigation/default-home-route.test.ts src/design/main-sidebar-onboarding.test.ts src/components/settings/SettingsResponsiveShell.test.tsx
```

Expected: FAIL

**Step 3: Write minimal implementation**

Adjust any remaining shell props, cache refreshes, or route hydration issues.

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- --run src/lib/navigation/default-home-route.test.ts src/design/main-sidebar-onboarding.test.ts src/components/settings/SettingsResponsiveShell.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/navigation/default-home-route.test.ts src/design/main-sidebar-onboarding.test.ts src/components/settings/SettingsResponsiveShell.test.tsx
git commit -m "test(phase-3): cover onboarding bot lock and unlock flow"
```

---

### Task 9: Documentation and Verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**

Add:
- new-user bot mode default `off`
- onboarding-gated bot-mode lock
- one-time completion modal
- explicit unlock choice behavior

**Step 2: Run verification**

Run:

```bash
npm run i18n:check
npm test -- --run src/lib/ai/settings.test.ts src/lib/ai/bot-mode.test.ts src/lib/onboarding/actions.test.ts src/lib/onboarding/state.test.ts 'src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.test.tsx' src/components/onboarding/OnboardingPageClient.test.tsx src/design/main-sidebar-onboarding.test.ts
npm run build
```

Expected:
- all pass

**Step 3: Final commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: record onboarding-gated bot mode rollout"
```

---

## Implementation Notes / Edge Cases

- **New users only:** this plan intentionally avoids disabling existing organizations by backfilling existing rows to `bot_mode_unlock_required = false`.
- **New users only:** in implementation terms this means organizations created after the migration/trigger change. It does not mean “first login by an existing org member”.
- **Runtime safety first:** even if the UI leaks, server/runtime must still behave as `off` while locked.
- **Do not auto-unlock on 5/5:** show the modal first and require an explicit choice.
- **`Kapalı kalsın` should still unlock controls:** otherwise users get trapped in a locked/off loop.
- **Simulator:** unless product says otherwise, keep simulator unaffected as current copy already states.
- **Partial rollout safety:** use the same schema-drift pattern already used in onboarding so the app does not crash if code deploys slightly ahead of migration.

## Suggested Modal Copy Direction

- Title:
  - `Başlangıç tamamlandı`
- Body:
  - `Qualy artık mesajları işlemeye hazır. Bot şu anda kapalı. İsterseniz dinleyici veya aktif moda geçebilirsiniz.`
- Cards:
  - `Dinleyici`
    - `Mesajları kaydeder, kişi çıkarımı yapar, yanıt göndermez.`
  - `Aktif`
    - `Mesajları yanıtlar, kişi çıkarımı yapar ve otomasyonu tam olarak başlatır.`
  - `Şimdilik kapalı kalsın`
    - `Botu kapalı bırakır; isterseniz daha sonra açabilirsiniz.`
