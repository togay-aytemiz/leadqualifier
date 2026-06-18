# YIU Clean Corpus Atomic Switch Design

## Goal

Rebuild the active Yüksek İhtisas Üniversitesi Public Demo OpenAI corpus from verified sources, remove retrieval noise and exact duplicates, validate the replacement independently, and switch production to the new persistent vector store without an interval where the demo points at an incomplete store.

## Current State

The active OpenAI vector store contains 135 files:

- 113 approved PDFs from the institutional and Tıp Fakültesi regulation pages;
- 14 website bundles containing 1,790 crawled pages;
- 8 verified brochure Markdown files.

The audit found:

- 13 exact PDF duplicate pairs, all duplicated between the institutional and Tıp Fakültesi source pages;
- 1,319 historical announcement, event, and news pages inside the website bundles;
- 25 stable-page crawl results containing the same 86-character navigation-only body;
- stale fee, registration, and academic-calendar announcements dating back to 2018;
- two similarly named 2025 Tıp documents that are actually different directives and must both remain:
  - `Tıp Fakültesi Ölçme ve Değerlendirme Yönergesi`;
  - `Tıp Fakültesi Eğitim-Öğretim ve Sınav Uygulamaları Yönergesi`.

## Chosen Approach

Build a source-scoped replacement corpus instead of mutating the current store.

### Keep

1. All 8 verified brochure Markdown files.
2. One copy of every unique approved PDF.
3. Distinct PDFs with similar titles when their bytes or document identity differ.
4. Durable website pages under stable institutional and academic page routes.
5. A small explicit set of durable root pages needed by prospective students, including FAQ, contact, candidate-student, academic-calendar, special-conditions, OBS, and research-center information.

### Remove

1. Byte-identical PDF duplicates. Prefer the Tıp Fakültesi source-page copy when a PDF appears on both approved PDF pages because it is the narrower authoritative source for that document.
2. Historical `/haber/`, `/etkinlik/`, and `/duyuru/` pages from the default admissions corpus.
3. Paginated news, event, and announcement index pages.
4. Password/file-gateway pages, media/gallery shells, and crawl results whose body is only repeated navigation text.
5. Exact duplicate website bodies after normalization.

The filter is source-type and content-quality based. It does not add question-specific runtime routing or answer guards.

## Website File Shape

Each retained website source becomes its own Markdown file with:

- canonical title;
- source URL;
- source group;
- crawl content only.

The replacement does not reuse multi-page website bundles. Source-level files prevent unrelated pages from sharing a file boundary, improve citation titles, and make future source removal deterministic.

## Deterministic Build Outputs

Add a clean-corpus builder that emits:

1. a manifest containing every retained file and its OpenAI attributes;
2. source-level website Markdown files;
3. an audit JSON/Markdown report listing retained and excluded counts and reasons;
4. SHA-256 hashes used for exact duplicate detection;
5. a visitor-safe source manifest for runtime citation mapping.

Running the builder twice against the same input must produce the same retained source set. Generated timestamps may differ but must not affect inclusion decisions.

## Atomic Store Switch

1. Build the clean corpus locally without changing runtime configuration.
2. Create a new persistent OpenAI vector store with no expiration.
3. Upload and attach the entire clean manifest.
4. Wait until every file is completed and no file is failed or in progress.
5. Run retrieval smoke checks against the new store while production still uses the old store.
6. Generate the visitor-safe runtime manifest with the new vector store ID.
7. Run tests and the production build.
8. Commit and push the manifest switch as the single runtime cutover.
9. Verify the deployed demo reports the new vector store ID and passes smoke questions.

The old vector store remains untouched during this task as an immediate rollback target. Deleting it is a separate, explicit cleanup after production verification.

If `DEMO_CHAT_FILE_SEARCH_VECTOR_STORE_ID` is set in the deployment environment, it overrides the committed manifest. The cutover must verify this before deployment and update the single authoritative setting rather than leaving manifest and environment IDs inconsistent.

## Validation

The replacement must satisfy all of the following before cutover:

- no exact duplicate file hashes;
- no historical news, event, announcement, or paginated listing sources;
- all 8 brochure Markdown files present;
- all unique approved PDFs present;
- no failed or pending OpenAI vector-store files;
- source manifest count equals completed vector-store file count;
- retrieval smoke covers campus, program duration, fees, quotas, scholarships, registration, Tıp regulations, contact, and one unsupported question;
- high-risk smoke answers cite only files in the clean manifest.

## Rollback

Rollback consists of restoring the previous vector store ID in the same authoritative runtime setting. No re-ingest is required because the old store is retained until the replacement is accepted.

## Non-Goals

- deleting the shared Supabase Knowledge Base schema;
- deleting the old YİÜ Supabase tenant corpus;
- changing Skill definitions or Skill matching;
- adding a new answer judge, retry chain, or question-specific guard;
- deleting the previous OpenAI vector store before production verification.
