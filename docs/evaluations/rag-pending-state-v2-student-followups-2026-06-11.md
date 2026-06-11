# RAG Pending State v2 - Student Follow-up Scenarios

Date: 2026-06-11

Purpose: Validate generic pending-clarification state decisions with short, typo-heavy, student-like follow-up messages. These scenarios are tenant-agnostic: the university examples are fixtures, but the expected behavior is the platform contract.

Summary:

| State decision | Count | Expected behavior |
|---|---:|---|
| `use` | 19 | Treat latest user message as the answer to the pending clarification and rewrite from original question + clarification answer. |
| `split` | 5 | Treat latest user message as both a clarification answer and a new related facet/question. |
| `ignore` | 5 | Treat latest user message as a fresh independent question and do not consume pending state. |
| `clarify` | 3 | Ask a short clarification because the follow-up is still too vague. |
| **Total** | **32** | All covered by `src/lib/knowledge-base/rag-eval/pending-clarification-state.test.ts`. |

## Live Provider Smoke

Command:

```bash
npm run rag:pending-followups:live -- --out tmp/rag-evals
```

Latest run:

- Markdown: `tmp/rag-evals/rag-pending-followup-live-eval-2026-06-10T21-56-57-869Z.md`
- JSON: `tmp/rag-evals/rag-pending-followup-live-eval-2026-06-10T21-56-57-869Z.json`
- Average orchestration-contract score: `8.25/10`
- Estimated credits: `48.1000`

Score distribution:

| Score | Count |
|---:|---:|
| 10 | 23 |
| 6 | 5 |
| 1 | 4 |

State-decision distribution:

| Actual state decision | Count |
|---|---:|
| `use` | 23 |
| `ignore` | 4 |
| `clarify` | 1 |
| `-` | 4 |

Findings:

- Short, typo-heavy, long natural, and one-word slot answers mostly work: `19/19` intended `use` cases routed correctly except the question-like follow-up `tüm bölümler var mı acaba`, which bypassed contextual state and returned no-info.
- Mixed follow-ups still need improvement: `4/5` intended `split` cases were treated as `use`, so the pending slot was consumed but the added facet was not explicitly tracked.
- Safety refusal was user-safe, but it bypassed `state_decision=ignore`, leaving a diagnostics gap for fresh unsafe questions.
- Ambiguous follow-ups need a stronger state boundary: `hangisi daha iyi` and `bilmiyorum` did not consistently become one more clarification.

Low-score rerun after generic pending-state fallback/split guards:

- Command: `npm run rag:pending-followups:live -- --out tmp/rag-evals --case-ids pending-followup-11,pending-followup-20,pending-followup-21,pending-followup-22,pending-followup-23,pending-followup-24,pending-followup-28,pending-followup-30,pending-followup-32`
- Markdown: `tmp/rag-evals/rag-pending-followup-live-eval-2026-06-10T22-10-13-850Z.md`
- JSON: `tmp/rag-evals/rag-pending-followup-live-eval-2026-06-10T22-10-13-850Z.json`
- Average orchestration-contract score: `10.00/10`
- Score distribution: `9` x `10`
- State-decision distribution: `use` x `1`, `split` x `5`, `ignore` x `1`, `clarify` x `2`
- Estimated credits: `8.6000`

Fix summary:

- Question-like slot answers now consume pending state when they overlap the original clarification scope.
- Mixed replies with an added facet are promoted from `use` to `split` even if the LLM under-classifies them.
- No-progress or still-vague replies such as `bilmiyorum` and `hangisi daha iyi` ask one more clarification instead of consuming the state.
- Unsafe fresh questions can still refuse safely while recording `state_decision=ignore` and `consumed_pending_state=false`.

## Case Table

| # | Original user question | Bot clarification | Student follow-up | Expected decision | Expected behavior |
|---:|---|---|---|---|---|
| 1 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | tümü | `use` | Preserve `program_list`; answer all programs. |
| 2 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | hepsi | `use` | Preserve `program_list`; answer all programs. |
| 3 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | genel olarak tüm bölümler hakkında bilgi almak istiyorum | `use` | Long natural answer still fills the pending scope. |
| 4 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | tum bolumleri gormek istiyom | `use` | Typo-heavy answer still fills the pending scope. |
| 5 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | burslu olanlar | `use` | Preserve `program_list`; answer burslu scope. |
| 6 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | bursluları göster | `use` | Preserve `program_list`; answer burslu scope. |
| 7 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | lisansları söyle | `use` | Preserve `program_list`; answer lisans scope. |
| 8 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | on lisanslar | `use` | Preserve `program_list`; answer ön lisans scope. |
| 9 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | fark etmez hepsi olur | `use` | Indifferent answer resolves to all programs. |
| 10 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | ücretli de olur hepsini yaz | `use` | `ücretli` is scope/variant, not a new price intent. |
| 11 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | tüm bölümler var mı acaba | `use` | Question-like wording can still answer pending scope. |
| 12 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | sağlık alanındaki tüm seçenekleri görmek istiyorum | `use` | Long scope answer fills pending state. |
| 13 | taban puanlar nedir | Hangi program ve burs/ücret türü için taban puanı öğrenmek istiyorsunuz? | tıp ing ücretli | `use` | Preserve `base_score`; `ücretli` is row variant. |
| 14 | taban puanlar nedir | Hangi program ve burs/ücret türü için taban puanı öğrenmek istiyorsunuz? | tıp türkçe burslu | `use` | Preserve `base_score`; use selected program row. |
| 15 | taban puanlar nedir | Hangi program ve burs/ücret türü için taban puanı öğrenmek istiyorsunuz? | hemşirelik | `use` | One-word program answer fills missing program. |
| 16 | taban puanlar nedir | Hangi program ve burs/ücret türü için taban puanı öğrenmek istiyorsunuz? | dkt | `use` | Abbreviation answer fills missing program. |
| 17 | taban puanlar nedir | Hangi program ve burs/ücret türü için taban puanı öğrenmek istiyorsunuz? | ftr var ya o | `use` | Colloquial abbreviation answer fills missing program. |
| 18 | staj kaç gün | Hangi bölüm veya program için staj süresini öğrenmek istiyorsunuz? | anestezi | `use` | Preserve `internship_duration`; selected program fills slot. |
| 19 | staj kaç gün | Hangi bölüm veya program için staj süresini öğrenmek istiyorsunuz? | ilk yardım için | `use` | Preserve `internship_duration`; colloquial program answer fills slot. |
| 20 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | tümü, ücretleri de yaz | `split` | Consume scope and include the new fee facet. |
| 21 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | burslu olanlar, kontenjan da lazım | `split` | Consume burslu scope and include quota facet. |
| 22 | taban puanlar nedir | Hangi program ve burs/ücret türü için taban puanı öğrenmek istiyorsunuz? | tıp ing ücretli, başarı sırası da kaç | `split` | Preserve `base_score` and include related success-rank request. |
| 23 | staj kaç gün | Hangi bölüm veya program için staj süresini öğrenmek istiyorsunuz? | hemşirelik, ayrıca kampüs nerde | `split` | Consume program slot and include campus/location facet. |
| 24 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | on lisanslar ve ucretleri | `split` | Consume ön lisans scope and include fee facet. |
| 25 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | çalışma saatleri nedir? | `ignore` | New independent question; do not consume pending state. |
| 26 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | bugün hava nasıl | `ignore` | Off-topic new question; do not consume pending state. |
| 27 | taban puanlar nedir | Hangi program ve burs/ücret türü için taban puanı öğrenmek istiyorsunuz? | kampüse nasıl gidilir | `ignore` | New transport question; do not consume score pending state. |
| 28 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | kredi kartımı yazsam ödeme alır mısın | `ignore` | New sensitive/payment action; do not consume pending state. |
| 29 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | telefon numarası var mı | `ignore` | New contact question; do not consume pending state. |
| 30 | taban puanlar nedir | Hangi program ve burs/ücret türü için taban puanı öğrenmek istiyorsunuz? | hangisi daha iyi | `clarify` | Still ambiguous; ask what comparison or program is meant. |
| 31 | staj kaç gün | Hangi bölüm veya program için staj süresini öğrenmek istiyorsunuz? | o değil ya | `clarify` | Correction is not enough to answer; ask for intended program/topic. |
| 32 | hangi bölümlere kayıt olabilirim | Burslu programları mı, yoksa genel olarak tüm lisans ve ön lisans programlarını mı görmek istiyorsunuz? | bilmiyorum | `clarify` | No usable slot value; ask for desired scope. |

Verification:

```bash
npm test -- --run src/lib/knowledge-base/rag-eval/pending-clarification-state.test.ts
```

Result: 32/32 passed.
