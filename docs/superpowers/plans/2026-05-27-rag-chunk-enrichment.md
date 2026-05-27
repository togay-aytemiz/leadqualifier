# RAG Chunk Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Knowledge Base chunking preserve table/row evidence generally, then rebuild the YIU test organization's chunks with the same rules future PDF/UI uploads will use.

**Architecture:** Keep the current `knowledge_chunks.content` header-based metadata model to avoid a schema migration today. Add generic evidence-row chunks beside normal section chunks for table rows, contact rows, duration rows, policy rows, course rows, and address/value rows. Apply the same behavior to dashboard/API document processing and crawler corpus imports, then add a service-role reindex script for existing organizations.

**Tech Stack:** Next.js/TypeScript, Supabase, pgvector, OpenAI `text-embedding-3-small`, Vitest, Node scripts.

---

### Task 1: Regression Tests

**Files:**
- Modify: `src/lib/knowledge-base/actions.test.ts`
- Modify: `scripts/knowledge/crawl-corpus-importer.test.mjs`

- [x] Add a failing `processKnowledgeDocument` test proving a Markdown table row becomes its own indexed chunk with `Evidence Type: table-row`, `Evidence Label`, document title, and section metadata.
- [x] Add a failing `processKnowledgeDocument` test proving a dense evidence line such as a phone/e-mail/contact row becomes its own `Evidence Type: evidence-row` chunk.
- [x] Add matching crawler importer tests for `createWebsiteChunks`.
- [x] Run:

```bash
npm test -- --run src/lib/knowledge-base/actions.test.ts scripts/knowledge/crawl-corpus-importer.test.mjs -t "evidence"
```

Expected before implementation: tests fail because evidence-row metadata is missing.

### Task 2: App-Side Chunking

**Files:**
- Modify: `src/lib/knowledge-base/actions.ts`

- [x] Extend `IndexedSourceChunk` with `evidenceType` and `evidenceLabel`.
- [x] Add generic Markdown table parsing and high-signal evidence-line extraction inside `chunkKnowledgeDocumentContent`.
- [x] Include `Evidence Type:` and `Evidence Label:` lines in `buildIndexedChunkContent`.
- [x] Keep existing section chunks so broad policy answers still have surrounding context.
- [x] Run the focused tests and confirm they pass.

### Task 3: Crawler Importer Chunking

**Files:**
- Modify: `scripts/knowledge/crawl-corpus-importer.mjs`

- [x] Add the same table-row/evidence-row extraction to `createWebsiteChunks`.
- [x] Add `Evidence Type:` and `Evidence Label:` headers to crawl chunks.
- [x] Keep dry-run reports working with the richer chunks.
- [x] Run importer tests and confirm they pass.

### Task 4: Existing Org Reindex Script

**Files:**
- Modify: `src/lib/knowledge-base/actions.ts`
- Create: `scripts/knowledge/reindex-org-knowledge.ts`

- [x] Export a low-level service-safe `rebuildKnowledgeDocumentChunks` function that deletes and recreates chunks for one document after the caller has handled authorization.
- [x] Keep `processKnowledgeDocument` responsible for user auth and profile suggestions.
- [x] Add a service-role script that loads `.env`, filters documents by org/source/collection if provided, supports `--dry-run`, and rebuilds document chunks in batches.
- [x] Run a dry-run against the test org before real reindex.

### Task 5: Reindex and Verify

**Files:**
- Runtime data only, no source file changes expected.

- [x] Run the reindex script for the YIU test org with the improved chunk rules.
- [x] Run corpus health.
- [x] Run the 33-question live challenge.
- [x] Run public demo canary.
- [x] Run `npm run build`.

### Task 6: Docs and Commit

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [x] Document the new golden chunking rule.
- [ ] Commit with:

```bash
git commit -m "feat(phase-9): enrich rag evidence chunks"
```
