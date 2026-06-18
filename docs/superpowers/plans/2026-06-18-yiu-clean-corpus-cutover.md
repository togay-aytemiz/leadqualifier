# YIU Clean Corpus Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the noisy 135-file YIU OpenAI corpus with a clean persistent vector store, align brochure-derived prices and quotas across the corpus and Skills, and switch runtime configuration only after independent validation.

**Architecture:** A deterministic corpus builder converts retained crawl pages into source-level Markdown, removes transient history and exact PDF duplicates, and combines those files with a tracked verified 2025 brochure source. The existing ingest tool gains an explicit persistent-store option. Production cutover remains a single visitor-safe manifest update after retrieval smoke passes. Skills continue to be the first route, but all brochure-derived numeric answers are corrected against the same tracked source.

**Tech Stack:** TypeScript, Vitest, OpenAI Vector Stores API, Supabase skill storage, Markdown source manifests, Next.js.

---

### Task 1: Add deterministic clean-corpus selection

**Files:**
- Create: `scripts/knowledge/rag-build-yiu-clean-corpus.ts`
- Create: `scripts/knowledge/rag-build-yiu-clean-corpus.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing selection tests**

Cover these behaviors with in-memory fixtures:

```ts
expect(selectWebsiteSource(stablePage)).toMatchObject({ keep: true })
expect(selectWebsiteSource(oldAnnouncement)).toMatchObject({
  keep: false,
  reason: 'transient_history',
})
expect(selectWebsiteSource(newsIndex)).toMatchObject({
  keep: false,
  reason: 'listing_page',
})
expect(selectWebsiteSource(navigationOnlyPage)).toMatchObject({
  keep: false,
  reason: 'navigation_only',
})
expect(deduplicateApprovedFiles([institutionalCopy, facultyCopy])).toEqual([facultyCopy])
expect(deduplicateApprovedFiles([differentDirectiveA, differentDirectiveB])).toHaveLength(2)
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- --run scripts/knowledge/rag-build-yiu-clean-corpus.test.ts
```

Expected: FAIL because the clean-corpus builder does not exist.

- [ ] **Step 3: Implement source selection and exact hash dedupe**

Export focused functions:

```ts
export type CorpusDecision = {
  keep: boolean
  reason: 'durable_page' | 'approved_root_page' | 'transient_history' |
    'listing_page' | 'navigation_only' | 'unsupported_route'
}

export function selectWebsiteSource(source: WebsiteSource): CorpusDecision
export async function deduplicateApprovedFiles(files: ApprovedCorpusFile[]): Promise<ApprovedCorpusFile[]>
export async function buildYiuCleanCorpus(input: BuildInput): Promise<CleanCorpusResult>
```

Selection must retain durable `/sayfa/` pages and the approved root-page set, remove news/event/announcement history and index listings, remove navigation-only bodies, emit one Markdown file per retained website source, and prefer the faculty-page PDF copy for identical Tıp PDF hashes.

- [ ] **Step 4: Emit deterministic audit and manifest outputs**

The CLI must write:

```text
tmp/rag-evals/yiu-clean-corpus/manifest.json
tmp/rag-evals/yiu-clean-corpus/audit.json
tmp/rag-evals/yiu-clean-corpus/audit.md
tmp/rag-evals/yiu-clean-corpus/website-pages/*.md
```

The audit records input count, retained count, exclusions by reason, duplicate hashes, retained source groups, and output hashes.

- [ ] **Step 5: Add the package command and run tests**

Add:

```json
"rag:yiu-clean-corpus:build": "npx tsx scripts/knowledge/rag-build-yiu-clean-corpus.ts"
```

Run the focused test again and expect PASS.

### Task 2: Track and validate the verified brochure facts

**Files:**
- Create: `src/lib/knowledge-base/provider-data/yiu-2025-brochure-verified.md`
- Create: `scripts/knowledge/yiu-brochure-facts.ts`
- Create: `scripts/knowledge/yiu-brochure-facts.test.ts`
- Modify: `scripts/knowledge/rag-build-yiu-brochure-manifest.ts`
- Modify: `scripts/knowledge/rag-build-yiu-brochure-manifest.test.ts`

- [ ] **Step 1: Copy the visually verified brochure extraction into a tracked source**

The tracked Markdown must preserve the PDF's explicit year labels:

```markdown
- Kontenjan: 2025
- Başarı sırası: 2024
- Taban puanı: 2024
- Fiyat: 2025
```

It must also preserve the Tıbbi Tanıtım ve Pazarlama row inconsistency instead of inventing a missing ücretli row.

- [ ] **Step 2: Write failing table parser assertions**

Assert representative rows from every table, including:

```ts
expect(facts['Hemşirelik|Ücretli']).toMatchObject({ quota: 2, priceTl: 490000 })
expect(facts['Anestezi|Burslu']).toMatchObject({ quota: 10, priceTl: null })
expect(facts['Grafik Tasarım|%50 İndirimli']).toMatchObject({ quota: 27, priceTl: 150000 })
expect(facts['Tıbbi Tanıtım ve Pazarlama|Burslu']).toMatchObject({
  quota: 4,
  priceTl: 330000,
  sourceConflict: true,
})
```

- [ ] **Step 3: Implement the strict Markdown table parser**

Reject malformed numeric cells and expose normalized program, variant, quota, prior rank, prior score, price, and conflict status. The parser is an audit/build tool and does not add a runtime answer layer.

- [ ] **Step 4: Point brochure packaging at the tracked verified source**

Change the default verified path from `tmp/` to the tracked provider-data Markdown and add a clear sentence to each generated price package:

```text
Bu tabloda kontenjan ve fiyatlar 2025, başarı sırası ve taban puanı 2024 yılına aittir.
```

- [ ] **Step 5: Run brochure tests**

Run:

```bash
npm test -- --run scripts/knowledge/yiu-brochure-facts.test.ts scripts/knowledge/rag-build-yiu-brochure-manifest.test.ts
```

Expected: PASS.

### Task 3: Correct and audit all YIU Skills

**Files:**
- Modify: `docs/evaluations/yiu-intent-skill-pack-v2-2026-06-13.md`
- Create: `scripts/skills/audit-yiu-intent-skill-pack.ts`
- Create: `scripts/skills/audit-yiu-intent-skill-pack.test.ts`
- Modify: `scripts/skills/push-yiu-intent-skill-pack.ts`

- [ ] **Step 1: Add failing regression tests for known stale Skill facts**

Parse every Skill and assert at minimum that corrected answers contain:

```ts
expect(skill('hemsirelik_ucret_kontenjan').responseText).toContain('kontenjan 2, ücret 490.000 TL')
expect(skill('anestezi_ucret_kontenjan').responseText).toContain('Ücretli: kontenjan 10')
expect(skill('ameliyathane_hizmetleri_ucret_kontenjan').responseText).toContain('Burslu: kontenjan 10')
expect(skill('ergoterapi_ebelik_ucret_kontenjan').responseText).not.toMatch(/2024 taban puanı/)
expect(skill('shmyo_diger_programlar_ucret_kontenjan').responseText).toContain('Biyomedikal Cihaz Teknolojisi: ücretli kontenjan 5')
```

- [ ] **Step 2: Export the existing Skill pack parser for audit reuse**

Export `parseIntentPack` from `push-yiu-intent-skill-pack.ts` without changing push behavior.

- [ ] **Step 3: Correct every brochure-derived Skill response**

Review all Skills, not only known failures. For every price/quota/score/rank statement:

- use the tracked brochure row exactly;
- state the applicable year naturally;
- remove values absent from the brochure;
- preserve the explicit Tıbbi Tanıtım source conflict;
- keep customer-facing prose direct and avoid `kaynakta`, `tabloda`, or retrieval mechanics.

- [ ] **Step 4: Implement the full-pack audit**

The audit must report:

- all parsed Skills and example counts;
- duplicate trigger examples across Skills;
- responses containing source-clerk language;
- price-related Skills and their brochure fact coverage;
- numeric tokens in price-related responses that cannot be reconciled with their expected brochure rows.

The script exits non-zero for source-clerk language, fewer than five examples, exact duplicate trigger conflicts, or a known brochure-fact mismatch.

- [ ] **Step 5: Run dry-run and focused tests**

Run:

```bash
npm test -- --run scripts/skills/audit-yiu-intent-skill-pack.test.ts
npx tsx scripts/skills/push-yiu-intent-skill-pack.ts --dry-run
npx tsx scripts/skills/audit-yiu-intent-skill-pack.ts
```

Expected: all checks PASS and all active intent definitions parse.

### Task 4: Support persistent isolated ingest

**Files:**
- Modify: `scripts/knowledge/rag-file-search-ingest.ts`
- Create: `scripts/knowledge/rag-file-search-ingest.test.ts`

- [ ] **Step 1: Write a failing persistent-store configuration test**

Assert:

```ts
expect(buildVectorStoreCreateParams({ persistent: true })).not.toHaveProperty('expires_after')
expect(buildVectorStoreCreateParams({ persistent: false })).toHaveProperty('expires_after')
```

- [ ] **Step 2: Add `--persistent` parsing and helper export**

Persistent ingest must create the vector store without `expires_after` and tag metadata with:

```ts
{
  qualy_purpose: 'production_candidate',
  story: manifest.story,
}
```

- [ ] **Step 3: Require complete readiness in persistent mode**

Persistent mode must reject `--allow-pending-files`, failed files, missing vector file mappings, and a source-manifest count mismatch.

- [ ] **Step 4: Run ingest tests**

Run:

```bash
npm test -- --run scripts/knowledge/rag-file-search-ingest.test.ts
```

Expected: PASS without making a live API call.

### Task 5: Build and ingest the replacement corpus

**Files:**
- Generate: `tmp/rag-evals/yiu-clean-corpus/*`

- [ ] **Step 1: Build brochure packages and clean manifest**

Run:

```bash
npm run rag:yiu-brochure:manifest
npm run rag:yiu-clean-corpus:build
```

Expected: zero exact duplicate hashes, all 8 brochure files, unique approved PDFs, no transient history/listing sources.

- [ ] **Step 2: Ingest into a new persistent store**

Run:

```bash
npm run rag:file-search:ingest -- \
  --manifest tmp/rag-evals/yiu-clean-corpus/manifest.json \
  --out tmp/rag-evals/yiu-clean-corpus \
  --persistent \
  --reuse-existing-files \
  --batch-size 50
```

Expected: completed count equals manifest file count; failed, cancelled, and in-progress are all zero; expiration is absent.

- [ ] **Step 3: Preserve the ingest report and candidate source manifest**

Record the new vector store ID, file counts, usage bytes, and generated visitor-safe source map in `tmp/rag-evals/yiu-clean-corpus/`.

### Task 6: Validate before cutover

**Files:**
- Create or update: `tmp/rag-evals/yiu-clean-corpus/smoke-cases.json`
- Generate: `tmp/rag-evals/yiu-clean-corpus/*smoke*.json`
- Generate: `tmp/rag-evals/yiu-clean-corpus/*smoke*.md`

- [ ] **Step 1: Run retrieval smoke against the candidate store**

Cover campus, Tıp duration, Turkish/English Tıp prices, Hemşirelik, Anestezi, MYO Graphic Design, quotas, scholarships, registration, contact, Tıp regulation, and unsupported information.

- [ ] **Step 2: Inspect retrieved evidence for every price case**

Every price answer must retrieve the matching brochure category file, preserve the 2025 year, and avoid stale website fee announcements.

- [ ] **Step 3: Reject cutover on any critical mismatch**

Do not change runtime configuration if any price/quota answer is numerically wrong, any stale historical source appears in the clean manifest, or the vector store is not fully ready.

### Task 7: Push corrected Skills and atomically switch runtime

**Files:**
- Modify mechanically from the successful ingest output: `src/lib/knowledge-base/provider-data/yiu-tanitim-gunleri-2026-source-manifest.json`

- [ ] **Step 1: Push corrected Skill definitions**

Run:

```bash
npx tsx scripts/skills/push-yiu-intent-skill-pack.ts
```

Verify active YIU intent Skill count and refreshed embedding rows.

- [ ] **Step 2: Check the authoritative vector-store setting**

Confirm whether deployment uses `DEMO_CHAT_FILE_SEARCH_VECTOR_STORE_ID`. If present, update that one setting during cutover; otherwise update the committed source manifest only. Do not leave conflicting active IDs.

- [ ] **Step 3: Replace the runtime source manifest from the successful candidate ingest**

The new manifest must contain the candidate vector store ID and exactly the candidate store's completed file map.

- [ ] **Step 4: Run focused tests and full build**

Run:

```bash
npm test -- --run \
  scripts/knowledge/rag-build-yiu-clean-corpus.test.ts \
  scripts/knowledge/yiu-brochure-facts.test.ts \
  scripts/knowledge/rag-build-yiu-brochure-manifest.test.ts \
  scripts/skills/audit-yiu-intent-skill-pack.test.ts \
  scripts/knowledge/rag-file-search-ingest.test.ts \
  src/lib/demo-chat/openai-file-search.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 5: Deploy/push and verify the live route**

After the runtime switch is deployed, verify returned diagnostics contain the new vector store ID and rerun the critical smoke questions through the Public Demo route.

### Task 8: Document and commit the completed cutover

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [ ] **Step 1: Record final counts and decisions**

Document old/new file counts, exclusions, corrected Skill count, candidate store ID, smoke result, rollback store ID, and the decision to retain the old store temporarily.

- [ ] **Step 2: Run final hygiene checks**

Run:

```bash
git diff --check
git status --short
```

- [ ] **Step 3: Commit and push**

Use:

```bash
git add package.json scripts src docs
git commit -m "fix(phase-3): clean YIU corpus and align brochure skills"
git push origin main
```
