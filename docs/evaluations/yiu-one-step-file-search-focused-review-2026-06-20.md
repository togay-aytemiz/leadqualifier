# YİÜ One-Step GPT-5.5 File Search Focused Review

Date: 2026-06-20
Final live artifact: `yiu-one-step-file-search-focused-2026-06-20T08-42-49-144Z`
Vector store: `vs_6a338d7c24388191a43809879d974db0`

## Decision

The Public Demo fallback can move from the custom `vectorStores.search -> GPT-4.1-mini answer -> GPT-4.1-mini verifier` chain to one GPT-5.5 Responses API call with hosted File Search and Structured Outputs.

The final configuration uses `reasoning.effort=medium`, forces `file_search`, includes `file_search_call.results`, and returns one of `answer`, `no_info`, or `refuse`. There is no separate evidence-verifier model and no new similarity threshold.

## Balanced gate

The focused set contains:

- `10` questions with directly supported answers that the former verifier could incorrectly suppress.
- `8` bounded questions where exact support is absent but a related, directly supported clarification may be useful only if the answer explicitly preserves the boundary.
- `2` questions with no useful direct support, which must return no-info.

Final manually audited result:

| Metric | Result |
| --- | ---: |
| Directly supported recall | 10/10 |
| Safe bounded/no-info handling | 10/10 |
| Unsafe positive claims | 0 |
| Runtime/API errors | 0 |
| p50 latency | 10.21s |
| p90 latency | 12.68s |
| Input tokens | 290,824 |
| Output tokens | 8,229 |
| Total tokens | 299,053 |

The raw artifact's original status-only summary reports seven false answers because the first rubric incorrectly required every exact-unknown question to return `no_info`. That contradicted the approved design, which permits a bounded answer when a directly supported related fact is useful and the exact requested fact is explicitly left unknown. The corrected scorer accepts `answer` or `no_info` for bounded cases and applies forbidden-positive patterns; the final artifact rescored at `20/20`, with `10/10` supported recall, zero false answers, zero unsafe answers, and zero errors.

## Model-effort comparison

| Effort | Supported recall | Manual unsafe positives | p90 | Total tokens |
| --- | ---: | ---: | ---: | ---: |
| none | 10/10 | 2 | 7.54s | 287,700 |
| low | 10/10 | 1 | 7.78s | 292,707 |
| medium | 10/10 | 0 | 12.68s | 299,053 |

The medium setting is retained because it correctly distinguishes exact institutional relationships such as `afiliye` versus `anlaşmalı` and distinguishes a regulation-defined center from a currently verified hospital project. The latency increase is accepted provisionally and must be measured again on the same-seed 100 before deployment.

## Notable corrections

- `Psikoloji bölümü var mı?` returns no-info instead of inferring a program from psychology-related course text.
- `yemek paralı mı` states that meal service exists but that paid/free status is not established; it no longer infers payment from the Accounting Office process.
- Affiliated-hospital city/service questions no longer equate the university address or an unspecified contracted hospital with the exact affiliated hospital.
- The hospital-project answer distinguishes a regulation-defined center from evidence of a current physical project.
- Supported attendance, scholarship, registration, contact, clinical practice, internship insurance, laboratory, internship, and founder facts all remain answerable.

## Next gate

Run the exact same ordered 100-question seed once with this configuration. Do not start a disjoint 100 until manual review confirms that the focused precision/recall balance generalizes and the p90/cost increase is acceptable.
