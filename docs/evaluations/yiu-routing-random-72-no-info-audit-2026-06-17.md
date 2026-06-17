# YİÜ Routing Random 72 No-Info Audit

Date: 2026-06-17

This audit reviews the post-credit rerun from the reproducible 508-question YİÜ pool and the follow-up fixes made after checking the live behavior. The goal was to answer two questions:

1. Are the remaining no-info replies real source gaps or overly strict guard behavior?
2. Should the query rewriter use the AI assistant task/scope settings such as "Yüksek İhtisas Üniversitesi Tanıtım Günleri aday öğrenci asistanı"?

## Runs

- Baseline rerun from question 29 onward:
  - Report: `docs/evaluations/yiu-routing-random-72-2026-06-17T11-12-59-234Z.md`
  - JSON: `tmp/crawl-output/yiu-routing-random-72-2026-06-17T11-12-59-234Z.json`
  - Completed: 72
  - Errors: 0
  - Routes: `skill_answered: 22`, `rag_answered: 14`, `rag_no_info: 36`
  - Average latency: 13.8s

- After assistant-settings organization context, lower retrieval threshold, and less over-cautious no-info prompting:
  - Report: `docs/evaluations/yiu-routing-random-72-2026-06-17T11-39-37-667Z.md`
  - JSON: `tmp/crawl-output/yiu-routing-random-72-2026-06-17T11-39-37-667Z.json`
  - Completed: 72
  - Errors: 0
  - Routes: `skill_answered: 28`, `rag_answered: 42`, `rag_no_info: 2`
  - Average latency: 9.3s

OpenAI File Search's documented behavior already includes query rewriting, parallel keyword/semantic search, and reranking; its default score threshold is `0`. The active simple RAG path now follows that default instead of starting at `0.1`. Reference: https://developers.openai.com/api/docs/assistants/tools/file-search#how-it-works

## Root Causes Found

1. The rewriter sometimes had weak or wrong organization scope.
   - The live demo channel display name could be `YIU Demo`, while the actual assistant settings clearly say `Yüksek İhtisas Üniversitesi`.
   - Some rewritten searches drifted toward other Turkish universities or generic institution language.
   - The answer guard could then reject otherwise relevant chunks because the active org context did not name the real represented institution.

2. The simple RAG rewriter had a too-large `respond` escape hatch.
   - It could classify knowledge questions as direct conversational responses.
   - Those answers had `queryIntent: simple_rag_respond`, zero retrieved sources, and no selected chunks.
   - Examples from the second full run included hospital/device/lab/campus-style claims and an off-topic tutoring answer.

3. No-info was previously over-triggered.
   - In the baseline run, all 36 no-info cases still had raw File Search hits.
   - The problem was often not "File Search found nothing"; it was that the downstream org guard, threshold, or answer prompt refused usable context too quickly.

## Fixes Applied

- Added `src/lib/demo-chat/organization-context.ts` to extract canonical organization names from AI behavior settings and bot identity.
- Public Demo Skill rewriting now receives both:
  - canonical organization context, for example `Yüksek İhtisas Üniversitesi / YIU Demo`
  - assistant task/scope instructions as scope-only context
- Simple non-Skill RAG rewriting now receives the same assistant task/scope context.
- Query rewriter prompts explicitly say the assistant instructions are for organization, scope, identity, and boundary resolution only; they are not factual answer evidence and must not be copied into the search query.
- OpenAI Vector Store Search default `score_threshold` is now `0`.
- Answer prompting now prefers partial supported answers over generic no-info when chunks support useful facts.
- Added a source-less response boundary:
  - direct `respond` is allowed for greetings, assistant identity/scope questions, and safety/boundary responses
  - knowledge-looking questions are forced into `search`
  - off-topic tutoring requests are forced into `refuse`

Targeted post-fix checks:

- `Tıbbi Görüntüleme öğrencileri hastanede cihaz kullanıyor mu?`
  - Before: source-less unsupported answer.
  - After: `rag_no_info` with `simple_rag_search`; retrieved context was not enough to support the claim.
  - Report: `docs/evaluations/yiu-routing-random-1-2026-06-17T12-11-53-055Z.md`

- `TYT matematik çalıştırır mısın?`
  - Before: answered as if tutoring was allowed.
  - After: refusal boundary reply, routed by `simple_rag_refuse`.
  - Report: `docs/evaluations/yiu-routing-random-1-2026-06-17T12-12-37-908Z.md`

## Remaining No-Info Audit

After the organization-context/no-info prompt changes, the full 72-question rerun had only two no-info answers:

1. `Tıbbi Laboratuvar programı için laboratuvar var mı?`
2. `Laboratuvarlar kampüs içinde mi?`

Active approved corpus review:

- The active YİÜ approved corpus contains some lab-adjacent evidence, including references to `Tıbbi Laboratuvar Teknikleri Dersliği 1`, general laboratory usage instructions, and Ergoterapi lab names.
- That evidence does not directly state that the Tıbbi Laboratuvar program has a laboratory available for students.
- It also does not directly answer whether laboratories are inside the campus in the broad sense asked by the user.

Conclusion:

- For the active corpus, these two no-info answers are defensible and safer than inventing a facility/location claim.
- The broader full crawl has facility-area and lab-related material that could help, but those facts need to be curated into the active approved/vector corpus as direct facility snippets before the bot should answer these questions confidently.

## Remaining Risk

The second full 72-question report was generated before the source-less `respond` boundary was added. Its headline `rag_answered: 42` therefore overstates safe grounded answers. The targeted checks verify the new boundary on known bad cases, but a full same-seed rerun should be used as the next release gate.

Known weak spots still visible in the report:

- `Tıp Fakültesi ücreti ne kadar?` matched the hazırlık-fee skill and answered only hazırlık fee.
- `Psikoloji bölümü var mı?` matched a general university intro skill instead of clearly saying the available sources do not list Psychology.
- `Hangi bölüm hangi kampüste?` asked for one program even though this is a broad campus-map style question.
- `Hastane kampüse yakın mı?` used proximity wording that should require more direct source support.

## Recommendation

Keep the architecture simple:

1. Latest message + state/history + assistant task/scope settings -> standalone query rewrite.
2. Try exact/semantic verified Skills.
3. If no Skill, run direct OpenAI Vector Store Search with the clean query.
4. Generate an answer only from selected chunks.
5. Allow no-info only after usable retrieval is genuinely insufficient.

The assistant settings should absolutely be available to the query rewriter, but only as scope and identity context. They should not be treated as source material for facts such as fees, quotas, campuses, labs, or program availability.
