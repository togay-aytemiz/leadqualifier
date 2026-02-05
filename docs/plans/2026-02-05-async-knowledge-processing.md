# Async Knowledge Processing Implementation Plan

> **For Agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make knowledge content create/edit/delete return immediately (UI gets 200), while chunking and AI suggestions run asynchronously, with polling-based UI refresh.

**Architecture:** Split knowledge document creation/update into a fast insert/update (status=processing) plus a background processing endpoint that builds chunks, updates status, and triggers AI suggestions. UI redirects immediately and polls for processing completion while realtime handles sidebar counts.

**Tech Stack:** Next.js App Router, Supabase Postgres + RLS, OpenAI, next-intl.

---

### Task 1: Add async processing endpoint

**Files:**
- Create: `src/app/api/knowledge/process/route.ts`
- Modify: `src/lib/knowledge-base/actions.ts`

**Step 1: Export async processor**
```ts
export async function processKnowledgeDocument(documentId: string, supabase?: any) {
  // fetch doc, rebuild chunks, set status=ready or error,
  // propose service candidate + append offering suggestion
}
```

**Step 2: Implement API route**
```ts
// POST { id }
// verify user + org access, then call processKnowledgeDocument
```

**Step 3: Commit**
```bash
git add src/lib/knowledge-base/actions.ts src/app/api/knowledge/process/route.ts
git commit -m "feat(phase-6): add async knowledge processing endpoint"
```

---

### Task 2: Make create/update fast

**Files:**
- Modify: `src/lib/knowledge-base/actions.ts`
- Modify: `src/app/[locale]/(dashboard)/knowledge/create/page.tsx`
- Modify: `src/app/[locale]/(dashboard)/knowledge/[id]/EditContentForm.tsx`

**Step 1: Create/Update only mark status=processing**
- `createKnowledgeBaseEntry` should insert doc with `status='processing'` and return.
- `updateKnowledgeBaseEntry` should update content/title and set `status='processing'` without chunking.

**Step 2: Trigger async processing from UI**
- After create/update succeeds, call `fetch('/api/knowledge/process', {method:'POST', body: JSON.stringify({id})})` without blocking.
- Keep existing redirects and refresh.

**Step 3: Commit**
```bash
git add src/lib/knowledge-base/actions.ts src/app/[locale]/(dashboard)/knowledge/create/page.tsx src/app/[locale]/(dashboard)/knowledge/[id]/EditContentForm.tsx
git commit -m "feat(phase-6): enqueue async knowledge processing on save"
```

---

### Task 3: Poll list for processing completion

**Files:**
- Modify: `src/app/[locale]/(dashboard)/knowledge/components/KnowledgeContainer.tsx`

**Step 1: Add polling effect**
```ts
useEffect(() => {
  if (!entries.some(e => e.status === 'processing')) return
  const id = setInterval(() => { router.refresh(); window.dispatchEvent(new Event('knowledge-updated')) }, 5000)
  return () => clearInterval(id)
}, [entries, router])
```

**Step 2: Commit**
```bash
git add src/app/[locale]/(dashboard)/knowledge/components/KnowledgeContainer.tsx
git commit -m "feat(phase-6): poll knowledge list while processing"
```

---

### Task 4: Docs + build verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**
- ROADMAP: mark async KB processing/polling as done.
- PRD: note async KB processing and UI polling.
- RELEASE: add under Added/Changed.

**Step 2: Run build**
Run: `npm run build`
Expected: PASS

**Step 3: Commit**
```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs: document async knowledge processing"
```

---

Plan complete and saved to `docs/plans/2026-02-05-async-knowledge-processing.md`.

Two execution options:
1. Subagent-Driven (this session) – I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) – Open new session with executing-plans, batch execution with checkpoints

Which approach?
