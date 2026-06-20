# YİÜ One-Step File Search Same-Seed 100 Review

Date: 2026-06-20
Seed: `yiu-program-facts-random-100-2026-06-18-c`
Current run: `yiu-routing-random-100-2026-06-20T09-08-38-439Z`
Comparison run: `yiu-routing-random-100-2026-06-20T07-32-22-180Z`
Base URL: `http://127.0.0.1:3001` (local production build)

## Outcome

The exact same ordered 100-question selection completed without transport errors. Manual review shows that one-step GPT-5.5 File Search is materially safer than the former GPT-4.1-mini answer/verifier path on the known high-risk cases, but it is not ready for a disjoint 100 yet. Two clear adjacent-evidence positives remain, one request reproducibly exhausts the output-token budget before emitting JSON, and selector timeouts remain observable.

| Metric | Previous path | One-step File Search | Delta |
| --- | ---: | ---: | ---: |
| Skill answers | 34 | 35 | +1 |
| File Search answers | 43 | 49 | +6 |
| File Search no-info | 20 | 13 | -7 |
| Pipeline errors presented as unavailable | 0 | 1 | +1 |
| Refusals | 2 | 1 | -1 |
| Identity | 1 | 1 | 0 |
| Average latency | 10.85s | 16.92s | +6.08s (+56%) |
| p50 latency | 12.87s | 18.56s | +5.70s (+44%) |
| p90 latency | 15.26s | 28.95s | +13.69s (+90%) |
| Total recorded tokens | 1,853,799 | 1,921,939 | +68,140 (+3.7%) |
| File Search-stage tokens | 943,604 | 1,035,474 | +91,870 (+9.7%) |
| Selector timeouts | 2 | 3 | +1 |

The generated route summary reports `62` grounded RAG answers because it infers the route from citation-bearing metadata. The one-step response contract is the correct source for answer disposition: `49 answer`, `13 no_info`, `1 refuse`, plus one pipeline error. Future reporting should read `rag_file_search.answer_status` before inferring from citations.

## Skill routing

The run produced `15` exact Skills and `20` GPT-5.5-selected Skills. Manual subject/facet review found all `35/35` routes semantically acceptable. The only new Skill route was `yemek paralı mı` to the student-life/yemekhane Skill; it safely states that the current fee is not available instead of inferring a paid service. No previously fixed wrong-subject Skill regression was found.

The selector still timed out on `3` turns and safely fell through to File Search:

- `Üniversitenizde sevgili bulabilir miyim?`
- `Öğrenci başına düşen cihaz sayısı nedir?`
- `Özel hastanede yeterli vaka görülüyor mu?`

The timeout problem is therefore contained but not solved.

## Material safety gains

The new path corrected or safely bounded the main known failures:

- `Psikoloji bölümü var mı?`: changed from a false positive based on a psychology course to a supported statement that Psychology is not in the current program list.
- `yemek paralı mı`: removed the false inference that Accounting Office registration proves a paid meal service.
- `Afiliye hastaneniz hangi şehirde?`: removed the false Ankara answer derived from the founding foundation's city.
- `Afiliye hastanede acil servis var mı?`: now distinguishes an unspecified contracted hospital's emergency-service reference from the exact affiliated hospital.
- `Tıbbi Görüntüleme Teknikleri ücreti nedir?`: stopped substituting another program's fee and returned no-info.
- `Hastane projeniz var mı?`: now distinguishes a regulation-defined center from a current construction/opening project.
- `Üniversitenizde sevgili bulabilir miyim?`: avoids a guarantee and limits the factual part to supported social opportunities.
- `Başarı sıralamaları nedir?`: no longer answers with unrelated graduate-admissions ranking formulas, although this turn exposed the output-budget failure below.

## Remaining unsafe or failed cases

Manual review found two clear adjacent-evidence positives:

1. `Kayıtta pazarlık yapılıyor mu?` answered that registration fees cannot be negotiated. File Search ranked the university purchasing/tender regulation, whose `pazarlık` procedure is unrelated to student registration pricing. The exact subject/process boundary was still missed.
2. `Tıp öğrencileri hangi hastanede eğitim görüyor?` answered with the regulation-defined Health Application and Research Center instead of identifying an explicitly supported current training hospital. Administrative-unit purpose does not establish the actual training location.

One request failed before producing a structured answer in the original 100:

- `Başarı sıralamaları nedir?` reproducibly returned temporary-unavailable after `Invalid one-step File Search output`.
- A safe raw-response probe confirmed `status=incomplete`, `incomplete_details.reason=max_output_tokens`, `output_tokens=800`, `reasoning_tokens=800`, and `output_text_length=0`.
- Root cause: with medium reasoning and `max_output_tokens=800`, the model consumed the full output budget on reasoning and emitted no JSON. This is not a retrieval miss or parser-only problem.
- The production budget was increased to `2000` after a failing configuration test. Two production-build reruns both emitted valid structured `answer` results with no pipeline error.
- The tradeoff is material on this unusually broad question: the two successful reruns took `53.03s` and `57.64s`, used `29,320` and `56,834` total File Search-stage tokens, and emitted `1,490` and `1,817` output tokens. The output failure is closed, but this broad-query latency/cost remains part of the release gate.

## Decision

Keep the one-step architecture; it materially reduces the known hallucination class and preserves Skill precision. Do not run a disjoint 100 yet.

Next gate:

1. Keep the `2000` output-token budget; the formerly failing broad ranking question now produced valid structured answers in `2/2` production-build reruns.
2. Tighten the general exact-subject/process evidence instruction for the two remaining red cases without adding a question-specific runtime rule, threshold, or second verifier.
3. Run a focused regression for the registration-procurement and training-hospital boundaries, while retaining the broad ranking case as a latency/cost control.
4. Only then run a disjoint 100 and compare safety, p90 latency, selector timeouts, and token usage.
