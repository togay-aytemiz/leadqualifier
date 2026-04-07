# Channel Verification and Explicit Bot Choice Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the final onboarding channel step self-explanatory by telling the operator to send a test message to the connected account, keep the channel in a clearly explained `pending verification` state until that first inbound message arrives, and require an explicit neutral bot-mode choice after verification instead of auto-switching the bot.

**Architecture:** Keep the underlying readiness contract unchanged: a Meta channel stays `pending` until webhook verification is recorded by the first valid inbound event or GET verification callback. Fix the UX by introducing clearer pending copy in both the channel card and channel detail screens, wiring a dedicated `verification guidance` description for pending Meta channels, and making the onboarding completion modal open whenever onboarding becomes complete and bot-mode selection has not been explicitly finalized. Do not bias the modal toward `Dinleyici`; explain all three states neutrally and let the operator choose.

**Tech Stack:** Next.js App Router, React client components, next-intl, existing onboarding shell state, existing Meta webhook routes, Supabase-backed AI settings, Vitest, Tailwind UI primitives.

---

## Product Direction

### Confirmed UX Decisions

- Keep a short pending title/badge, but make it specific through supporting copy.
- The operator must understand that **they** should send the first message to the connected account.
- The app should say that after the operator sends that message, **Qualy** will automatically verify the connection.
- Bot mode must not auto-switch after verification.
- The bot-mode modal should stay neutral:
  - no recommended option
  - no visual emphasis that nudges toward `Dinleyici`
  - explicit explanation of what `Aktif`, `Dinleyici`, and `Kapalı` each do

### Recommended Copy Direction

Use this meaning consistently across the product for pending Meta channels:

- **Title / status:** `Test mesajı bekleniyor`
- **Helper description:** `Bağlantıyı doğrulamak için bağlı hesaba kendiniz bir test mesajı gönderin. İlk mesaj geldikten sonra Qualy bağlantıyı otomatik olarak doğrular ve bot durumunu seçmenizi ister.`

For the bot-mode selection modal, keep all options visually equivalent and describe them in plain operator language:

- `Aktif`: replies + lead extraction
- `Dinleyici`: no customer reply, but still observes/extracts
- `Kapalı`: no reply and no automation

### Non-Goals

- Do not change the webhook verification contract itself.
- Do not add provider-side outbound test messaging.
- Do not auto-select `Dinleyici` or any other mode.
- Do not expand onboarding scope beyond channel verification clarity and explicit bot choice.

---

### Task 1: Lock the new UX contract with failing tests

**Files:**
- Modify: `src/components/channels/channelCards.test.ts`
- Modify: `src/components/channels/ChannelCard.source.test.ts`
- Modify: `src/lib/channels/meta-connection-copy.test.ts`
- Modify: `src/components/onboarding/OnboardingCompletionModal.test.tsx`
- Modify: `src/lib/ai/settings.test.ts`

**Step 1: Write the failing tests**

Add coverage that proves:
- pending channel surfaces no longer stop at a vague `Kurulum bekleniyor` meaning
- pending Meta detail pages expose copy that tells the operator to send a test message to the connected account
- the completion modal remains neutral and does not contain recommendation language for `Dinleyici`
- onboarding-complete workspaces still require explicit bot-mode choice even when AI settings row state is sparse or legacy

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run src/components/channels/channelCards.test.ts src/components/channels/ChannelCard.source.test.ts src/lib/channels/meta-connection-copy.test.ts src/components/onboarding/OnboardingCompletionModal.test.tsx src/lib/ai/settings.test.ts
```

Expected: FAIL because the current copy is vague and the modal/opening contract is still too permissive.

**Step 3: Write minimal implementation**

- Extend tests to assert the new pending guidance text contract.
- Add assertions that the modal option copy is explanatory rather than recommendatory.
- Add a regression for onboarding-complete + missing explicit unlock persistence to ensure UI still requests a choice.

**Step 4: Run test to verify it passes**

Run the same command and confirm PASS.

**Step 5: Commit**

```bash
git add src/components/channels/channelCards.test.ts src/components/channels/ChannelCard.source.test.ts src/lib/channels/meta-connection-copy.test.ts src/components/onboarding/OnboardingCompletionModal.test.tsx src/lib/ai/settings.test.ts
git commit -m "test(phase-3): cover channel verification guidance and explicit bot choice"
```

---

### Task 2: Clarify pending verification copy in channel gallery and channel detail screens

**Files:**
- Modify: `messages/tr.json`
- Modify: `messages/en.json`
- Modify: `src/components/channels/ChannelCard.tsx`
- Modify: `src/lib/channels/meta-connection-copy.ts`
- Modify: `src/components/channels/InstagramOnboardingPage.tsx`
- Modify: `src/components/channels/WhatsAppOnboardingPage.tsx`

**Step 1: Write the minimal implementation**

Update localized copy so pending Meta channels explicitly say:
- the channel is connected
- the operator should send a test message to the connected account
- Qualy will automatically verify after that first message
- bot mode will be chosen after verification

In `ChannelCard.tsx`:
- keep the compact status badge
- add a visible pending-only helper line under the connected account line or near the footer so the card communicates action, not just status

In `meta-connection-copy.ts` and the Meta onboarding pages:
- preserve the existing `pending/success/error` structure
- point pending detail pages to the new explanatory description/banner text
- ensure both WhatsApp and Instagram use the same behavioral story, with channel-specific nouns only where necessary

**Step 2: Run targeted tests**

Run:

```bash
npm test -- --run src/components/channels/channelCards.test.ts src/components/channels/ChannelCard.source.test.ts src/lib/channels/meta-connection-copy.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add messages/tr.json messages/en.json src/components/channels/ChannelCard.tsx src/lib/channels/meta-connection-copy.ts src/components/channels/InstagramOnboardingPage.tsx src/components/channels/WhatsAppOnboardingPage.tsx
git commit -m "feat(phase-3): clarify channel verification guidance in onboarding and cards"
```

---

### Task 3: Update onboarding final-step copy to match the new verification story

**Files:**
- Modify: `messages/tr.json`
- Modify: `messages/en.json`
- Modify: `src/components/onboarding/OnboardingPageClient.tsx`
- Modify: `src/components/onboarding/OnboardingPageClient.test.tsx`

**Step 1: Write the failing test**

Add a test proving the final onboarding step no longer reads like plain `connect channels` only, and now explains:
- connect the channel
- send a test message to yourself / the connected account
- after verification, choose bot status explicitly

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run src/components/onboarding/OnboardingPageClient.test.tsx
```

Expected: FAIL

**Step 3: Write minimal implementation**

Update the final onboarding step copy in `messages/*.json` and keep the CTA target on `/settings/channels`.

The copy should describe the sequence clearly:
1. connect a channel
2. send yourself a test message on that connected account
3. let Qualy auto-verify
4. choose bot status

Keep the visual structure simple; do not add a new modal or extra branching at this step.

**Step 4: Run test to verify it passes**

Run:

```bash
npm test -- --run src/components/onboarding/OnboardingPageClient.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add messages/tr.json messages/en.json src/components/onboarding/OnboardingPageClient.tsx src/components/onboarding/OnboardingPageClient.test.tsx
git commit -m "feat(phase-3): align onboarding channel step with verification flow"
```

---

### Task 4: Make bot-mode choice mandatory and neutral after onboarding completion

**Files:**
- Modify: `src/lib/ai/settings.ts`
- Modify: `src/app/[locale]/(dashboard)/layout.tsx`
- Modify: `src/components/onboarding/OnboardingCompletionModal.tsx`
- Modify: `src/lib/onboarding/actions.ts`
- Modify: `src/lib/onboarding/actions.test.ts`
- Modify: `src/lib/ai/settings.test.ts`
- Modify: `src/app/[locale]/(dashboard)/layout.test.tsx`

**Step 1: Write the failing test**

Add tests for:
- onboarding complete + unresolved explicit choice still opens the completion modal
- the modal does not visually privilege `Dinleyici`
- bot mode remains effectively `off` until the operator picks one option
- saving the chosen mode still clears the unlock flag as before

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run src/lib/onboarding/actions.test.ts src/lib/ai/settings.test.ts 'src/app/[locale]/(dashboard)/layout.test.tsx' src/components/onboarding/OnboardingCompletionModal.test.tsx
```

Expected: FAIL

**Step 3: Write minimal implementation**

Tighten the modal-open contract so onboarding-complete organizations still surface the modal when explicit bot-mode choice has not been finalized, even if the stored AI settings row is absent or legacy-shaped.

Implementation rules:
- effective bot mode stays `off` until explicit selection is completed
- the modal options have equal visual weight
- copy explains behavior only; no recommendation copy such as `recommended`, `safer`, or `best for starting`
- the selected mode is persisted only after the operator clicks one option

Prefer making this robust in server-derived state instead of relying on a fragile client-only heuristic.

**Step 4: Run test to verify it passes**

Run the same command and confirm PASS.

**Step 5: Commit**

```bash
git add src/lib/ai/settings.ts 'src/app/[locale]/(dashboard)/layout.tsx' src/components/onboarding/OnboardingCompletionModal.tsx src/lib/onboarding/actions.ts src/lib/onboarding/actions.test.ts src/lib/ai/settings.test.ts 'src/app/[locale]/(dashboard)/layout.test.tsx' src/components/onboarding/OnboardingCompletionModal.test.tsx
git commit -m "feat(phase-3): require explicit neutral bot choice after onboarding verification"
```

---

### Task 5: Refresh the UI immediately when webhook verification flips a pending channel to ready

**Files:**
- Modify: `src/app/api/webhooks/instagram/route.ts`
- Modify: `src/app/api/webhooks/whatsapp/route.ts`
- Modify: `src/components/channels/InstagramOnboardingPage.tsx`
- Modify: `src/components/channels/WhatsAppOnboardingPage.tsx`
- Modify: `src/components/channels/ChannelsList.tsx`
- Create or Modify: lightweight client event wiring only if required by the existing shell architecture
- Test: `src/app/api/webhooks/instagram/route.test.ts`
- Test: `src/app/api/webhooks/whatsapp/route.test.ts`

**Step 1: Write the failing test**

Add or extend tests proving:
- first valid inbound message marks the pending Meta channel verified
- the post-verify state is still compatible with the explicit bot-choice flow

If client refresh behavior is implemented with an event or polling shortcut, add narrow tests around that mechanism rather than broad integration guesses.

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run src/app/api/webhooks/instagram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts
```

Expected: FAIL only if additional UX refresh wiring changes observable behavior; otherwise keep this task focused on preserving verification correctness.

**Step 3: Write minimal implementation**

- Keep webhook verification semantics unchanged
- after a successful pending->verified transition, make sure the operator-facing screens do not require a confusing manual detour to see the updated state
- if needed, trigger `router.refresh()` from the existing channel detail surfaces after a connect attempt / known success path
- do not introduce heavy polling

**Step 4: Run test to verify it passes**

Run the same command and confirm PASS.

**Step 5: Commit**

```bash
git add src/app/api/webhooks/instagram/route.ts src/app/api/webhooks/whatsapp/route.ts src/components/channels/InstagramOnboardingPage.tsx src/components/channels/WhatsAppOnboardingPage.tsx src/components/channels/ChannelsList.tsx src/app/api/webhooks/instagram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts
git commit -m "feat(phase-3): surface webhook verification completion without auto-switching bot mode"
```

---

### Task 6: Update product docs and run final verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**

Record:
- pending Meta channels now explain that the operator should send a test message to the connected account
- onboarding no longer implies automatic bot activation after verification
- bot mode now requires an explicit neutral post-verification choice

Add an update note / release note that clarifies the difference between:
- channel connected
- verification pending
- channel ready
- bot mode chosen

**Step 2: Run final verification**

Run:

```bash
npm test -- --run src/components/channels/channelCards.test.ts src/components/channels/ChannelCard.source.test.ts src/lib/channels/meta-connection-copy.test.ts src/components/onboarding/OnboardingPageClient.test.tsx src/components/onboarding/OnboardingCompletionModal.test.tsx src/lib/onboarding/actions.test.ts src/lib/ai/settings.test.ts src/app/api/webhooks/instagram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts
```

Run:

```bash
npm run build
```

Expected: PASS

**Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: record channel verification guidance and explicit bot choice flow"
```
