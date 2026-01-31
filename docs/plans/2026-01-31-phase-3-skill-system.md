# Phase 3: Skill System — Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Skill System with CRUD operations, embedding-based matching, and a test playground.

**Key Concept:** A "Skill" is a single intent → single response mapping. Users define trigger phrases, and the system uses semantic similarity + LLM re-ranking to match incoming messages.

---

## Task 1: Create Skills Database Schema

**Files:**
- Create: `supabase/migrations/00004_skills.sql`

**Schema:**

```sql
-- Skills table
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  trigger_examples TEXT[] NOT NULL DEFAULT '{}',  -- Array of example trigger phrases
  response_text TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Skill embeddings for semantic search
CREATE TABLE skill_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  trigger_text TEXT NOT NULL,  -- The specific trigger phrase
  embedding vector(1536),      -- OpenAI text-embedding-3-small dimension
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_skills_org_id ON skills(organization_id);
CREATE INDEX idx_skill_embeddings_skill_id ON skill_embeddings(skill_id);

-- Enable pgvector for similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embedding search function
CREATE OR REPLACE FUNCTION match_skills(
  query_embedding vector(1536),
  org_id UUID,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  skill_id UUID,
  title TEXT,
  response_text TEXT,
  trigger_text TEXT,
  similarity FLOAT
) AS $$
  SELECT 
    s.id as skill_id,
    s.title,
    s.response_text,
    se.trigger_text,
    1 - (se.embedding <=> query_embedding) as similarity
  FROM skill_embeddings se
  JOIN skills s ON se.skill_id = s.id
  WHERE s.organization_id = org_id
    AND s.enabled = true
    AND 1 - (se.embedding <=> query_embedding) > match_threshold
  ORDER BY se.embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql;

-- RLS policies for skills
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org skills" 
  ON skills FOR SELECT 
  USING (organization_id IN (SELECT get_user_organizations(auth.uid())));

CREATE POLICY "Admins can manage skills" 
  ON skills FOR ALL 
  USING (is_org_admin(organization_id, auth.uid()));

CREATE POLICY "Users can view skill embeddings for their org" 
  ON skill_embeddings FOR SELECT 
  USING (skill_id IN (SELECT id FROM skills WHERE organization_id IN (SELECT get_user_organizations(auth.uid()))));

CREATE POLICY "Service role manages embeddings" 
  ON skill_embeddings FOR ALL 
  USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Commit:**
```bash
git add supabase/
git commit -m "feat(phase-3): add skills and embeddings schema"
```

---

## Task 2: Add TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

**Add:**

```typescript
export interface Skill {
  id: string
  organization_id: string
  title: string
  trigger_examples: string[]
  response_text: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface SkillEmbedding {
  id: string
  skill_id: string
  trigger_text: string
  embedding: number[] | null
  created_at: string
}

export interface SkillMatch {
  skill_id: string
  title: string
  response_text: string
  trigger_text: string
  similarity: number
}
```

---

## Task 3: Create Skill Server Actions

**Files:**
- Create: `src/lib/skills/actions.ts`

**Operations:**
- `getSkills(orgId)` — List all skills for org
- `getSkill(skillId)` — Get single skill
- `createSkill(data)` — Create skill + generate embeddings
- `updateSkill(skillId, data)` — Update skill + regenerate embeddings
- `deleteSkill(skillId)` — Delete skill (embeddings cascade)
- `toggleSkill(skillId, enabled)` — Enable/disable

**Key Logic:**
- On create/update, call OpenAI embeddings API for each trigger_example
- Store embeddings in skill_embeddings table

---

## Task 4: Create Embedding Service

**Files:**
- Create: `src/lib/skills/embeddings.ts`

**Functions:**
- `generateEmbedding(text: string)` — Call OpenAI text-embedding-3-small
- `generateSkillEmbeddings(skillId, triggerExamples)` — Generate all embeddings for a skill
- `matchSkills(query, orgId)` — Semantic search for matching skills

**Environment:**
- Add `OPENAI_API_KEY` to `.env.local.example`

---

## Task 5: Create Admin Skills UI

**Files:**
- Create: `src/app/[locale]/(dashboard)/skills/page.tsx`
- Create: `src/app/[locale]/(dashboard)/skills/new/page.tsx`
- Create: `src/app/[locale]/(dashboard)/skills/[id]/edit/page.tsx`
- Create: `src/components/skills/SkillForm.tsx`
- Create: `src/components/skills/SkillCard.tsx`
- Create: `src/components/skills/SkillList.tsx`

**Features:**
- List all skills with enable/disable toggle
- Create new skill form (title, triggers, response)
- Edit existing skill
- Delete skill with confirmation

---

## Task 6: Create Skill Test Playground

**Files:**
- Create: `src/app/[locale]/(dashboard)/skills/test/page.tsx`
- Create: `src/components/skills/SkillTestPlayground.tsx`

**Features:**
- Text input for test message
- "Test" button
- Shows:
  - Matched skill (if any)
  - Confidence score
  - Response that would be sent
  - Top-5 similar skills with scores

---

## Task 7: Add i18n Strings

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

**Add skills section translations.**

---

## Verification Plan

### Automated Verification
```bash
npm run build
npm run lint
```

### Manual Verification
1. Navigate to `/skills` in dashboard
2. Create a new skill:
   - Title: "Pricing"
   - Triggers: ["What are your prices?", "How much does it cost?", "Pricing info"]
   - Response: "Our prices start at..."
3. Go to test playground
4. Type "What's the price?" and verify it matches the skill
5. Verify confidence score is > 0.7

---

## Success Criteria

Phase 3 is complete when:
- [ ] Skills table deployed with RLS
- [ ] Admin can create/edit/delete skills
- [ ] Embeddings generated on skill save
- [ ] Test playground shows matched skills
- [ ] TypeScript types complete
