# Bot Name AI Setting Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an org-level bot name field in AI Settings, store it in `organization_ai_settings`, and thread it into AI prompts/summaries.

**Architecture:** Extend the org AI settings schema with a `bot_name` column and default. Update server actions to normalize/persist it, surface an editable field in the AI Settings UI, and inject the bot name into LLM system prompts (fallback, RAG, summaries). Optionally use the same bot name in inbox UI labels.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), next-intl, OpenAI SDK, Tailwind CSS.

---

### Task 1: Add database column for bot name

**Files:**
- Create: `supabase/migrations/00032_ai_settings_bot_name.sql`

**Step 1: Write the migration**

```sql
ALTER TABLE public.organization_ai_settings
  ADD COLUMN IF NOT EXISTS bot_name TEXT NOT NULL DEFAULT 'Bot';

UPDATE public.organization_ai_settings
SET bot_name = 'Bot'
WHERE bot_name IS NULL OR trim(bot_name) = '';
```

**Step 2: Verify (manual)**

Run: `supabase db diff` (if used locally) or inspect migration file for correctness.
Expected: Column exists with non-empty defaults.

**Step 3: Commit**

```bash
git add supabase/migrations/00032_ai_settings_bot_name.sql
git commit -m "feat(phase-5): add bot name column to ai settings"
```

---

### Task 2: Extend AI settings types and defaults

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/lib/ai/prompts.ts`
- Modify: `src/lib/ai/settings.ts`

**Step 1: Write the failing test**

No automated test harness exists. Skip and rely on manual verification in the UI.

**Step 2: Implement minimal changes**

```ts
// src/lib/ai/prompts.ts
export const DEFAULT_BOT_NAME = 'Bot'
export function normalizeBotName(value?: string | null) {
  const trimmed = (value ?? '').toString().trim()
  return trimmed || DEFAULT_BOT_NAME
}
export function withBotNamePrompt(basePrompt: string, botName?: string) {
  const name = normalizeBotName(botName)
  return `${basePrompt}\n\nThe assistant's name is \"${name}\". If the user asks who you are or your name, respond with \"${name}\".`
}
```

```ts
// src/types/database.ts
export interface OrganizationAiSettings {
  // ...
  bot_name: string
}
```

```ts
// src/lib/ai/settings.ts
const DEFAULT_AI_SETTINGS = { /* ... */, bot_name: DEFAULT_BOT_NAME }
// applyAiDefaults -> include bot_name: normalizeBotName(settings?.bot_name)
```

**Step 3: Manual verification**

Run: `node -e "const s=require('./src/lib/ai/prompts');console.log(s.normalizeBotName(''));"`
Expected: `Bot`

**Step 4: Commit**

```bash
git add src/types/database.ts src/lib/ai/prompts.ts src/lib/ai/settings.ts
git commit -m "feat(phase-5): persist bot name in ai settings defaults"
```

---

### Task 3: Add bot name field to AI Settings UI

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

No automated test harness exists. Skip and rely on manual verification in the UI.

**Step 2: Implement minimal changes**

```tsx
// AiSettingsForm props -> add botName + onBotNameChange
<input
  type="text"
  value={botName}
  onChange={(e) => onBotNameChange(e.target.value)}
  placeholder={t('botNamePlaceholder')}
/>
```

```ts
// AiSettingsClient state
const [botName, setBotName] = useState(initialSettings.bot_name)
// dirty check includes botName
// save includes bot_name: botName
// discard resets botName
```

```json
// messages/en.json
"botNameTitle": "Bot name",
"botNameDescription": "Shown to users and used in AI responses.",
"botNameLabel": "Bot name",
"botNamePlaceholder": "Bot"
```

```json
// messages/tr.json
"botNameTitle": "Bot adı",
"botNameDescription": "Kullanıcılara gösterilir ve yapay zeka cevaplarında kullanılır.",
"botNameLabel": "Bot adı",
"botNamePlaceholder": "Bot"
```

**Step 3: Manual verification**

Run: `npm run lint` (optional) or open `/settings/ai` and ensure the field edits and saves.

**Step 4: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.tsx src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx messages/en.json messages/tr.json
git commit -m "feat(phase-5): add bot name field to ai settings"
```

---

### Task 4: Inject bot name into prompts and summaries

**Files:**
- Modify: `src/lib/ai/fallback.ts`
- Modify: `src/lib/chat/actions.ts`
- Modify: `src/app/api/webhooks/telegram/route.ts`
- Modify: `src/lib/inbox/actions.ts`

**Step 1: Write the failing test**

No automated test harness exists. Skip and rely on manual verification (simulate via logs or UI).

**Step 2: Implement minimal changes**

```ts
// fallback.ts
const systemPrompt = withBotNamePrompt(prompt || DEFAULT_FLEXIBLE_PROMPT, aiSettings.bot_name)
```

```ts
// chat/actions.ts & telegram route
const basePrompt = aiSettings.prompt || DEFAULT_FLEXIBLE_PROMPT
const systemPrompt = `${withBotNamePrompt(basePrompt, aiSettings.bot_name)}\n\nAnswer the user's question...`
```

```ts
// inbox/actions.ts
const aiSettings = await getOrgAiSettings(organizationId, { supabase })
// use aiSettings.bot_name for role labels and summary system prompt
```

**Step 3: Manual verification**

Run: Use Simulator or Telegram webhook to ask “Sen kimsin?” and confirm response uses bot name.

**Step 4: Commit**

```bash
git add src/lib/ai/fallback.ts src/lib/chat/actions.ts src/app/api/webhooks/telegram/route.ts src/lib/inbox/actions.ts
git commit -m "feat(phase-5): inject bot name into ai prompts"
```

---

### Task 5: Use bot name in Inbox UI labels (optional but recommended)

**Files:**
- Modify: `src/app/[locale]/(dashboard)/inbox/page.tsx`
- Modify: `src/components/inbox/InboxContainer.tsx`

**Step 1: Write the failing test**

No automated test harness exists. Skip and rely on manual verification.

**Step 2: Implement minimal changes**

```tsx
// inbox/page.tsx
const aiSettings = await getOrgAiSettings(organizationId, { supabase })
<InboxContainer botName={aiSettings.bot_name} ... />
```

```tsx
// InboxContainer props
botName?: string
// replace t('botName') usage with botName ?? t('botName')
```

**Step 3: Manual verification**

Open Inbox and ensure bot message labels show the configured bot name.

**Step 4: Commit**

```bash
git add src/app/[locale]/(dashboard)/inbox/page.tsx src/components/inbox/InboxContainer.tsx
git commit -m "feat(phase-5): show bot name in inbox labels"
```

---

### Task 6: Docs + build verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**

- Mark the AI settings enhancement in Roadmap and update Last Updated date.
- Add AI settings bot name requirement + decision to PRD (Tech Decisions appendix) and update Last Updated date.
- Add entry under Unreleased → Added in Release notes.

**Step 2: Build verification**

Run: `npm run build`
Expected: Build succeeds with no type errors.

**Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: document ai bot name setting"
```
