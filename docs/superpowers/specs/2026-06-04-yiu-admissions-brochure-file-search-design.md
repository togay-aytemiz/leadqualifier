# YIU Admissions File Search Demo Design

Date: 2026-06-04
Status: Production demo deployed, local implementation, follow-up acceptance, validated/model A/B benchmarks, isolated preview org/demo setup, Knowledge Base seeding, preview-only File Search route bridge, 20-question validated preview smoke, production-link 5-question smoke, and demo university icon binding completed; model-aware billing, DB-backed provider-config generalization, and customer signoff remain

## Implementation Tracker

Use this section as the live checklist for the brochure File Search work. Update it after each completed implementation slice so the spec stays aligned with the current code.

### Phase 0: Planning and Tracking

- [x] Add this implementation tracker to the spec.
- [x] Create the implementation plan for PDF-independent infrastructure work.

### Phase 1: PDF-Independent Infrastructure

- [x] Add brochure vector-store readiness and citation-manifest validation helpers.
- [x] Wire approved citation mapping into the local eval runner so visitor-safe sources are used consistently.
- [x] Extend File Search ingest output with readiness metadata, source manifest rows, vector-store usage size, and lifecycle/expiration details.
- [x] Add brochure provider profile/config types without changing the platform-wide default provider.
- [ ] Add disabled-by-default demo/provider config seed notes for `yiu-tanitim-gunleri-2026`.

### Phase 1.5: Approved Pre-Brochure Corpus

- [x] Review OpenAI File Search best-practice docs for supported formats, vector stores, metadata attributes, and batch ingestion limits.
- [x] Package the existing YIU website non-PDF crawl into source-indexed markdown bundles instead of uploading 1790 individual website files.
- [x] Download and include the 113 PDFs from the two user-approved YIU mevzuat/yönergeler links.
- [x] Generate the compact `yiu-approved-corpus-pre-brochure` manifest: 14 website packages plus 113 approved PDFs, 127 files total.
- [x] Ingest the compact pre-brochure corpus into OpenAI File Search with per-file attributes.
- [x] Record the successful local vector store: `vs_6a20bc28099081918fed4bfef3569c02`, status `completed`, file counts `127/127`, usage `13080355` bytes.
- [x] Add ingest retry/timeout handling and an early state file so transient File Search indexing delays do not hang local runs indefinitely.
- [x] Receive the customer brochure PDF and audit its extractability before ingest.
- [x] Render the brochure pages and create a verified markdown extraction for table-critical File Search ingestion.
- [x] Add the verified brochure markdown to the same approved-corpus path as categorized File Search source files.

### Phase 2: After Brochure PDF Arrives

- [x] Identify brochure source quality issues before vector-store ingest.
- [x] Record the verified brochure extraction artifact: `tmp/rag-evals/yiu-brochure/yiu-admissions-brochure-verified.md`.
- [x] Re-check the verified brochure markdown against rendered pages and fix second-pass source wording issues.
- [x] Resolve or explicitly mark the `Tıbbi Tanıtım ve Pazarlama (Burslu)` price inconsistency before customer-facing preview.
- [x] Ingest the verified brochure markdown on top of the pre-brochure approved corpus.
- [x] Smoke-test File Search retrieval against the ingested brochure vector store.
- [x] Build a 50-question realistic full-corpus benchmark covering website packages, approved PDFs, brochure tables, campus/contact, and unsupported admissions scenarios.
- [x] Run raw OpenAI File Search over the approved full corpus and produce JSON/Markdown reports with answers, sources, latency, usage, credits, and refusal checks.
- [x] Run validated OpenAI File Search over the same 50-question full corpus.
- [x] Run a brochure-focused validated retry with higher File Search result count to test whether brochure failures are retrieval-depth issues.
- [ ] Build the brochure-specific benchmark from the customer question list.
- [ ] Run current baseline, raw File Search, validated File Search, and validated File Search with targeted retry.
- [x] Add brochure/table-specific retrieval filtering and evidence validation before customer preview.
- [x] Add explicit, evaluated admissions follow-up generation because the earlier validated run produced no follow-up questions.
- [x] Produce Markdown/JSON reports with answers, sources, latency, usage, credits, refusal correctness, and follow-up quality.
- [ ] Review report with the customer and record signoff/corrections before preview.

### Phase 2.5: Brochure-First Accuracy Hardening

- [x] Approve the brochure-first hybrid architecture and exclude a GPT-5.5 quality-ceiling run from scope.
- [x] Add deterministic query intent classification and File Search `source_group` filters.
- [x] Parse verified brochure table rows into typed facts for price, quota, success-rank, and base-score validation.
- [x] Require critical brochure values to come from one matching table row.
- [x] Add targeted retry with narrowed source filters and field-specific query shaping.
- [x] Replace the optional in-answer engagement attempt with a separate validated follow-up stage.
- [x] Separate benchmark answer correctness from preferred-source correctness and follow-up quality.
- [x] Run the same benchmark with the current model pair and `gpt-5.4-mini`; do not run GPT-5.5.

### Phase 3: Preview Gate

- [x] Create or configure the isolated preview organization.
- [x] Create or configure the `yiu-tanitim-gunleri-2026` demo slug.
- [x] Seed the approved corpus into the preview org Knowledge Base for operator visibility.
- [x] Enable the validated OpenAI File Search provider only for the configured demo slug through a preview route bridge.
- [x] Raise grounded follow-up coverage from `21/46` to `46/46` eligible benchmark cases without weakening refusal/source-only suppression.
- [x] Build a 20-question customer-preview smoke case file across brochure, website HTML, approved PDFs, and unsupported guardrails.
- [x] Run the 20-question validated File Search smoke after preview route/provider hardening and record report output.
- [x] Deploy the `yiu-tanitim-gunleri-2026` demo to production and run a production-link smoke.
- [x] Bind the Yüksek İhtisas Üniversitesi icon to the customer-preview demo channel.
- [ ] Replace preview slug/env gating with durable DB-backed provider config before reusing File Search for more tenants.
- [ ] Add provider-stage model-aware usage and actual-cost metering before customer billing or an optional `gpt-5.4-mini` retrieval rollout.
- [ ] Keep the existing `yiu-qualy-ai-demo` unchanged unless the user explicitly approves a switch.

## Problem

The previous YIU demo tried to answer from a broad university corpus that mixed website pages, regulations, and many PDFs. That made retrieval harder to control and produced answers that the customer-side IT reviewer did not trust.

The new customer-facing opportunity is narrower: a 2026 admissions / tanitim gunleri bot that answers from an approved admissions corpus. The local pre-brochure corpus now includes the existing YIU website crawl without PDFs packaged into markdown bundles plus the two user-approved PDF source pages. The customer brochure PDF has arrived, but its text layer is not reliable enough for raw-only File Search ingestion, so a verified markdown extraction is the primary brochure source. The system must be strong specifically at File Search-backed admissions answers, safe on out-of-scope questions, and isolated from the current public demo until it is reviewed.

## Goals

- Build an approved-corpus provider profile that can accept the brochure PDF as soon as the customer sends it.
- Use OpenAI File Search plus Qualy validation as the primary retrieval/answer path for this demo. The existing Supabase RAG path may be used only as a benchmark baseline, not as the demo provider.
- Keep optional Skills/FAQ entries available for deterministic high-value questions, without making Skills the main RAG replacement.
- Isolate the customer-facing demo with a new Qualy organization, new demo slug, and new vector store before preview.
- Keep the current YIU public demo and its current provider untouched.
- Produce repeatable benchmark reports with questions, model answers, sources, correctness, refusal behavior, latency, and estimated cost.
- Make the bot conversion-focused for admissions season: after answering, it should often suggest one useful next step that can move the visitor toward attending tanitim gunleri, learning about a relevant program, contacting the university, or sharing interest for follow-up.
- Support a later agentic backbone by keeping the provider boundary close to `retrieve -> evidence_pack -> answer -> validate -> source_append`.

## Non-Goals

- Do not ingest broad university content outside the approved admissions corpus. Website content is allowed only through the already crawled non-PDF pages packaged into source-indexed markdown bundles; PDFs are limited to the two user-approved YIU mevzuat/yönergeler links plus the customer brochure and any explicitly approved contact/link sheet.
- Do not switch the existing `yiu-qualy-ai-demo` slug to File Search.
- Do not deploy to production or change production defaults without explicit user approval.
- Do not create a separate OpenAI API key for this step; reuse the existing project key unless cost/accounting requirements change.
- Do not implement the full agent backbone in this iteration.
- Do not build website-embed chatbot integration in this phase. A website widget or embedded chatbot can be a later phase after brochure Q&A quality is proven.

## Demo Isolation

Use a new Qualy organization when the demo moves beyond local benchmark into a customer-visible preview:

- Organization: `YIU Tanitim Gunleri 2026`
- Demo slug: `yiu-tanitim-gunleri-2026`
- Display name: `Yuksek Ihtisas Universitesi Tanitim Gunleri 2026`
- Provider profile: `brochure_file_search_validated`
- Corpus/story id: `yiu-tanitim-gunleri-2026`
- OpenAI vector store name: `qualy-yiu-tanitim-gunleri-2026`

Local pre-brochure benchmark corpus:

- Story id: `yiu-approved-corpus-pre-brochure`
- Manifest: `tmp/rag-evals/yiu-approved-corpus/manifest.json`
- Website package directory: `tmp/rag-evals/yiu-approved-corpus/website-packages`
- Successful local vector store: `vs_6a20bc28099081918fed4bfef3569c02`
- Successful local batch id: `vsfb_ibj_6a20bc31250881f4a44bf235028ba594`
- File counts: 14 website markdown packages, 113 approved PDFs, 127 total files, 127 completed, 0 failed.
- Usage size: `13080355` bytes.

Local approved corpus with brochure:

- Story id: `yiu-tanitim-gunleri-2026-approved-corpus`
- Manifest: `tmp/rag-evals/yiu-approved-corpus/manifest-with-brochure.json`
- Verified brochure source: `tmp/rag-evals/yiu-brochure/yiu-admissions-brochure-verified.md`
- Categorized brochure package directory: `tmp/rag-evals/yiu-approved-corpus/brochure-packages`
- Successful local vector store: `vs_6a213186dd6c81919ec51dca2a9913d5`
- Successful local batch ids: `vsfb_ibj_6a2131931da081f4926721911c380352`, `vsfb_ibj_6a2131fa1fb481f4b7d87c353bf66069`, `vsfb_ibj_6a213216091481f49bd3214c38a96b31`
- File counts: 14 website markdown packages, 113 approved PDFs, 8 categorized brochure markdown files, 135 total files, 135 completed, 0 failed, 0 in-progress.
- Usage size: `13120263` bytes.
- Ingest output: `tmp/rag-evals/yiu-approved-corpus/file-search-ingest-yiu-tanitim-gunleri-2026-approved-corpus-2026-06-04T08-04-21-588Z.json`
- Readiness helper result: `ready: true`, no failures, no warnings.
- Smoke test: `Tıp Fakültesi (Ücretli)` returned 2025 kontenjan `75` and 2025 fiyat `720.000 TL` from File Search in `8932ms`.
- Full-corpus raw File Search benchmark case file: `tmp/rag-evals/yiu-approved-corpus/realistic-50-cases.json`.
- Full-corpus raw File Search report: `tmp/rag-evals/yiu-approved-corpus/rag-eval-file-search-2026-06-04T08-36-43-834Z.md`.
- Full-corpus raw File Search JSON: `tmp/rag-evals/yiu-approved-corpus/rag-eval-file-search-2026-06-04T08-36-43-834Z.json`.
- Full-corpus raw File Search result: `36/50` provider-results passed, average latency `6745.3ms`, p50 `6167ms`, p75 `7683ms`, p95 `10482ms`, max `22298ms`, total estimated credits `126.8000`, average estimated credits `2.5360`.
- Benchmark observation: brochure scholarship questions were strong (`6/6`) and PDF regulation-routing was promising (`12/14`), but raw File Search still needs validation/source selection because it sometimes mixes old website context into brochure answers, misses package-level website/contact sources, omits or misreads table values, and adds unsupported adjacent details.
- Full-corpus validated File Search report: `tmp/rag-evals/yiu-approved-corpus/rag-eval-file-search-validated-2026-06-04T08-48-23-251Z.md`.
- Full-corpus validated File Search JSON: `tmp/rag-evals/yiu-approved-corpus/rag-eval-file-search-validated-2026-06-04T08-48-23-251Z.json`.
- Full-corpus validated File Search result: `28/50` provider-results passed, average latency `10566.8ms`, p50 `8915ms`, p75 `11118ms`, p95 `14317ms`, max `52244ms`, total estimated credits `154.3000`, average estimated credits `3.0860`.
- Validated benchmark observation: unsupported guardrails improved, including the "kesin kontenjan ayırır mısınız?" scenario, but supported PDF routing fell from raw `12/14` to validated `6/14` because the evidence-pack path sometimes refuses after successful retrieval. Brochure program-fee answers were `11/17`, and several failures are unacceptable for a sales/admissions demo because they involve prices, quotas, success ranks, or the Tıp hazırlık fee.
- Follow-up observation: the validated 50-question run produced `0/50` follow-up questions. The current engagement prompt is insufficient for the tanıtım günleri conversion goal and must be evaluated as a separate acceptance gate.
- Brochure-focused validated report with `max_results=20`: `tmp/rag-evals/yiu-approved-corpus/rag-eval-file-search-validated-2026-06-04T08-58-29-911Z.md`.
- Brochure-focused validated JSON with `max_results=20`: `tmp/rag-evals/yiu-approved-corpus/rag-eval-file-search-validated-2026-06-04T08-58-29-911Z.json`.
- Brochure-focused validated `max_results=20` result: `20/30` provider-results passed, average latency `10663.5ms`, p50 `9642ms`, p75 `11673ms`, p95 `14309ms`, max `24655ms`, total estimated credits `172.0000`, average estimated credits `5.7333`. Higher retrieval depth helped scholarships and some campus/program mapping questions, but it did not make brochure fee-table answers reliable and increased per-question cost substantially.

Final brochure-first hardening benchmark:

- The validated provider now combines filtered File Search with typed same-row brochure facts, approved structured source facts, document-title routing, one narrowed targeted retry, safe deterministic guardrails, independently scored source expectations, and a separate validated follow-up stage.
- Current control report: `tmp/rag-evals/yiu-approved-corpus/rag-eval-file-search-validated-2026-06-04T10-26-02-388Z.md`. Models: File Search `gpt-4.1-mini`, answer `gpt-4o-mini`. Result: `50/50`, `21/46` eligible follow-ups, 1 retry, average latency `5590.4ms`, p50 `4771ms`, p95 `10358ms`, max `22329ms`, internal estimated credits `87.8000`.
- Retrieval-model A/B report: `tmp/rag-evals/yiu-approved-corpus/rag-eval-file-search-validated-2026-06-04T10-30-52-146Z.md`. Models: File Search `gpt-5.4-mini`, answer `gpt-4o-mini`. Result: `50/50`, `21/46` eligible follow-ups, 1 retry, average latency `4018.5ms`, p50 `3900ms`, p95 `7017ms`, max `11160ms`, internal estimated credits `98.7000`. This is about 28% lower average latency and 32% lower p95 than the control, but it is not the default until model-aware actual-cost metering exists.
- Answer-model A/B report: `tmp/rag-evals/yiu-approved-corpus/rag-eval-file-search-validated-2026-06-04T10-34-22-759Z.md`. Models: File Search `gpt-4.1-mini`, answer `gpt-5.4-mini`. Result: `50/50`, `21/46` eligible follow-ups, 0 retries, average latency `5458.3ms`, p50 `5399ms`, p95 `9684ms`, max `11518ms`, internal estimated credits `82.9000`. It did not improve benchmark quality enough to justify changing the answer-model default.
- The project credit estimator is model-agnostic for chat tokens, so the benchmark credit totals are useful for internal token-consumption comparison but are not actual OpenAI dollar-cost estimates. Provider-stage model-aware metering is required before customer billing decisions.
- Recommended default remains File Search `gpt-4.1-mini` plus answer `gpt-4o-mini`. `gpt-5.4-mini` retrieval is an optional low-latency profile to reconsider after model-aware cost metering. GPT-5.5 was intentionally not run.
- Before generic fallback, factual correctness, source/refusal safety, and brochure-critical table handling passed the local 50-question set, while follow-up coverage had improved from `0/50` to `21/46` eligible cases.
- Generic engagement fallback report after follow-up hardening: `tmp/rag-evals/yiu-approved-corpus/rag-eval-file-search-validated-2026-06-04T12-21-11-297Z.md`. Models: File Search `gpt-4.1-mini`, answer `gpt-4o-mini`. Result: `50/50`, `46/46` eligible follow-ups, 0 retries, average latency `5282.5ms`, p50 `5033ms`, p95 `8894ms`, max `12657ms`, internal estimated credits `81.7000`. Refusal cases still produced no follow-up.
- The final follow-up policy is `specific evidence-supported follow-up > generic engagement fallback > no follow-up`. Generic fallback is domain-independent and must not mention program, fee, scholarship, appointment, quota, discount, or any other source-specific fact.

Customer-preview smoke after org/provider bridge:

- Smoke case file: `tmp/rag-evals/yiu-approved-corpus/smoke-20-file-search-cases.json`.
- Smoke report: `tmp/rag-evals/yiu-approved-corpus/rag-eval-file-search-validated-2026-06-04T14-40-11-779Z.md`.
- Smoke JSON: `tmp/rag-evals/yiu-approved-corpus/rag-eval-file-search-validated-2026-06-04T14-40-11-779Z.json`.
- Scope: 8 brochure-critical fee/scholarship/link questions, 4 website HTML/contact/bilgi-paketi questions, 5 approved PDF regulation-router questions, and 3 unsupported admissions/guardrail questions.
- Result: `20/20`, follow-ups `20/20`, `13` distinct follow-up lines, average latency `6992.2ms`, p95 `25119ms`, max `30863ms`.
- Hardening added from smoke findings: website contact questions no longer let student-affairs evidence answer rectorate/Tıp contact requests, website bilgi-paketi questions get an exact second retrieval when the first general evidence misses key program names, student-affairs phone lines with extension suffixes are canonicalized, and fallback follow-ups vary by safe intent instead of repeating one generic line.
- Production URL: `https://app.askqualy.com/demo/yiu-tanitim-gunleri-2026`.
- Production Netlify deploy: `6a21d9edb77d4ce04fbb1571`.
- Production-link smoke: `5/5` across brochure fee, scholarship, student-affairs contact, BİDB routing, and unsupported appointment-promise refusal.

Local benchmark work can run without creating the organization. The organization is required before a Netlify preview or customer-accessible demo so conversations, usage metadata, bot settings, and later billing records are cleanly separated from the old demo.

## Preview Setup Snapshot

- Preview organization id: `50102447-4bb2-4bd5-a332-fb721a3c7949`
- Preview organization name/slug: `YİÜ Tanıtım Test` / `yiu-tanitim-test`
- Preview demo slug: `yiu-tanitim-gunleri-2026`
- Demo logo: `/yuksek-ihtisas-universitesi.png` from the `demo_chat_channels.logo_url` field.
- Billing state: `premium_active`, `10000` monthly package credits, 0 used, no top-up carryover.
- Demo maintenance: disabled for `yiu-tanitim-gunleri-2026`; the channel has a server-side shared secret for browser access-token minting and now counts as the onboarding/customer-entry connection signal for demo-only orgs.
- Bot mode: the YİÜ Tanıtım Test org is marked `bot_mode='active'`, `bot_mode_unlock_required=false`, and has `channel_connection_completed_at` recorded so demo conversations can be reviewed from Inbox without connecting a live WhatsApp/Instagram/Telegram provider.
- Knowledge Base seed: collection `YİÜ Tanıtım Günleri 2026 - Approved Corpus`, `135` documents (`113` PDFs, `22` article/markdown records), `879` chunks.
- Route bridge: Public Demo Chat polling tries validated OpenAI File Search for the preview demo slug before falling back to the standard Supabase RAG/shared pipeline.
- Deployable source manifest: `src/lib/knowledge-base/provider-data/yiu-tanitim-gunleri-2026-source-manifest.json`.
- Important limitation: this is preview slug/env gating, not the final durable provider-config table. DB-backed provider configuration remains required before making File Search a reusable customer setting.

## Provider Configuration Strategy

OpenAI File Search must not become the platform-wide default just because this demo uses it. Provider selection should be stored as explicit database configuration and resolved in this order:

1. Demo-channel override, when the active `demo_chat_channels.slug` has a provider profile.
2. Organization-level knowledge provider setting, when the organization has opted into a provider.
3. Global product fallback: current Supabase RAG.

For this demo:

- Global default remains `supabase_rag`.
- Normal newly created organizations remain on `supabase_rag` unless explicitly configured otherwise.
- The YIU tanitim gunleri organization/demo gets `brochure_file_search_validated`.
- The existing `yiu-qualy-ai-demo` stays unchanged.

Provider technical configuration should not be mixed into the editable AI behavior prompt. It should live in a dedicated provider config layer, with fields conceptually equivalent to:

```text
scope: organization | demo_chat_channel
organization_id
demo_chat_channel_id optional
provider_profile: supabase_rag | openai_file_search_validated | brochure_file_search_validated
config:
  vector_store_id
  corpus_scope
  source_display_mode
  max_retry_count
  enabled
```

The first implementation can seed this config through SQL/admin tooling rather than a full tenant-facing UI. Later, Admin can expose safe provider toggles once File Search quality is proven across more customers.

## Source Scope

The admissions bot may answer only from the approved corpus:

1. The existing YIU website crawl excluding PDFs, packaged into source-indexed markdown bundles.
2. The PDFs from the two user-approved YIU source pages:
   - `https://yuksekihtisasuniversitesi.edu.tr/sayfa/kurumsal/kurumsal-bilgiler/mevzuat`
   - `https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi/mevzuatlar/yonergeler`
3. The customer-provided brochure content, primarily through the verified markdown extraction because the PDF text layer is effectively unusable for table search.
4. The customer-provided expected question list and approved answer terms.
5. An optional approved contact/link sheet if the brochure does not contain all customer-approved contact details.

The bot must not use live broad web search, unapproved TMP PDFs, unrelated old corpora, or model memory for facts. Questions outside these sources must receive a safe no-clear-information reply.

Website package source trade-off:

- The 1790 non-PDF website pages are packaged into 14 markdown files to keep File Search operations manageable while preserving page-level source URLs inside each package's Source Index.
- PDF files stay one file per approved PDF because the PDF itself is the visitor-safe source.
- The brochure is an exception: the raw PDF can remain a visitor-safe original source, but File Search should use the verified markdown as the primary retrievable source for tables, fees, quotas, locations, and contact details.
- Website package citations are package-level by default; the Source Index inside the package preserves page URLs for diagnostics and future UI/source-display refinement.
- Per-file vector-store attributes include `story`, `label`, `basename`, `content_type`, `source_group`, and `source_url` where a single source URL exists.

## Ingestion and Vector Store Readiness

Uploading files is not enough to make the demo ready. Before any benchmark or customer-visible preview uses the approved-corpus provider, the ingestion step must pass a readiness gate:

- The OpenAI vector store status is `completed`.
- Expected file count matches the approved corpus manifest.
- Failed, cancelled, or still-processing file counts are zero.
- Each uploaded file has a stable manifest row with `file_id`, filename, approved title, source type, source URL or display label, and optional page/section hints.
- The vector store id is stored only in provider configuration, not in editable AI behavior prompts.
- The vector store usage size is recorded for cost tracking.
- The vector store lifecycle is explicit: local/spike stores may use short expiration or manual cleanup; customer-preview stores must not expire unexpectedly during the review window.

If any readiness check fails, the provider must stay disabled for the demo slug and the benchmark should report ingestion failure instead of running partial tests.

## Provider Behavior

The approved-corpus provider wraps OpenAI File Search in Qualy's validation pipeline:

1. `retrieve`: run File Search against the configured approved-corpus vector store only.
2. `evidence_pack`: map File Search results and citations into Qualy `RagChunk`/Evidence Pack structures.
3. `answer`: generate a concise answer from selected evidence.
4. `validate`: verify critical values such as dates, prices, phone numbers, e-mails, URLs, program names, and locations against evidence quotes.
5. `targeted_retry`: retry with a narrowed query when the first pass cannot answer or cites weak evidence for a supported-looking question.
6. `source_append`: append only sources from selected/supporting citations.

If validation fails after retry, the provider must refuse instead of inventing or using generic institution data.

## Brochure-First Accuracy Architecture

OpenAI File Search remains the primary provider. The accuracy layer does not replace File Search with a hard-coded FAQ bot; it narrows retrieval and adds typed validation only where free-form retrieval is unsafe.

The approved flow is:

```text
question
  -> intent_and_scope_router
  -> filtered_file_search
  -> typed_brochure_row_lookup when applicable
  -> intent_specific_validation
  -> targeted_retry when validation fails
  -> grounded_answer
  -> validated_follow_up
  -> source_append
```

Intent and source scopes:

- `brochure_table_fact`: prices, quotas, success ranks, base scores, point types, and program codes. Search brochure program/fee source groups first and validate from one matching table row.
- `brochure_scholarship`: brochure scholarship and double-major content.
- `brochure_campus_contact`: brochure campus, program-campus mapping, and brochure contact content.
- `brochure_overview`: brochure-backed institution history and overview questions.
- `document_router`: regulations and directives; allow an exact cited document title/filename to answer routing questions without forcing the generic evidence-pack contract.
- `website_admissions`: approved website faculty, school, and admissions-scope questions.
- `website_contact`: approved website contact questions with local-block contact validation.
- `unsupported_guardrail`: guarantees, unsupported future fees/quotas, and other unsafe promises that should refuse before retrieval.
- `general_approved_corpus`: approved website and PDF content when no narrower intent applies.

Critical table rules:

- A table answer must identify one row by program plus requested variant such as `Burslu`, `Ücretli`, `%50`, `İngilizce`, or `Hazırlık`.
- Values for price, quota, success rank, base score, point type, and program code must be copied from that same row.
- A value from one column must never satisfy another column. For example, quota `7` cannot be returned as success rank.
- A `-` value means the brochure does not state a value for that field; it must not be converted into zero or an invented explanation.
- The known `Tıbbi Tanıtım ve Pazarlama (Burslu)` source inconsistency remains explicitly qualified.

Targeted retry rules:

- Retry at most once by default.
- Retry only when the question looks supported but the first pass lacks the requested typed field, returns conflicting values, or fails intent-specific validation.
- Use a narrower `source_group` filter and a query containing the detected program, variant, and requested field.
- Do not increase the global result count as the primary retry strategy; the `max_results=20` benchmark increased cost without making table answers reliable.
- If the narrowed retry still lacks support, refuse safely.

Validation is intent-specific:

- Table facts use exact same-row validation.
- Contacts require the requested unit/campus and contact value from the same local evidence block.
- Document routing accepts an exact matching approved document title or filename citation.
- General explanatory answers allow natural paraphrases while still rejecting unsupported critical values.
- Stable approved source facts may be extracted into typed records only when they retain an approved source citation and pass evidence-specific parsing tests; they are not uncited hard-coded answers.

## Model Experiment Scope

- Keep the current benchmark pair as the control: `gpt-4.1-mini` for File Search and `gpt-4o-mini` for grounded answer generation.
- The current control remains the recommended default after all three final runs passed `50/50`.
- `gpt-5.4-mini` File Search is an optional low-latency profile after model-aware actual-cost metering; the measured run was about 28% faster on average.
- `gpt-5.4-mini` grounded-answer generation did not improve measured quality enough to justify changing the default.
- `gpt-5.4-nano` may be evaluated later for deterministic routing/classification only; it is not the primary answer model for critical brochure facts in this phase.
- Do not run GPT-5.5 for a quality-ceiling benchmark in this phase.
- Change one model stage at a time so retrieval, answer-generation, latency, and cost effects remain attributable.

## Validated Follow-Up Stage

Follow-up generation runs only after the factual answer passes validation. It is not an optional field inside the factual answer generation contract.

The follow-up stage:

1. Builds candidates from the validated answer intent and retrieved evidence.
2. Rejects candidates that introduce unsupported facts, guarantees, discounts, appointments, or personal-data pressure.
3. Selects at most one short, role-neutral, conversion-friendly question.
4. Falls back to one generic, domain-independent engagement question when a supported answer has no safe specific follow-up.
5. Adds no follow-up when the answer is a refusal, the user asks only for a source/link, or the user sends a stop/no-interest signal.

For brochure table answers, preferred candidates offer an evidence-supported comparison such as another fee variant, scholarship detail, or relevant campus. If that is unavailable, a generic fallback such as `Bu konuda başka merak ettiğiniz bir nokta var mı?` is allowed. Follow-up quality is evaluated separately from factual answer and source correctness.

## Source Display Contract

Customer-facing source behavior should stay compatible with the current demo expectation:

- The answer body comes first.
- Sources are appended after the answer, not mixed into the prose.
- Source links come only from File Search citations that survive Qualy validation and selected-evidence checks.
- If the answer uses one source, append one source link. If the answer truly combines multiple sources, append the minimal supporting source list.
- If File Search retrieves a source but validation does not support the final answer, do not show that source.
- Do not expose OpenAI file ids, vector store ids, internal chunk ids, or provider diagnostics to the visitor.
- Persist diagnostics and usage metadata separately for operator/admin review.

## Citation Mapping Manifest

File Search citations must be translated into Qualy visitor-safe sources before display. The visitor should never see raw OpenAI file ids, vector store ids, or internal citation objects.

Maintain a source manifest for the approved admissions corpus:

```text
corpus_scope
openai_file_id
filename
approved_source_title
approved_source_url optional
display_label
page_label optional
content_type: website_package | approved_pdf | brochure_pdf | approved_contact_sheet | approved_question_sheet
customer_approved: true | false
```

Source append must use this manifest to map selected citations into the current public-demo source format. If a citation cannot be mapped to an approved source row, it can be used internally for validation only after review, but it must not be shown to the visitor.

## Targeted Retry Rules

The first implementation should support intent-driven retry query shaping:

- Date/time questions add `tanitim gunleri`, `tarih`, `saat`, and `program`.
- Program/department questions add `bolum`, `program`, `fakulte`, and the detected subject terms.
- Application/admissions questions add `basvuru`, `aday ogrenci`, `kayit`, and `tercih`.
- Contact questions add `iletisim`, `telefon`, `e-posta`, `web`, and reject generic footer contacts unless the question is institution-wide.
- Price/fee/scholarship questions add `ucret`, `burs`, `indirim`, `kontenjan`, and refuse if the brochure does not support the value.
- Source-link questions retry for the exact title/page/source anchor before giving a link.

Retry is bounded to one extra File Search pass per question in the first version. This protects latency and cost while addressing the supported-answer misses seen in the File Search spike.

## Answer Policy

The tone should be warm and helpful, like an admissions-day assistant, but facts must remain strict:

- Answer in the user's language, Turkish by default for Turkish questions.
- Prefer short, direct answers.
- Do not mention internal provider names, vector stores, or validation.
- Do not include raw source URLs inside the answer body; append sources after the answer through the source appender.
- Do not invent phone numbers, e-mails, dates, fees, links, or program details.
- If the brochure does not contain the answer, say the information is not clear in the brochure and offer a handoff/contact path only when an approved contact source exists.
- Avoid generic closing tails unless they are useful and grounded.

## AI Settings Prompt Policy

Conversion behavior should be configurable through the existing organization AI settings, not hard-coded into the provider. The current product already has structured fields that compile into the runtime prompt:

- `assistant_role`
- `assistant_intake_rule`
- `assistant_never_do`
- `assistant_other_instructions`

For the YIU tanitim gunleri organization, seed those fields with admissions-specific instructions such as:

- `assistant_role`: act as a warm YIU tanitim gunleri/admissions assistant that answers brochure-backed questions and guides visitors to useful next steps.
- `assistant_never_do`: do not create sales pressure, do not force personal data, do not invent guaranteed admission, discounts, quotas, appointments, dates, fees, phone numbers, e-mails, or links.
- `assistant_intake_rule`: if useful, ask at most one light optional interest question, such as which program area the visitor is considering; do not turn the conversation into a form.
- `assistant_other_instructions`: after a supported answer, add one contextual next-step follow-up when helpful, such as checking event details, exploring a related program, using an approved contact route, or understanding the next application/preference step.

The provider should load `getOrgAiSettings(...)` and pass the compiled prompt into File Search answer generation/polish. This keeps future changes editable from Settings > AI or admin tooling. The preview bridge now passes org AI settings into the validated File Search answer-generation step; deterministic brochure/table/source facts still remain code-validated and do not become prompt-overridable.

Hard safety remains code-level and not user-overridable:

- File Search must answer only from selected brochure evidence.
- Critical values must pass validation against evidence quotes.
- Sources must come only from selected/supporting citations.
- Unsupported questions must refuse safely even if editable instructions ask for a warmer or more sales-oriented style.

## Conversion-Focused Follow-Up Policy

Because this is a tanitim gunleri bot, the assistant should not only answer facts; it should help the visitor take the next meaningful admissions step. Follow-ups are part of the product value proposition: the university can answer candidate questions while increasing qualified interest, event attendance, contact intent, or appointment-style next actions.

Follow-ups must be:

- Contextual to the user's question and the brochure evidence.
- Helpful rather than pushy.
- Short enough to feel natural in chat.
- Grounded when they mention a date, program, contact channel, location, registration path, or appointment option.
- Suppressed when the answer is a safe no-clear-information refusal and no approved handoff/contact path exists.
- Avoided when the user asks only for a source/link or gives a stop/no-interest signal.
- Generic when no source-specific next step is safe; generic fallback must be reusable across organizations and avoid domain-specific claims.

Preferred follow-up types:

- Program exploration: offer to compare or explain related departments/programs only when the brochure supports those options.
- Event attendance: invite the visitor to check tanitim gunleri date, location, schedule, or what to prepare when those facts are supported.
- Contact/handoff: offer the approved contact route when the user asks for details beyond the brochure.
- Lead/interest capture: ask one light, optional question such as which program area they are interested in, but do not pressure for personal data.
- Application next step: offer to explain the brochure-supported application/registration/preference step.

Avoid:

- Generic closers such as `Baska bir konuda yardimci olabilir miyim?` after every answer.
- Role assumptions such as assuming the visitor is already a student, parent, or applicant unless they say so.
- Unsupported sales claims such as guaranteed admission, discounts, quotas, or appointments.
- Multi-question follow-ups that feel like a form.

## Skills / FAQ Role

Skills can be added after the PDF and question list arrive, but only for high-confidence deterministic questions such as:

- The main tanitim gunleri date/time/location.
- The approved primary contact channel.
- Repeated greeting/scope questions.
- A handoff message when the brochure cannot answer.

Skills should not bypass File Search for long-tail brochure questions. They are a complement for predictable high-value turns, not the primary knowledge system.

Skill answers are exact operator-authored templates:

- Do not send matched Skill answers through polish.
- Do not rewrite Skill answers with AI behavior settings.
- Do not append automatic conversion follow-ups to Skill answers.
- Do not alter wording except for platform-required outbound formatting and the app-owned disclaimer rules already used by channels.

If a Skill needs a softer tone, better conversion wording, or a different handoff phrase, the operator should edit the Skill text itself.

## Evaluation Plan

Create a brochure-specific benchmark set as soon as the customer sends the PDF and questions:

- Supported cases from the customer question list.
- Supported paraphrases written in realistic student/parent language.
- Unsupported cases that ask for details not present in the brochure.
- Critical-value cases for dates, phone/e-mail, links, prices, scholarships, locations, and program names.
- Source-link cases that ask where the information comes from.
- Conversion follow-up cases that judge whether the assistant suggests a relevant next step without inventing unsupported facts or pressuring the visitor.

Each run must produce a Markdown/JSON report containing:

- Question.
- Provider answer.
- Source titles/URLs.
- Answer correctness.
- Source correctness.
- Refusal correctness.
- Hallucination/safety flag.
- Latency.
- Token usage and estimated Qualy credits.

Compare at least:

- Current Supabase RAG, if the brochure is also imported there for baseline.
- Raw OpenAI File Search.
- Validated OpenAI File Search.
- Validated OpenAI File Search with targeted retry.

## Customer Review and Signoff Loop

After the first benchmark report, run a customer review loop before customer-visible preview:

- Share the question list, answers, source titles/links, refusal cases, and follow-up examples in a reviewable report.
- Mark each answer as `approved`, `needs correction`, or `unsupported should refuse`.
- Convert customer corrections into explicit expected answer terms or approved source rows; do not patch behavior through hidden prompt wording.
- Confirm whether the approved contact/link sheet is allowed when the brochure is incomplete.
- Freeze the preview corpus manifest after approval so the customer tests the same source set that passed the benchmark.

Customer signoff is required before enabling the demo slug for external review. If the customer later changes the PDF, contact sheet, or expected answers, rerun ingestion readiness and the benchmark before preview.

## Acceptance Criteria

Before customer preview:

- Ingestion readiness passes: vector store is completed, file counts match the approved manifest, failed/cancelled/in-progress counts are zero, and source mapping is complete.
- Supported brochure questions pass at least 90%.
- Unsupported/out-of-scope questions refuse safely at 100%.
- Critical contact/date/link/fee values are never invented.
- Sources are appended only when they support the answer and should look consistent with the current public demo's source-link pattern.
- Visitor-visible sources resolve through the approved citation mapping manifest.
- At least 80% of supported informational answers include a useful, context-specific follow-up unless the question type should suppress follow-up.
- Generic domain-independent engagement follow-ups may satisfy the coverage target when no safe specific follow-up exists.
- Follow-ups must not introduce unsupported facts, generic sales pressure, or personal-data pressure.
- Matched Skill answers remain exact operator-authored text and are not polished or extended.
- Average latency is recorded and reviewed against demo tolerance.
- Provider-stage model-aware actual cost is recorded before customer billing or enabling a higher-cost optional model profile.
- Customer review signoff is recorded for the benchmark report and approved corpus.
- The current public YIU demo remains unchanged.

Before production or real customer routing:

- The provider is behind an explicit organization/demo/provider profile gate.
- Usage rows include metadata for organization, demo slug, provider profile, and vector store.
- The user explicitly approves the deploy target and provider switch.

## Locked Decisions

- Local benchmarks can run without creating the new Qualy organization.
- Customer-visible preview uses a new Qualy organization plus a new demo slug.
- OpenAI API access reuses the existing project key for this spike.
- The provider uses OpenAI File Search over the approved admissions corpus vector store, not unapproved broad website/PDF content.
- The current public YIU demo remains unchanged until the user explicitly approves a switch.
- Website-embedded chatbot delivery is a later phase; this phase proves answer quality, source quality, refusal safety, latency, and cost first.
- Provider selection is database-controlled per organization/demo; File Search is not the default for every new organization.
- Admissions conversion/follow-up behavior is seeded through organization AI settings, while grounding/source/refusal validation stays enforced in code.
- Matched Skill answers remain exact operator-authored templates and do not go through polish or AI rewrite.
- Customer-preview File Search requires a passed ingestion/vector-store readiness check and a complete citation mapping manifest.
- Pre-brochure local ingestion succeeded with `vs_6a20bc28099081918fed4bfef3569c02`; this vector store is an eval artifact with short lifecycle, not a production/default provider switch.
- The customer brochure PDF should not be ingested raw-only. `pdftotext` extracts only 59 characters, so the verified markdown artifact is the primary brochure source for File Search.
- Approved-corpus local ingestion with categorized verified brochure markdown succeeded with `vs_6a213186dd6c81919ec51dca2a9913d5`; this vector store is still a local/eval artifact and does not switch any public demo/provider by itself.

## Remaining Customer Inputs

- The customer's expected question list.
- Customer/source owner confirmation for the `Tıbbi Tanıtım ve Pazarlama (Burslu)` row, where the brochure shows a `330.000` price despite the row being labeled burslu.
- Whether contact/link answers may use a separate approved contact sheet when the brochure is incomplete.
- Approved display labels/source URLs for any brochure, contact sheet, or question sheet citations that should be visible to visitors.
- Whether the final benchmark report should also be exported as a customer-readable spreadsheet in addition to Markdown/JSON.
