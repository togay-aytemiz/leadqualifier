# Lead Extraction & Qualification Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement lead extraction that updates on every new customer message, supports an optional service catalog plus an editable offering profile, skips non-business conversations, and records lead scores/summaries.

**Architecture:** Add new tables for leads, offering profile, service catalog/candidates, and profile updates. Wire Skills/KB updates to propose catalog candidates and profile deltas. Add a lead extraction worker that classifies non-business chats, extracts structured signals via LLM, computes scores in code, and upserts a lead snapshot. Expose admin controls in AI Settings for profile edits and candidate approvals.

**Tech Stack:** Next.js (App Router), Supabase (Postgres + RLS), OpenAI (gpt-4o-mini), next-intl (i18n), Tailwind CSS, TypeScript, Vitest.

---

### Task 0: Create Worktree

**Files:**
- None

**Step 1: Create a worktree**

Run: `git worktree add -b codex/lead-extraction ../leadqualifier-lead-extraction`
Expected: new worktree folder created.

**Step 2: Enter the worktree**

Run: `cd ../leadqualifier-lead-extraction`
Expected: `pwd` ends with `leadqualifier-lead-extraction`.

**Step 3: Install deps if needed**

Run: `npm install`
Expected: `node_modules` exists in the worktree.

**Step 4: Commit**

No commit for setup-only.

---

### Task 1: Add Lead Extraction Schema (Offering Profile, Catalog, Candidates, Leads)

**Files:**
- Create: `supabase/migrations/00035_lead_extraction_schema.sql`

**Step 1: Write the failing test**

Skip (DB migration).

**Step 2: Write the migration**

```sql
-- supabase/migrations/00035_lead_extraction_schema.sql

-- Offering Profile
CREATE TABLE IF NOT EXISTS public.offering_profiles (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  catalog_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_offering_profiles_updated_at
  BEFORE UPDATE ON public.offering_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.offering_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org offering profiles"
  ON public.offering_profiles FOR SELECT
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

CREATE POLICY "Org admins can manage offering profiles"
  ON public.offering_profiles FOR ALL
  USING (
    is_org_admin(organization_id, auth.uid())
    OR is_system_admin_secure()
  );

INSERT INTO public.offering_profiles (organization_id)
SELECT id FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION handle_new_org_offering_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.offering_profiles (organization_id)
  VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_organization_created_offering_profile ON public.organizations;
CREATE TRIGGER on_organization_created_offering_profile
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION handle_new_org_offering_profile();

-- Offering Profile Updates
CREATE TABLE IF NOT EXISTS public.offering_profile_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('skill', 'knowledge')),
  source_id UUID,
  proposed_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.offering_profile_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org offering profile updates"
  ON public.offering_profile_updates FOR SELECT
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

CREATE POLICY "Org admins can manage offering profile updates"
  ON public.offering_profile_updates FOR ALL
  USING (
    is_org_admin(organization_id, auth.uid())
    OR is_system_admin_secure()
  );

CREATE INDEX IF NOT EXISTS offering_profile_updates_org_idx
  ON public.offering_profile_updates (organization_id, status, created_at DESC);

-- Service Catalog (optional)
CREATE TABLE IF NOT EXISTS public.service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_service_catalog_updated_at
  BEFORE UPDATE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org service catalog"
  ON public.service_catalog FOR SELECT
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

CREATE POLICY "Org admins can manage service catalog"
  ON public.service_catalog FOR ALL
  USING (
    is_org_admin(organization_id, auth.uid())
    OR is_system_admin_secure()
  );

CREATE UNIQUE INDEX IF NOT EXISTS service_catalog_org_name_idx
  ON public.service_catalog (organization_id, lower(name));

-- Service Candidates
CREATE TABLE IF NOT EXISTS public.service_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('skill', 'knowledge')),
  source_id UUID,
  proposed_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.service_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org service candidates"
  ON public.service_candidates FOR SELECT
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

CREATE POLICY "Org admins can manage service candidates"
  ON public.service_candidates FOR ALL
  USING (
    is_org_admin(organization_id, auth.uid())
    OR is_system_admin_secure()
  );

CREATE INDEX IF NOT EXISTS service_candidates_org_idx
  ON public.service_candidates (organization_id, status, created_at DESC);

-- Leads
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  service_type TEXT,
  service_fit INT NOT NULL DEFAULT 0,
  intent_score INT NOT NULL DEFAULT 0,
  total_score INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'cold' CHECK (status IN ('hot', 'warm', 'cold', 'ignored')),
  summary TEXT,
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  non_business BOOLEAN NOT NULL DEFAULT FALSE,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (conversation_id)
);

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org leads"
  ON public.leads FOR SELECT
  USING (
    organization_id IN (SELECT get_user_organizations(auth.uid()))
    OR is_system_admin_secure()
  );

CREATE POLICY "Org admins can manage leads"
  ON public.leads FOR ALL
  USING (
    is_org_admin(organization_id, auth.uid())
    OR is_system_admin_secure()
  );

CREATE INDEX IF NOT EXISTS leads_org_status_idx
  ON public.leads (organization_id, status, updated_at DESC);
```

**Step 3: Commit**

```bash
git add supabase/migrations/00035_lead_extraction_schema.sql
git commit -m "feat(phase-6): add lead extraction schema"
```

---

### Task 2: Update Supabase Types

**Files:**
- Modify: `src/types/database.ts`

**Step 1: Write the failing test**

Skip (types).

**Step 2: Add types**

```ts
// src/types/database.ts
export type LeadStatus = 'hot' | 'warm' | 'cold' | 'ignored'
export type ServiceCandidateStatus = 'pending' | 'approved' | 'rejected'

export interface OfferingProfile {
  organization_id: string
  summary: string
  catalog_enabled: boolean
  created_at: string
  updated_at: string
}

export interface OfferingProfileUpdate {
  id: string
  organization_id: string
  source_type: 'skill' | 'knowledge'
  source_id: string | null
  proposed_summary: string
  status: ServiceCandidateStatus
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

export interface ServiceCatalogItem {
  id: string
  organization_id: string
  name: string
  aliases: string[]
  active: boolean
  created_at: string
  updated_at: string
}

export interface ServiceCandidate {
  id: string
  organization_id: string
  source_type: 'skill' | 'knowledge'
  source_id: string | null
  proposed_name: string
  status: ServiceCandidateStatus
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

export interface Lead {
  id: string
  organization_id: string
  conversation_id: string
  service_type: string | null
  service_fit: number
  intent_score: number
  total_score: number
  status: LeadStatus
  summary: string | null
  extracted_fields: any
  non_business: boolean
  last_message_at: string | null
  created_at: string
  updated_at: string
}
```

Add table mappings:

```ts
// src/types/database.ts
export interface Database {
  public: {
    Tables: {
      // ...existing tables
      offering_profiles: {
        Row: OfferingProfile
        Insert: Omit<OfferingProfile, 'created_at' | 'updated_at'>
        Update: Partial<Omit<OfferingProfile, 'organization_id' | 'created_at' | 'updated_at'>>
      }
      offering_profile_updates: {
        Row: OfferingProfileUpdate
        Insert: Omit<OfferingProfileUpdate, 'id' | 'created_at'>
        Update: Partial<Omit<OfferingProfileUpdate, 'id' | 'organization_id' | 'created_at'>>
      }
      service_catalog: {
        Row: ServiceCatalogItem
        Insert: Omit<ServiceCatalogItem, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ServiceCatalogItem, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>
      }
      service_candidates: {
        Row: ServiceCandidate
        Insert: Omit<ServiceCandidate, 'id' | 'created_at'>
        Update: Partial<Omit<ServiceCandidate, 'id' | 'organization_id' | 'created_at'>>
      }
      leads: {
        Row: Lead
        Insert: Omit<Lead, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Lead, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>
      }
    }
  }
}
```

**Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(phase-6): add lead extraction types"
```

---

### Task 3: Add Vitest Harness (If Not Present)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

Skip (tooling setup).

**Step 2: Add vitest config and script**

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
// package.json (scripts)
"test": "vitest"
```

```bash
npm install -D vitest
```

**Step 3: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "test(phase-6): add vitest harness"
```

---

### Task 4: Lead Scoring Helpers + Tests

**Files:**
- Create: `src/lib/leads/scoring.ts`
- Create: `src/lib/leads/scoring.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/leads/scoring.test.ts
import { describe, expect, it } from 'vitest'
import { scoreLead } from '@/lib/leads/scoring'

describe('scoreLead', () => {
  it('scores a strong lead', () => {
    const result = scoreLead({
      hasCatalogMatch: true,
      hasProfileMatch: true,
      hasDate: true,
      hasBudget: true,
      isDecisive: true,
      isUrgent: true,
      isIndecisive: false,
      isFarFuture: false
    })
    expect(result.totalScore).toBe(10)
    expect(result.status).toBe('hot')
  })

  it('caps score when no service match', () => {
    const result = scoreLead({
      hasCatalogMatch: false,
      hasProfileMatch: false,
      hasDate: true,
      hasBudget: true,
      isDecisive: true,
      isUrgent: true,
      isIndecisive: false,
      isFarFuture: false
    })
    expect(result.totalScore).toBeLessThanOrEqual(3)
    expect(result.status).toBe('cold')
  })

  it('marks ignored when non-business', () => {
    const result = scoreLead({
      hasCatalogMatch: true,
      hasProfileMatch: true,
      hasDate: true,
      hasBudget: true,
      isDecisive: true,
      isUrgent: true,
      isIndecisive: false,
      isFarFuture: false,
      nonBusiness: true
    })
    expect(result.status).toBe('ignored')
    expect(result.totalScore).toBe(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL because `scoreLead` is missing.

**Step 3: Implement minimal scoring**

```ts
// src/lib/leads/scoring.ts
import type { LeadStatus } from '@/types/database'

export interface LeadSignalInput {
  hasCatalogMatch: boolean
  hasProfileMatch: boolean
  hasDate: boolean
  hasBudget: boolean
  isDecisive: boolean
  isUrgent: boolean
  isIndecisive: boolean
  isFarFuture: boolean
  nonBusiness?: boolean
}

export function scoreLead(input: LeadSignalInput) {
  if (input.nonBusiness) {
    return { serviceFit: 0, intentScore: 0, totalScore: 0, status: 'ignored' as LeadStatus }
  }

  const serviceFit = input.hasCatalogMatch ? 4 : input.hasProfileMatch ? 2 : 0
  let intentScore = 0
  if (input.hasDate) intentScore += 2
  if (input.hasBudget) intentScore += 2
  if (input.isDecisive) intentScore += 2
  if (input.isUrgent) intentScore += 2
  if (input.isIndecisive) intentScore -= 2
  if (input.isFarFuture) intentScore -= 1

  const rawTotal = Math.max(0, Math.min(10, serviceFit + intentScore))
  const totalScore = input.hasCatalogMatch || input.hasProfileMatch ? rawTotal : Math.min(rawTotal, 3)
  const status: LeadStatus = totalScore >= 8 ? 'hot' : totalScore >= 5 ? 'warm' : 'cold'

  return { serviceFit, intentScore: Math.max(0, Math.min(6, intentScore)), totalScore, status }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/leads/scoring.ts src/lib/leads/scoring.test.ts
git commit -m "feat(phase-6): add lead scoring helper"
```

---

### Task 5: Service Candidate + Offering Profile Helpers

**Files:**
- Create: `src/lib/leads/catalog.ts`
- Create: `src/lib/leads/catalog.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/leads/catalog.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeServiceName, isNewCandidate } from '@/lib/leads/catalog'

describe('catalog helpers', () => {
  it('normalizes service names', () => {
    expect(normalizeServiceName('  Newborn Shoot ')).toBe('newborn shoot')
  })

  it('detects new candidates', () => {
    const existing = ['newborn shoot', 'maternity']
    expect(isNewCandidate('Newborn Shoot', existing)).toBe(false)
    expect(isNewCandidate('Family', existing)).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL because helpers are missing.

**Step 3: Implement helpers**

```ts
// src/lib/leads/catalog.ts
export function normalizeServiceName(value: string) {
  return value.trim().toLowerCase()
}

export function isNewCandidate(name: string, existingNames: string[]) {
  const normalized = normalizeServiceName(name)
  return !existingNames.some((item) => normalizeServiceName(item) === normalized)
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/leads/catalog.ts src/lib/leads/catalog.test.ts
git commit -m "feat(phase-6): add catalog helper utilities"
```

---

### Task 6: Offering Profile + Candidate Proposals (Server Actions)

**Files:**
- Create: `src/lib/leads/offering-profile.ts`
- Modify: `src/lib/knowledge-base/actions.ts`
- Modify: `src/lib/skills/actions.ts`

**Step 1: Write the failing test**

Skip (LLM + server actions).

**Step 2: Implement profile proposal helpers**

```ts
// src/lib/leads/offering-profile.ts
'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { recordAiUsage } from '@/lib/ai/usage'
import { normalizeServiceName, isNewCandidate } from '@/lib/leads/catalog'

const PROFILE_SYSTEM_PROMPT = `You update a business Offering Profile.
Keep it short, bullet-like, and grounded in provided content.
Return JSON: { summary: string } only.`

export async function proposeOfferingProfileUpdate(options: {
  organizationId: string
  sourceType: 'skill' | 'knowledge'
  sourceId?: string | null
  content: string
  supabase?: any
}) {
  const supabase = options.supabase ?? await createClient()
  const { data: profile } = await supabase
    .from('offering_profiles')
    .select('summary')
    .eq('organization_id', options.organizationId)
    .maybeSingle()

  const currentSummary = profile?.summary ?? ''

  if (!process.env.OPENAI_API_KEY) return

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const userPrompt = `Current profile:\n${currentSummary}\n\nNew content:\n${options.content}`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: PROFILE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ]
  })

  const response = completion.choices[0]?.message?.content?.trim()
  if (!response) return

  let parsed: { summary?: string } = {}
  try {
    parsed = JSON.parse(response)
  } catch {
    return
  }

  const proposedSummary = (parsed.summary ?? '').trim()
  if (!proposedSummary || proposedSummary === currentSummary.trim()) return

  await supabase.from('offering_profile_updates').insert({
    organization_id: options.organizationId,
    source_type: options.sourceType,
    source_id: options.sourceId ?? null,
    proposed_summary: proposedSummary,
    status: 'pending'
  })

  if (completion.usage) {
    await recordAiUsage({
      organizationId: options.organizationId,
      category: 'lead_extraction',
      model: 'gpt-4o-mini',
      inputTokens: completion.usage.prompt_tokens ?? 0,
      outputTokens: completion.usage.completion_tokens ?? 0,
      totalTokens: completion.usage.total_tokens ?? 0,
      metadata: { source: 'offering_profile' },
      supabase
    })
  } else {
    await recordAiUsage({
      organizationId: options.organizationId,
      category: 'lead_extraction',
      model: 'gpt-4o-mini',
      inputTokens: estimateTokenCount(PROFILE_SYSTEM_PROMPT) + estimateTokenCount(userPrompt),
      outputTokens: estimateTokenCount(response),
      totalTokens: estimateTokenCount(PROFILE_SYSTEM_PROMPT) + estimateTokenCount(userPrompt) + estimateTokenCount(response),
      metadata: { source: 'offering_profile' },
      supabase
    })
  }
}

export async function proposeServiceCandidate(options: {
  organizationId: string
  sourceType: 'skill' | 'knowledge'
  sourceId?: string | null
  name: string
  supabase?: any
}) {
  const supabase = options.supabase ?? await createClient()
  const normalized = normalizeServiceName(options.name)
  if (!normalized) return

  const { data: existingCatalog } = await supabase
    .from('service_catalog')
    .select('name')
    .eq('organization_id', options.organizationId)

  const { data: existingCandidates } = await supabase
    .from('service_candidates')
    .select('proposed_name')
    .eq('organization_id', options.organizationId)
    .eq('status', 'pending')

  const existing = [
    ...(existingCatalog ?? []).map((row: any) => row.name),
    ...(existingCandidates ?? []).map((row: any) => row.proposed_name)
  ]

  if (!isNewCandidate(options.name, existing)) return

  await supabase.from('service_candidates').insert({
    organization_id: options.organizationId,
    source_type: options.sourceType,
    source_id: options.sourceId ?? null,
    proposed_name: options.name,
    status: 'pending'
  })
}
```

**Step 3: Wire proposals into Skill/KB create/update**

```ts
// src/lib/skills/actions.ts (inside createSkill / updateSkill)
await proposeServiceCandidate({
  organizationId: skill.organization_id,
  sourceType: 'skill',
  sourceId: data.id,
  name: data.title
})

await proposeOfferingProfileUpdate({
  organizationId: skill.organization_id,
  sourceType: 'skill',
  sourceId: data.id,
  content: `${data.title}\n${data.trigger_examples.join('\n')}\n${data.response_text}`
})
```

```ts
// src/lib/knowledge-base/actions.ts (after successful create/update)
await proposeServiceCandidate({
  organizationId,
  sourceType: 'knowledge',
  sourceId: data.id,
  name: data.title
})

await proposeOfferingProfileUpdate({
  organizationId,
  sourceType: 'knowledge',
  sourceId: data.id,
  content: `${data.title}\n${entry.content}`
})
```

**Step 4: Commit**

```bash
git add src/lib/leads/offering-profile.ts src/lib/skills/actions.ts src/lib/knowledge-base/actions.ts
git commit -m "feat(phase-6): propose offering profile updates and service candidates"
```

---

### Task 7: Lead Extraction Worker + JSON Parsing Helpers

**Files:**
- Create: `src/lib/leads/extraction.ts`
- Create: `src/lib/leads/extraction.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/leads/extraction.test.ts
import { describe, expect, it } from 'vitest'
import { safeParseLeadExtraction } from '@/lib/leads/extraction'

describe('safeParseLeadExtraction', () => {
  it('fills defaults on invalid payloads', () => {
    const result = safeParseLeadExtraction('{"service_type": "Newborn"}')
    expect(result.service_type).toBe('Newborn')
    expect(result.non_business).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL because helper is missing.

**Step 3: Implement extraction worker (minimal)**

```ts
// src/lib/leads/extraction.ts
'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { scoreLead } from '@/lib/leads/scoring'
import { recordAiUsage } from '@/lib/ai/usage'

const EXTRACTION_SYSTEM_PROMPT = `Extract lead signals as JSON.
Return keys: service_type, desired_date, location, budget_signals, intent_signals, risk_signals, non_business.
Use nulls if unknown. Use non_business=true only for personal/social conversations.`

export function safeParseLeadExtraction(input: string) {
  try {
    const parsed = JSON.parse(input)
    return {
      service_type: parsed.service_type ?? null,
      desired_date: parsed.desired_date ?? null,
      location: parsed.location ?? null,
      budget_signals: parsed.budget_signals ?? [],
      intent_signals: parsed.intent_signals ?? [],
      risk_signals: parsed.risk_signals ?? [],
      non_business: Boolean(parsed.non_business)
    }
  } catch {
    return {
      service_type: null,
      desired_date: null,
      location: null,
      budget_signals: [],
      intent_signals: [],
      risk_signals: [],
      non_business: false
    }
  }
}

export async function runLeadExtraction(options: {
  organizationId: string
  conversationId: string
  latestMessage?: string
  supabase?: any
  source?: 'telegram' | 'whatsapp'
}) {
  const supabase = options.supabase ?? await createClient()

  const [{ data: profile }, { data: catalog }, { data: messages }] = await Promise.all([
    supabase.from('offering_profiles').select('*').eq('organization_id', options.organizationId).maybeSingle(),
    supabase.from('service_catalog').select('name, aliases, active').eq('organization_id', options.organizationId).eq('active', true),
    supabase.from('messages').select('sender_type, content, created_at').eq('conversation_id', options.conversationId).order('created_at', { ascending: false }).limit(10)
  ])

  const contextMessages = (messages ?? []).reverse().map((msg: any) => `${msg.sender_type}: ${msg.content}`)

  if (!process.env.OPENAI_API_KEY) return

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const catalogList = (catalog ?? []).map((row: any) => row.name).join(', ')
  const userPrompt = `Offering profile:\n${profile?.summary ?? ''}\n\nCatalog:${catalogList}\n\nConversation:\n${contextMessages.join('\n')}`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ]
  })

  const response = completion.choices[0]?.message?.content?.trim() ?? '{}'
  const extracted = safeParseLeadExtraction(response)

  const hasCatalogMatch = extracted.service_type
    ? (catalog ?? []).some((row: any) => row.name.toLowerCase() === extracted.service_type.toLowerCase())
    : false

  const signals = {
    hasCatalogMatch,
    hasProfileMatch: !hasCatalogMatch && Boolean(profile?.summary),
    hasDate: Boolean(extracted.desired_date),
    hasBudget: Array.isArray(extracted.budget_signals) && extracted.budget_signals.length > 0,
    isDecisive: Array.isArray(extracted.intent_signals) && extracted.intent_signals.includes('decisive'),
    isUrgent: Array.isArray(extracted.intent_signals) && extracted.intent_signals.includes('urgent'),
    isIndecisive: Array.isArray(extracted.intent_signals) && extracted.intent_signals.includes('indecisive'),
    isFarFuture: Array.isArray(extracted.intent_signals) && extracted.intent_signals.includes('far_future'),
    nonBusiness: extracted.non_business
  }

  const scored = scoreLead(signals)

  await supabase.from('leads').upsert({
    organization_id: options.organizationId,
    conversation_id: options.conversationId,
    service_type: extracted.service_type,
    service_fit: scored.serviceFit,
    intent_score: scored.intentScore,
    total_score: scored.totalScore,
    status: scored.status,
    non_business: extracted.non_business,
    summary: extracted.non_business ? 'Non-business conversation' : null,
    extracted_fields: {
      desired_date: extracted.desired_date,
      location: extracted.location,
      budget_signals: extracted.budget_signals,
      intent_signals: extracted.intent_signals,
      risk_signals: extracted.risk_signals
    },
    last_message_at: new Date().toISOString()
  }, { onConflict: 'conversation_id' })

  if (completion.usage) {
    await recordAiUsage({
      organizationId: options.organizationId,
      category: 'lead_extraction',
      model: 'gpt-4o-mini',
      inputTokens: completion.usage.prompt_tokens ?? 0,
      outputTokens: completion.usage.completion_tokens ?? 0,
      totalTokens: completion.usage.total_tokens ?? 0,
      metadata: { conversation_id: options.conversationId, source: options.source },
      supabase
    })
  } else {
    await recordAiUsage({
      organizationId: options.organizationId,
      category: 'lead_extraction',
      model: 'gpt-4o-mini',
      inputTokens: estimateTokenCount(EXTRACTION_SYSTEM_PROMPT) + estimateTokenCount(userPrompt),
      outputTokens: estimateTokenCount(response),
      totalTokens: estimateTokenCount(EXTRACTION_SYSTEM_PROMPT) + estimateTokenCount(userPrompt) + estimateTokenCount(response),
      metadata: { conversation_id: options.conversationId, source: options.source },
      supabase
    })
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/leads/extraction.ts src/lib/leads/extraction.test.ts
git commit -m "feat(phase-6): add lead extraction worker"
```

---

### Task 8: Wire Lead Extraction into Telegram Webhook

**Files:**
- Modify: `src/app/api/webhooks/telegram/route.ts`

**Step 1: Write the failing test**

Skip (webhook integration).

**Step 2: Call lead extraction when allowed**

```ts
// src/app/api/webhooks/telegram/route.ts
import { runLeadExtraction } from '@/lib/leads/extraction'

// After message save + conversation update, before AI reply gating:
const { allowReplies, allowLeadExtraction } = resolveBotModeAction(aiSettings.bot_mode ?? 'active')
if (allowLeadExtraction) {
  await runLeadExtraction({
    organizationId: orgId,
    conversationId: conversation.id,
    latestMessage: text,
    supabase,
    source: 'telegram'
  })
}

// If allowReplies is false, return after extraction.
```

**Step 3: Commit**

```bash
git add src/app/api/webhooks/telegram/route.ts
git commit -m "feat(phase-6): trigger lead extraction from Telegram webhook"
```

---

### Task 9: AI Settings UI for Offering Profile + Candidates

**Files:**
- Modify: `src/app/[locale]/(dashboard)/settings/ai/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx`
- Modify: `src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.tsx`
- Create: `src/components/settings/OfferingProfileSection.tsx`
- Create: `src/lib/leads/settings.ts`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Step 1: Write the failing test**

Skip (UI).

**Step 2: Add server actions for profile + candidates**

```ts
// src/lib/leads/settings.ts
'use server'

import { createClient } from '@/lib/supabase/server'

export async function getOfferingProfile(organizationId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('offering_profiles')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()
  return data
}

export async function getPendingProfileUpdates(organizationId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('offering_profile_updates')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function approveProfileUpdate(id: string) {
  const supabase = await createClient()
  const { data: update } = await supabase
    .from('offering_profile_updates')
    .select('*')
    .eq('id', id)
    .single()

  if (!update) throw new Error('Update not found')

  await supabase.from('offering_profiles').update({ summary: update.proposed_summary }).eq('organization_id', update.organization_id)
  await supabase.from('offering_profile_updates').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', id)
}

export async function rejectProfileUpdate(id: string) {
  const supabase = await createClient()
  await supabase.from('offering_profile_updates').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', id)
}

export async function getServiceCandidates(organizationId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('service_candidates')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function approveServiceCandidate(id: string) {
  const supabase = await createClient()
  const { data: candidate } = await supabase
    .from('service_candidates')
    .select('*')
    .eq('id', id)
    .single()

  if (!candidate) throw new Error('Candidate not found')

  await supabase.from('service_catalog').insert({
    organization_id: candidate.organization_id,
    name: candidate.proposed_name,
    aliases: []
  })

  await supabase.from('service_candidates').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', id)
}

export async function rejectServiceCandidate(id: string) {
  const supabase = await createClient()
  await supabase.from('service_candidates').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', id)
}

export async function updateOfferingProfileSummary(organizationId: string, summary: string, catalogEnabled: boolean) {
  const supabase = await createClient()
  await supabase.from('offering_profiles').update({ summary, catalog_enabled: catalogEnabled }).eq('organization_id', organizationId)
}
```

**Step 3: Add UI section**

```tsx
// src/components/settings/OfferingProfileSection.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { useTranslations } from 'next-intl'

export function OfferingProfileSection(props: {
  summary: string
  catalogEnabled: boolean
  pendingUpdates: Array<{ id: string; proposed_summary: string }>
  pendingCandidates: Array<{ id: string; proposed_name: string }>
  onSave: (summary: string, catalogEnabled: boolean) => Promise<void>
  onApproveUpdate: (id: string) => Promise<void>
  onRejectUpdate: (id: string) => Promise<void>
  onApproveCandidate: (id: string) => Promise<void>
  onRejectCandidate: (id: string) => Promise<void>
}) {
  const t = useTranslations('aiSettings')
  const [summary, setSummary] = useState(props.summary)
  const [catalogEnabled, setCatalogEnabled] = useState(props.catalogEnabled)

  return (
    <SettingsSection title={t('offeringProfileTitle')} description={t('offeringProfileDescription')}>
      <div className="space-y-4">
        <label className="text-sm font-medium text-gray-700">{t('offeringProfileLabel')}</label>
        <textarea
          rows={6}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
        />

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={catalogEnabled} onChange={(e) => setCatalogEnabled(e.target.checked)} />
          {t('catalogEnabledLabel')}
        </label>

        <Button onClick={() => props.onSave(summary, catalogEnabled)}>{t('offeringProfileSave')}</Button>

        {props.pendingUpdates.length > 0 && (
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-900">{t('pendingProfileUpdates')}</p>
            {props.pendingUpdates.map((item) => (
              <div key={item.id} className="mt-2 rounded-lg border p-3">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.proposed_summary}</p>
                <div className="mt-2 flex gap-2">
                  <Button onClick={() => props.onApproveUpdate(item.id)}>{t('approve')}</Button>
                  <Button variant="secondary" onClick={() => props.onRejectUpdate(item.id)}>{t('reject')}</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {catalogEnabled && props.pendingCandidates.length > 0 && (
          <div className="border-t pt-4">
            <p className="text-sm font-medium text-gray-900">{t('pendingServiceCandidates')}</p>
            {props.pendingCandidates.map((item) => (
              <div key={item.id} className="mt-2 rounded-lg border p-3 flex items-center justify-between">
                <span className="text-sm text-gray-700">{item.proposed_name}</span>
                <div className="flex gap-2">
                  <Button onClick={() => props.onApproveCandidate(item.id)}>{t('approve')}</Button>
                  <Button variant="secondary" onClick={() => props.onRejectCandidate(item.id)}>{t('reject')}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SettingsSection>
  )
}
```

**Step 4: Wire data into AI settings page/client**

- Load offering profile + pending updates/candidates in `settings/ai/page.tsx` and pass into `AiSettingsClient`.
- In `AiSettingsClient`, call actions from `src/lib/leads/settings.ts` for save/approve/reject.
- Render `OfferingProfileSection` after the AI prompt section.

**Step 5: Add i18n strings**

Add keys to `messages/en.json` and `messages/tr.json` under `aiSettings`:
- `offeringProfileTitle`
- `offeringProfileDescription`
- `offeringProfileLabel`
- `catalogEnabledLabel`
- `offeringProfileSave`
- `pendingProfileUpdates`
- `pendingServiceCandidates`
- `approve`
- `reject`

**Step 6: Commit**

```bash
git add src/app/[locale]/(dashboard)/settings/ai/page.tsx \
  src/app/[locale]/(dashboard)/settings/ai/AiSettingsClient.tsx \
  src/app/[locale]/(dashboard)/settings/ai/AiSettingsForm.tsx \
  src/components/settings/OfferingProfileSection.tsx \
  src/lib/leads/settings.ts \
  messages/en.json messages/tr.json

git commit -m "feat(phase-6): add offering profile settings UI"
```

---

### Task 10: Docs + Build Verification

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**
- Mark Phase 6 items as completed where applicable.
- Update PRD lead extraction rules if any changed during implementation.
- Add release notes under `[Unreleased]`.

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add docs/PRD.md docs/ROADMAP.md docs/RELEASE.md
git commit -m "docs: update lead extraction progress"
```

---

## Notes / Open Questions
- If the catalog is disabled, we still infer fit from the Offering Profile; `service_type` can remain null.
- If LLM extraction returns malformed JSON, `safeParseLeadExtraction` defaults to empty fields to avoid crashes.
- Consider a lightweight heuristic for non-business detection before LLM to reduce cost.

