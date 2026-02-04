# Usage & Billing (AI Token Tracking) Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track org-level AI token usage (monthly UTC + total) and surface it under a new “Usage & Billing” settings page.

**Architecture:** Create a new `organization_ai_usage` table to store per-operation token usage rows. Add a server helper to record usage and fetch monthly/total summaries. Wire token logging into production LLM calls (router, RAG, fallback, summaries). Add a new Settings page and sidebar entry for Usage & Billing with a small usage panel and UTC month note.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), next-intl, OpenAI SDK, Tailwind CSS.

---

### Task 1: Add usage table + RLS

**Files:**
- Create: `supabase/migrations/00033_ai_token_usage.sql`

**Step 1: Write the migration**

```sql
CREATE TABLE IF NOT EXISTS public.organization_ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS organization_ai_usage_org_id_idx
  ON public.organization_ai_usage (organization_id, created_at DESC);

ALTER TABLE public.organization_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org ai usage"
  ON public.organization_ai_usage FOR SELECT
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

CREATE POLICY "Org members can insert ai usage"
  ON public.organization_ai_usage FOR INSERT
  WITH CHECK (
    is_org_member(organization_id, auth.uid())
    OR is_system_admin_secure()
  );
```

**Step 2: Manual verification**

Run: `supabase db diff` (if used locally) or review SQL.
Expected: Table + RLS policies present.

**Step 3: Commit**

```bash
git add supabase/migrations/00033_ai_token_usage.sql
git commit -m "feat(phase-6): add org ai usage table"
```

---

### Task 2: Add types and usage helpers

**Files:**
- Modify: `src/types/database.ts`
- Create: `src/lib/ai/usage.ts`

**Step 1: Write the failing test**

No automated test harness exists. Skip and rely on manual verification.

**Step 2: Implement minimal changes**

```ts
// src/types/database.ts
export interface OrganizationAiUsage {
  id: string
  organization_id: string
  category: string
  model: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  metadata: any
  created_at: string
}

// Database.Tables add organization_ai_usage
```

```ts
// src/lib/ai/usage.ts
'use server'
import { createClient } from '@/lib/supabase/server'

export type AiUsageCategory = 'fallback' | 'rag' | 'summary' | 'router'

export async function recordAiUsage({ organizationId, category, model, inputTokens, outputTokens, totalTokens, metadata }: {...}) {
  // clamp to >=0, compute total if missing
  // insert row, swallow errors
}

export async function getOrgAiUsageSummary(organizationId: string, options?: { supabase?: any }) {
  // compute UTC month start/end
  // query sums for monthly + total and return
}
```

**Step 3: Manual verification**

Run: `node -e "const d=require('./src/lib/ai/usage');console.log('ok');"`
Expected: no crash.

**Step 4: Commit**

```bash
git add src/types/database.ts src/lib/ai/usage.ts
git commit -m "feat(phase-6): add ai usage helpers"
```

---

### Task 3: Log token usage in production LLM paths

**Files:**
- Modify: `src/lib/ai/fallback.ts`
- Modify: `src/app/api/webhooks/telegram/route.ts`
- Modify: `src/lib/inbox/actions.ts`
- Modify: `src/lib/chat/actions.ts`

**Step 1: Write the failing test**

No automated test harness exists. Skip and rely on manual verification.

**Step 2: Implement minimal changes**

```ts
// fallback.ts
// add trackUsage?: boolean option to buildFallbackResponse
// compute usage from completion.usage or estimateTokenCount
// recordAiUsage({ category: 'fallback', ... })
// in simulateChat, pass trackUsage: false
```

```ts
// telegram route
// record router usage from decision.usage
// record RAG usage from completion.usage
```

```ts
// inbox/actions.ts
// record summary usage from completion.usage
```

**Step 3: Manual verification**

Trigger summary + fallback/RAG in Telegram, ensure no errors in logs.

**Step 4: Commit**

```bash
git add src/lib/ai/fallback.ts src/app/api/webhooks/telegram/route.ts src/lib/inbox/actions.ts src/lib/chat/actions.ts
git commit -m "feat(phase-6): log ai token usage events"
```

---

### Task 4: Add Usage & Billing settings page

**Files:**
- Create: `src/app/[locale]/(dashboard)/settings/billing/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/ai/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/channels/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/general/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/organization/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/profile/page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

No automated test harness exists. Skip and rely on manual verification.

**Step 2: Implement minimal changes**

```tsx
// new page uses Sidebar with billing group and active item
// fetch usage summary, render monthly + total tokens
// include note: "UTC calendar month" in UI copy
```

```json
// messages
// Sidebar.receipts -> "Usage & Billing" / "Kullanım ve Faturalandırma"
// billingUsage.* keys for titles, labels, and UTC note
```

**Step 3: Manual verification**

Open `/settings/billing` and confirm values render and sidebar active state.

**Step 4: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/billing/page.tsx src/app/[locale]/(dashboard)/settings/*/page.tsx messages/en.json messages/tr.json
git commit -m "feat(phase-6): add usage & billing settings page"
```

---

### Task 5: Documentation + build verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**

- Roadmap: mark Usage & Billing usage tracking as complete and update Last Updated date.
- PRD: add usage tracking requirement + note that all token-consuming features must log to usage.
- Release: add Usage & Billing + token tracking under Unreleased → Added.

**Step 2: Build verification**

Run: `npm run build`
Expected: Build succeeds (existing middleware warning acceptable).

**Step 3: Commit**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: document ai token usage tracking"
```
