# YİÜ Same-Seed 100 Review — GPT-5.5 + Unique Skill Candidates

Date: 2026-06-20  
Seed: `yiu-program-facts-random-100-2026-06-18-c`  
Current run: `yiu-routing-random-100-2026-06-20T07-32-22-180Z`  
Baseline run: `yiu-routing-random-100-2026-06-19T21-24-48-116Z`  
Base URL: `http://127.0.0.1:3001` (local Next.js development server)

## Outcome

The exact same ordered 100-question selection was verified before execution. The run completed `100/100` with zero transport/runtime errors.

| Metric | Baseline | Current | Delta |
| --- | ---: | ---: | ---: |
| Skill answers | 46 | 34 | -12 |
| Grounded RAG | 34 | 43 | +9 |
| No-info | 18 | 20 | +2 |
| Refusal | 1 | 2 | +1 |
| Identity | 1 | 1 | 0 |
| Average latency | 9.66s | 10.85s | +1.19s |
| p50 latency | 10.22s | 12.87s | +2.65s |
| p90 latency | 16.15s | 15.26s | -0.90s |

Latency is directional only because the current run used the local development server rather than a production build.

## Skill routing review

The current run produced `15` exact Skills and `19` GPT-5.5-selected Skills. Manual subject/facet review found all `34/34` Skill routes acceptable. The baseline manual review had found approximately `12/46` adjacent or non-answering Skill selections.

The lower Skill count is therefore mostly a precision correction, not evidence that retrieval became worse. Examples removed from the Skill path include:

- `Afiliye hastaneniz hangi şehirde?` no longer uses the Tıp campus-address Skill.
- `Derslere devam zorunlu mu?` no longer uses the intörnlük Skill.
- `Üniversitenizde sevgili bulabilir miyim?` no longer uses the general student-life Skill.
- `Tıbbi Laboratuvar programı için laboratuvar var mı?` no longer uses a fee/quota program Skill that does not answer facility availability.
- `Aday öğrenci birimine nasıl ulaşırım?` no longer uses the transport Skill.

The selector recorded `62` deliberate no-Skill decisions and `2` timeouts over `81` GPT-5.5 calls. Both timeouts safely fell through to RAG:

- `Ücreti kriptoyla ödeyebilir miyim?`
- `Eksik belgeyle kayıt yapılır mı?`

## Remaining root causes

The main remaining quality problem is no longer Skill selection. It is fallback RAG accepting adjacent evidence or turning absence/nearby facts into confident claims. Examples include:

- `Psikoloji bölümü var mı?` incorrectly says a Psychology program exists based on psychology-related course text.
- `yemek paralı mı` infers that food is paid merely because registration goes through the Accounting Office.
- `Üniversitenizde sevgili bulabilir miyim?` turns student-community evidence into a positive romantic-outcome implication.
- Affiliated/own-hospital questions still produce positive hospital-location, emergency-service, or hospital-existence claims from adjacent foundation/regulation evidence.
- `Tıbbi Görüntüleme Teknikleri ücreti nedir?` has no exact Skill candidate. GPT-5.5 correctly rejects nearby programs, but RAG then cites other program prices. The generated Skill catalog has no program-specific Skill for this subject/fee combination, so this is a coverage/data gap rather than an embedding-rank or selector-model failure.

## Decision

Keep the unique-candidate retrieval and GPT-5.5 selector unchanged. Do not tune embeddings, add a second selector, or run a disjoint random 100 yet. First run a small focused regression for the unsafe RAG positives above and close the missing program-fact/boundary coverage for Tıbbi Görüntüleme without inventing a fee.

