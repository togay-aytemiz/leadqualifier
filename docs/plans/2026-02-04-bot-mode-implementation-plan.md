# Bot Mode (Active / Shadow / Off) Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an org-wide bot mode (Active/Shadow/Off) that gates live channel replies, shows status in the sidebar, and is configurable in AI Settings (Simulator excluded).

**Architecture:** Store `bot_mode` on `organization_ai_settings`, normalize defaults in server settings, and gate webhooks using a small pure helper. UI exposes mode in AI Settings and reads it for a sidebar status indicator; a client event triggers status refresh after saves.

**Tech Stack:** Next.js (App Router), Supabase (Postgres + RLS), next-intl (i18n), Tailwind CSS, lucide-react, Vitest (unit tests).

---

### Task 1: Data Model + Normalization + Unit Test Harness

**Files:**
- Create: `supabase/migrations/00032_org_ai_bot_mode.sql`
- Create: `vitest.config.ts`
- Create: `src/lib/ai/settings.test.ts`
- Modify: `package.json`
- Modify: `src/types/database.ts`
- Modify: `src/lib/ai/settings.ts`

**Step 1: Write the failing test**

```ts
// src/lib/ai/settings.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeBotMode } from '@/lib/ai/settings'

describe('normalizeBotMode', () => {
  it('keeps valid modes', () => {
    expect(normalizeBotMode('active')).toBe('active')
    expect(normalizeBotMode('shadow')).toBe('shadow')
    expect(normalizeBotMode('off')).toBe('off')
  })

  it('defaults to active for invalid values', () => {
    expect(normalizeBotMode('invalid' as any)).toBe('active')
    expect(normalizeBotMode(undefined)).toBe('active')
    expect(normalizeBotMode(null as any)).toBe('active')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL because `normalizeBotMode` is not exported or Vitest config is missing.

**Step 3: Write minimal implementation**

```ts
// src/lib/ai/settings.ts
export function normalizeBotMode(mode: string | null | undefined): AiBotMode {
  return mode === 'active' || mode === 'shadow' || mode === 'off' ? mode : 'active'
}
```

Add `bot_mode` to `OrganizationAiSettings` and defaults:

```ts
// src/types/database.ts
export type AiBotMode = 'active' | 'shadow' | 'off'

export interface OrganizationAiSettings {
  organization_id: string
  mode: AiMode
  bot_mode: AiBotMode
  match_threshold: number
  prompt: string
  created_at: string
  updated_at: string
}
```

```ts
// src/lib/ai/settings.ts
const DEFAULT_AI_SETTINGS = {
  mode: 'flexible',
  bot_mode: 'active',
  match_threshold: 0.6,
  prompt: DEFAULT_FLEXIBLE_PROMPT
}

function applyAiDefaults(settings: Partial<OrganizationAiSettings> | null) {
  const mode = normalizeMode()
  return {
    mode,
    bot_mode: normalizeBotMode(settings?.bot_mode ?? DEFAULT_AI_SETTINGS.bot_mode),
    match_threshold: clamp(Number(settings?.match_threshold ?? DEFAULT_AI_SETTINGS.match_threshold), 0, 1),
    prompt: resolvePrompt(settings?.prompt)
  }
}
```

Add DB migration:

```sql
-- supabase/migrations/00032_org_ai_bot_mode.sql
ALTER TABLE public.organization_ai_settings
  ADD COLUMN IF NOT EXISTS bot_mode TEXT NOT NULL DEFAULT 'active'
  CHECK (bot_mode IN ('active', 'shadow', 'off'));

UPDATE public.organization_ai_settings
SET bot_mode = 'active'
WHERE bot_mode IS NULL;
```

Add Vitest setup:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: { environment: 'node' },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } }
})
```

```json
// package.json (scripts/devDependencies)
"scripts": { "test": "vitest run", ... }
"devDependencies": { "vitest": "^1.6.0", ... }
```

**Step 4: Run test to verify it passes**

Run: `npm run test`
Expected: PASS (normalizeBotMode tests).

**Step 5: Commit**

```bash
git add supabase/migrations/00032_org_ai_bot_mode.sql vitest.config.ts src/lib/ai/settings.test.ts src/types/database.ts src/lib/ai/settings.ts package.json
git commit -m "feat(phase-5): add org bot_mode schema and defaults"
```

---

### Task 2: AI Settings UI + i18n

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

Add a UI smoke test placeholder in the plan (no existing React test harness). This task will be validated via manual checks.

**Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: PASS (no UI tests yet).

**Step 3: Write minimal implementation**

Add bot mode state, dirty tracking, save payload, and event dispatch:

```ts
// AiSettingsClient.tsx
const [botMode, setBotMode] = useState(initialSettings.bot_mode)

const isDirty = useMemo(() => (
  matchThreshold !== initialRef.current.match_threshold ||
  prompt !== initialRef.current.prompt ||
  botMode !== initialRef.current.bot_mode
), [matchThreshold, prompt, botMode])

await updateOrgAiSettings({ mode: 'flexible', match_threshold: matchThreshold, prompt, bot_mode: botMode })

initialRef.current = { ...initialRef.current, match_threshold: matchThreshold, prompt, bot_mode: botMode }

window.dispatchEvent(new CustomEvent('ai-settings-updated'))
```

Add a new SettingsSection at the top:

```tsx
// AiSettingsForm.tsx
<SettingsSection title={t('botModeTitle')} description={t('botModeDescription')}>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    {options.map(option => (
      <button key={option.value} type="button" onClick={() => onBotModeChange(option.value)} className={...}>
        <div className="flex items-center gap-3">
          <div className={...radioCircle} />
          <div>
            <p className="text-sm font-medium text-gray-900">{option.label}</p>
            <p className="text-xs text-gray-500 mt-1">{option.description}</p>
          </div>
        </div>
      </button>
    ))}
  </div>
</SettingsSection>
```

Add i18n keys in EN/TR:
- `aiSettings.botModeTitle`
- `aiSettings.botModeDescription`
- `aiSettings.botModeActive`
- `aiSettings.botModeActiveDescription`
- `aiSettings.botModeShadow`
- `aiSettings.botModeShadowDescription`
- `aiSettings.botModeOff`
- `aiSettings.botModeOffDescription`

**Step 4: Manual verification**

- Open `/settings/ai` and toggle bot mode cards.
- Confirm unsaved-changes guard works.
- Save and confirm “Saved” toast appears.

**Step 5: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.tsx messages/en.json messages/tr.json
git commit -m "feat(phase-5): add bot mode selector to AI settings"
```

---

### Task 3: Sidebar Status + Webhook Gating

**Files:**
- Create: `src/lib/ai/bot-mode.ts`
- Create: `src/lib/ai/bot-mode.test.ts`
- Modify: `src/design/MainSidebar.tsx`
- Modify: `src/app/api/webhooks/telegram/route.ts`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

```ts
// src/lib/ai/bot-mode.test.ts
import { describe, expect, it } from 'vitest'
import { resolveBotModeAction } from '@/lib/ai/bot-mode'

describe('resolveBotModeAction', () => {
  it('active allows replies', () => {
    expect(resolveBotModeAction('active')).toEqual({ allowReplies: true, allowLeadExtraction: true })
  })
  it('shadow allows lead extraction only', () => {
    expect(resolveBotModeAction('shadow')).toEqual({ allowReplies: false, allowLeadExtraction: true })
  })
  it('off disables everything', () => {
    expect(resolveBotModeAction('off')).toEqual({ allowReplies: false, allowLeadExtraction: false })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL because `resolveBotModeAction` does not exist.

**Step 3: Write minimal implementation**

```ts
// src/lib/ai/bot-mode.ts
import type { AiBotMode } from '@/types/database'

export function resolveBotModeAction(botMode: AiBotMode) {
  if (botMode === 'shadow') return { allowReplies: false, allowLeadExtraction: true }
  if (botMode === 'off') return { allowReplies: false, allowLeadExtraction: false }
  return { allowReplies: true, allowLeadExtraction: true }
}
```

Update Telegram webhook gating after active_agent check:

```ts
const botMode = aiSettings.bot_mode ?? 'active'
const { allowReplies, allowLeadExtraction } = resolveBotModeAction(botMode)

if (!allowReplies) {
  if (allowLeadExtraction) {
    // TODO(phase-6): run lead extraction only
  }
  return NextResponse.json({ ok: true })
}
```

Add sidebar status row (below logo) that fetches `organization_ai_settings.bot_mode` for the org and shows:

```tsx
<Link href="/settings/ai" className={...} title={...}>
  <span className={...dotClass} />
  <span className={...}>{tSidebar('botStatusLabel')}</span>
  <span className={...}>{botModeLabel}</span>
</Link>
```

Listen for `ai-settings-updated` to refetch bot mode:

```ts
useEffect(() => {
  const handler = () => organizationId && fetchBotMode(organizationId)
  window.addEventListener('ai-settings-updated', handler)
  return () => window.removeEventListener('ai-settings-updated', handler)
}, [organizationId])
```

Add i18n keys in EN/TR for sidebar:
- `mainSidebar.botStatusLabel`
- `mainSidebar.botStatusActive`
- `mainSidebar.botStatusShadow`
- `mainSidebar.botStatusOff`

**Step 4: Run test to verify it passes**

Run: `npm run test`
Expected: PASS (bot-mode helper tests + settings tests).

**Step 5: Commit**

```bash
git add src/lib/ai/bot-mode.ts src/lib/ai/bot-mode.test.ts src/design/MainSidebar.tsx src/app/api/webhooks/telegram/route.ts messages/en.json messages/tr.json
git commit -m "feat(phase-5): gate replies by bot mode and show sidebar status"
```

---

### Task 4: Final Build Verification

**Files:**
- None

**Step 1: Run build**

Run: `npm run build`
Expected: PASS

**Step 2: Commit (if needed)**

```bash
git status
# commit only if new changes exist
```

---

## Rollup Checks
- Ensure `messages/tr.json` mirrors `messages/en.json` keys.
- Simulator remains unaffected (no gating added in `simulateChat`).
- Telegram webhook returns early on `shadow`/`off` without outbound messages.

