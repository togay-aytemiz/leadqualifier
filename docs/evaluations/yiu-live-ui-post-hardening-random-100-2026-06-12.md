# YIU Live UI Post-Hardening Evaluation

Date: 2026-06-12  
Production UI: `https://app.askqualy.com/demo/yiu-tanitim-gunleri-2026`

## Method

- Answers were produced only through the real production Demo Chat UI.
- Every case used the UI's `Yeniden basla` action and a clean conversation.
- The old provider/eval pipeline was not used to generate answers.
- The run covered the 14 prior low-score questions plus a fresh seeded random sample of 100 non-overlapping questions from the 508-question set.
- A failed parallel-tab attempt was discarded because shared browser session storage contaminated replies. Only the isolated single-tab results below are counted.
- The strict answer judge was `gpt-5.4-mini`; scores remain triage signals and require manual review for critical facts.

## Results

| Cohort | Cases | Average | 8-10 | 6-7 | 1-5 | Avg latency | P90 | Max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Prior failures retest | 14 | 7.50 | 7 | 5 | 2 | 15.2s | 21.5s | 25.1s |
| Fresh random sample | 100 | 7.07 | 53 | 25 | 22 | 16.6s | 26.4s | 33.2s |

The fresh random result is effectively flat against the earlier live UI run (`7.11`, 53 at 8-10, 23 at 1-5). The samples differ, so this is directional rather than a strict before/after comparison. Latency improved materially from the earlier `21.3s` average and `40.2s` p90.

## Prior Failure Retest

Seven of the 14 prior failures now scored 8-10. Fee and quota extraction improved most:

- `Ergoterapi ucreti nedir?` -> 9
- `Ergoterapi kontenjani nedir?` -> 9
- `hemsirelik kac para` -> 9
- `Hemsirelik kontenjani nedir?` -> 10 with clarification
- `Ebelik kontenjani nedir?` -> 10 with clarification
- `Baskasinin yerine kayit yaptirabilir miyim?` -> 10

Two remained direct failures:

- `Tip Fakultesi kac yillik?` -> 2 because the UI answered `4 yil / 8 donem`. The same production UI had answered `6 yil` correctly in an immediately preceding clean run. This is a critical repeat-consistency failure, not a missing static rule.
- `Universitenin eksileri ne?` -> 5 because the answer redirected to strengths and did not address the request.

## Random 100 Findings

Problem counts from the strict judge:

| Category | Count |
|---|---:|
| missing_actionable_next_step | 25 |
| over_cautious_no_info | 22 |
| wrong_answer | 17 |
| unsupported_claim | 17 |
| missed_clarification | 11 |
| wrong_routing | 10 |

The system is strongest on explicit brochure tables and direct program catalog facts. It is still unreliable in four general areas:

1. **Repeat consistency:** identical clean-session questions can produce contradictory facts (`Tip Fakultesi` duration: correct 6 years, then incorrect 4 years).
2. **Direct evidence entailment:** related clinical/campus text is sometimes converted into an unsupported `evet`, including own-hospital, device use, lab availability, campus safety, and campus/program mapping claims.
3. **General web-fact recall:** basic institution introduction, founder foundation, and health focus can still collapse into no-info even though the approved corpus contains relevant website material.
4. **Clarification/no-info quality:** when evidence is missing or the facet is ambiguous, the bot still alternates between generic no-info, unnecessary clarification, and an answer without an actionable next step.

Representative critical failures included own-hospital claims, Balgat campus program mapping, clinical device-use claims, and overly broad mandatory-staj claims. These are more serious than a polite no-info because they can mislead applicants.

## Production Readiness Gap

For a customer-facing acceptance gate, the recommended target is:

- at least 85/100 answers scoring 8-10;
- at most 5/100 answers scoring 1-5;
- zero critical unsupported institutional, fee, quota, campus, clinical, or policy claims;
- at least 95% agreement across three clean repeats of a critical factual question;
- p90 latency below 20 seconds.

The current random run is 32 answers short of the 8-10 target, 17 failures above the maximum, and fails the critical repeat-consistency requirement. The pipeline is useful but not yet meeting-room reliable.

## Next Generic RAG Work

1. Add a subject-and-facet evidence selector between File Search and composition. Every answer claim must map to a citation that directly entails the requested entity and facet, not merely a related document.
2. Add contradiction-aware retry. If retrieved evidence disagrees on a protected fact, or the composed answer changes across evidence passes, retry with exact entity/facet queries and abstain instead of choosing one silently.
3. Add metadata-aware reranking for source authority, document type, scope, and recency while keeping answers evidence-derived and tenant-independent.
4. Replace generic no-info with one targeted clarification only when a missing slot would materially change retrieval; otherwise return a concise supported boundary plus an actionable official next step.
5. Add a repeat-consistency gate over a small critical suite. Single-run pass rates are insufficient while identical questions can contradict each other.

Raw scored artifacts are stored locally under `tmp/rag-evals/yiu-live-ui-random-100-post-hardening-2026-06-12.*` and `tmp/rag-evals/yiu-live-ui-prior-failures-retest-post-hardening-2026-06-12.*`.
