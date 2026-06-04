# YIU Admissions Brochure File Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PDF-independent infrastructure and pre-brochure approved-corpus File Search ingest path needed for the YIU admissions demo, then leave the brochure-dependent benchmark and preview switch gated until the customer brochure arrives.

**Architecture:** Keep production defaults unchanged. Add focused local/eval helpers for vector-store readiness, approved citation mapping, source manifest validation, compact website packaging, and File Search ingest under the local benchmark path. Provider config work remains disabled by default until a later org/demo gate is explicitly enabled.

**Tech Stack:** TypeScript, Vitest, OpenAI Node SDK vector-store/File Search metadata shapes, existing `rag-eval` local harness, existing Qualy docs/spec tracker.

---

## File Structure

- Create `src/lib/knowledge-base/rag-eval/brochure-readiness.ts`
  - Parse approved brochure source manifests, build visitor-safe citation maps, and evaluate vector-store readiness.
- Create `src/lib/knowledge-base/rag-eval/brochure-readiness.test.ts`
  - TDD coverage for ready stores, failed/in-progress stores, incomplete manifests, unapproved source rows, and citation mapping.
- Modify `scripts/knowledge/rag-eval-runner.ts`
  - Use the approved citation manifest helper while preserving legacy story manifest support.
- Modify `scripts/knowledge/rag-file-search-ingest.ts`
  - Emit readiness-oriented metadata in the ingest output.
- Create `scripts/knowledge/rag-build-yiu-approved-corpus-manifest.ts`
  - Package the approved website crawl into markdown bundles, combine it with approved PDFs, and emit File Search file attributes.
- Create `scripts/knowledge/rag-build-yiu-approved-corpus-manifest.test.ts`
  - Cover website package generation, manifest composition, and vector-store attributes.
- Modify `docs/superpowers/specs/2026-06-04-yiu-admissions-brochure-file-search-design.md`
  - Keep the Implementation Tracker current after each task.
- Modify `docs/PRD.md`, `docs/ROADMAP.md`, and `docs/RELEASE.md`
  - Record completed behavior and decisions after implementation slices.

## Task 1: Brochure Readiness Helper

**Files:**

- Create: `src/lib/knowledge-base/rag-eval/brochure-readiness.ts`
- Test: `src/lib/knowledge-base/rag-eval/brochure-readiness.test.ts`
- Modify: `docs/superpowers/specs/2026-06-04-yiu-admissions-brochure-file-search-design.md`

- [x] **Step 1: Write failing tests**

Create tests that assert:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildCitationSourcesByFilename,
  evaluateBrochureVectorStoreReadiness,
  parseBrochureSourceManifest,
} from './brochure-readiness'

describe('brochure readiness', () => {
  const manifestJson = JSON.stringify({
    corpus_scope: 'yiu-tanitim-gunleri-2026',
    sources: [
      {
        openai_file_id: 'file_brochure',
        filename: 'brochure.pdf',
        approved_source_title: 'YIU Tanitim Gunleri Brosuru',
        approved_source_url: 'https://example.edu.tr/brochure.pdf',
        display_label: 'Tanitim Gunleri Brosuru',
        content_type: 'brochure_pdf',
        customer_approved: true,
      },
    ],
  })

  it('accepts a completed vector store with a complete approved source manifest', () => {
    const manifest = parseBrochureSourceManifest(manifestJson)
    const result = evaluateBrochureVectorStoreReadiness({
      expectedFileCount: 1,
      sourceManifest: manifest,
      vectorStore: {
        id: 'vs_ready',
        status: 'completed',
        usage_bytes: 12345,
        expires_after: { anchor: 'last_active_at', days: 30 },
        file_counts: {
          total: 1,
          completed: 1,
          failed: 0,
          cancelled: 0,
          in_progress: 0,
        },
      },
    })

    expect(result.ready).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.usageBytes).toBe(12345)
  })

  it('blocks preview when vector store processing or source approval is incomplete', () => {
    const manifest = parseBrochureSourceManifest(
      JSON.stringify({
        corpus_scope: 'yiu-tanitim-gunleri-2026',
        sources: [
          {
            openai_file_id: 'file_brochure',
            filename: 'brochure.pdf',
            approved_source_title: 'YIU Tanitim Gunleri Brosuru',
            display_label: 'Tanitim Gunleri Brosuru',
            content_type: 'brochure_pdf',
            customer_approved: false,
          },
        ],
      })
    )

    const result = evaluateBrochureVectorStoreReadiness({
      expectedFileCount: 1,
      sourceManifest: manifest,
      vectorStore: {
        id: 'vs_processing',
        status: 'in_progress',
        usage_bytes: 0,
        file_counts: {
          total: 1,
          completed: 0,
          failed: 0,
          cancelled: 0,
          in_progress: 1,
        },
      },
    })

    expect(result.ready).toBe(false)
    expect(result.failures).toContain('Vector store status must be completed')
    expect(result.failures).toContain('Source manifest has unapproved visitor-visible rows')
  })

  it('builds visitor-safe citation mapping from approved rows only', () => {
    const manifest = parseBrochureSourceManifest(manifestJson)

    expect(buildCitationSourcesByFilename(manifest)).toEqual({
      'brochure.pdf': {
        title: 'Tanitim Gunleri Brosuru',
        url: 'https://example.edu.tr/brochure.pdf',
      },
    })
  })
})
```

- [x] **Step 2: Run RED**

Run:

```bash
npm test -- --run src/lib/knowledge-base/rag-eval/brochure-readiness.test.ts
```

Expected: fail because `brochure-readiness.ts` does not exist.

- [x] **Step 3: Implement helper**

Add:

- `parseBrochureSourceManifest(json: string)`;
- `buildCitationSourcesByFilename(manifest)`;
- `evaluateBrochureVectorStoreReadiness(input)`.

The readiness helper must check vector-store status, file counts, manifest completeness, approval flags, and lifecycle/usage metadata without making network calls.

- [x] **Step 4: Run GREEN**

Run:

```bash
npm test -- --run src/lib/knowledge-base/rag-eval/brochure-readiness.test.ts
```

Expected: pass.

- [x] **Step 5: Update tracker**

Mark `Add brochure vector-store readiness and citation-manifest validation helpers` as complete in the spec.

## Task 2: Eval Runner Citation Mapping

**Files:**

- Modify: `scripts/knowledge/rag-eval-runner.ts`
- Test: `src/lib/knowledge-base/rag-eval/brochure-readiness.test.ts`

- [x] **Step 1: Write failing coverage**

Add a test for parsing approved source manifests and producing the same `citationSourcesByFilename` shape currently expected by File Search providers.

- [x] **Step 2: Wire runner**

Update the runner's `--source-manifest` loader to first try the approved brochure source manifest shape, then fall back to the existing legacy story manifest shape.

- [x] **Step 3: Verify**

Run:

```bash
npm test -- --run src/lib/knowledge-base/rag-eval/brochure-readiness.test.ts src/lib/knowledge-base/rag-eval/openai-file-search.test.ts src/lib/knowledge-base/rag-eval/openai-file-search-validated.test.ts
```

- [x] **Step 4: Update tracker**

Mark the citation mapping runner item as complete in the spec.

## Task 3: Ingest Readiness Metadata

**Files:**

- Modify: `scripts/knowledge/rag-file-search-ingest.ts`
- Test: add focused tests only if the script is refactored into pure helpers; otherwise verify with TypeScript build.

- [x] **Step 1: Extend ingest output**

Include vector store `id`, `name`, `status`, `usage_bytes`, `expires_after`, `expires_at`, and `file_counts` in the JSON output.

- [x] **Step 2: Emit approved source manifest skeleton**

For each uploaded approved file, emit a source-manifest-compatible row with `openai_file_id`, `filename`, label-derived `approved_source_title`, `display_label`, content type, and `customer_approved: true` when the manifest source is explicitly approved.

- [x] **Step 3: Verify**

Run:

```bash
npm run build
git diff --check
```

- [x] **Step 4: Update tracker**

Mark ingest readiness metadata as complete in the spec.

## Task 4: Provider Config Skeleton

**Files:**

- Create or modify provider config type files after inspecting the existing demo/provider configuration paths.
- Modify docs tracker only when the type boundary is implemented.

- [x] **Step 1: Inspect current demo and organization config paths**

Use `rg "demo_chat_channels|provider_profile|knowledge provider|rag provider"` to locate the right boundary.

- [x] **Step 2: Add disabled-by-default config type**

Add the smallest type/config parser needed to represent `brochure_file_search_validated` without changing global defaults.

- [x] **Step 3: Add tests**

Cover fallback resolution order: demo override, organization setting, global `supabase_rag`.

- [x] **Step 4: Update tracker**

## Task 4.5: Pre-Brochure Approved Corpus Ingest

**Files:**

- Create: `scripts/knowledge/rag-build-yiu-approved-corpus-manifest.ts`
- Test: `scripts/knowledge/rag-build-yiu-approved-corpus-manifest.test.ts`
- Modify: `scripts/knowledge/rag-file-search-ingest.ts`
- Modify: `src/lib/knowledge-base/rag-eval/manifest.ts`
- Modify: `src/lib/knowledge-base/rag-eval/brochure-readiness.ts`
- Modify: `docs/superpowers/specs/2026-06-04-yiu-admissions-brochure-file-search-design.md`

- [x] **Step 1: Package website crawl**

Package 1790 non-PDF website crawl pages into source-indexed markdown bundles grouped by source intent.

- [x] **Step 2: Combine approved PDFs**

Combine the 14 website packages with the 113 PDFs from the two user-approved YIU links.

- [x] **Step 3: Preserve source metadata**

Extend the local story manifest and ingest path with `sourceUrl`, `sourceGroup`, `contentType`, and per-file vector-store attributes.

- [x] **Step 4: Add ingest resilience**

Add File Search attach retry, per-file timeout, optional pending-file reporting, and early run-state output.

- [x] **Step 5: Ingest compact corpus**

Create the local OpenAI File Search vector store `vs_6a20bc28099081918fed4bfef3569c02` with 127 completed files, 0 failed, 0 in-progress, and `13080355` usage bytes.

- [x] **Step 6: Update tracker**

Record the pre-brochure corpus counts, vector-store id, and remaining brochure task in the spec.

Mark provider profile/config types complete in the spec.

## Task 5: PDF-Arrival Execution

**Files:**

- The exact files depend on the customer PDF and question list.

- [ ] **Step 1: Ingest only approved files**

Use the readiness-aware ingest script with the customer-approved brochure and optional contact/link sheet.

- [ ] **Step 2: Build benchmark cases**

Convert customer questions into supported, paraphrase, unsupported, critical-value, source-link, and follow-up test cases.

- [ ] **Step 3: Run benchmark matrix**

Run current baseline, raw File Search, validated File Search, and validated File Search with targeted retry.

- [ ] **Step 4: Customer signoff**

Share the report, record corrections, update expected terms/source rows, and rerun until preview criteria pass.
