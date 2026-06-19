# YİÜ Same-Seed Random 100 — Retry 34-100 Review

Date: 2026-06-19  
Seed: `yiu-program-facts-random-100-2026-06-18-c`  
Base URL: `http://localhost:3000`  
First partial run: `docs/evaluations/yiu-routing-random-100-2026-06-19T11-08-28-727Z.md`  
Retry run: `docs/evaluations/yiu-routing-random-67-2026-06-19T11-23-26-085Z.md`

## Result

The first run completed 100/100, but it is not valid as a score run because OpenAI returned `429 insufficient_quota` beginning around question 34. Those responses were rendered as the approved-source access fallback (`Şu anda bilgi kaynağına erişemiyorum...`) and inflated `rag_no_info`.

After API credits were replenished, questions 34-100 were rerun with the same seed and `--routing-start-index 34`. The retry completed 67/67 with zero script errors:

| Route | Count |
|---|---:|
| assistant_identity | 1 |
| rag_clarify | 1 |
| rag_direct_answer | 1 |
| rag_grounded_answer | 27 |
| rag_no_info | 17 |
| rag_refuse | 1 |
| skill_answered | 19 |

Combining the valid first 33 rows from the first run with the 67-row retry gives this practical same-seed view:

| Route | Count |
|---|---:|
| rag_grounded_answer | 44 |
| skill_answered | 29 |
| rag_no_info | 23 |
| assistant_identity | 1 |
| rag_refuse | 1 |
| rag_direct_answer | 1 |
| rag_clarify | 1 |

## What improved after credits

- The apparent collapse after row 33 was quota-related, not a full routing regression.
- Program facts recovered when the OpenAI API was available:
  - `Anestezi kontenjanı nedir?` → Skill
  - `grafik tasarım kaç para` → Skill
  - `baglıca nerde` → Skill
  - `Yüksek İhtisas Üniversitesi hakkında bilgi verir misin?` → Skill
  - `ftr var mı` → Skill
- The one-query handoff is visible in RAG diagnostics as `standaloneQuerySource: skill_routing`.

## Remaining blockers

1. **Candidate verifier timeout / lost terminal reason is still likely.**
   Several missed Skill cases have the correct candidate in `mergedCandidates`, but no `verification` object is persisted and the final outcome is overwritten as `rag_fallback`.

   Examples:
   - `Ebelik kontenjanı nedir?` has top candidate `YİÜ Intent - 71 ebelik_program_bilgileri` with similarity `0.936`, but falls to RAG no-info.
   - `ebelik varmi` has the same Ebelik candidate with similarity `0.717`, but falls to RAG.
   - `Anestezi programının ücreti nedir?` has the Anestezi Skill at similarity `0.882`, but falls to RAG.

2. **Generated program Skill facets are incomplete.**
   Program Skills answer quota, but many generated program `coverageFacets` list `fee` and omit `quota`. The routing description contains quota wording, yet the structured facet list does not. This likely makes the verifier more fragile.

3. **RAG still over-answers some high-risk or adjacent-evidence questions.**
   Notable review candidates:
   - `Afiliye hastane özel mi devlet hastanesi mi?`
   - `Psikoloji bölümü var mı?`
   - `Hastane projeniz var mı?`
   - `Tıbbi Görüntüleme Teknikleri ücreti nedir?`
   - `Kayıtta pazarlık yapılıyor mu?`
   - `Kayıt olursam telefon hediye ediyor musunuz?`

## Next recommended fixes

1. Preserve the terminal Skill fallback reason (`verification_timeout`, `verification_error`, `verification_no_skill`) instead of overwriting it with `rag_fallback`.
2. Raise or simplify the Skill candidate verifier path; correct candidates are now being recalled, but selector completion is still brittle.
3. Add `quota`, `base_score`, and `rank` to generated program Skill `coverageFacets` wherever the Skill response contains those facts.
4. Re-run the same seed after the above fixes and compare Skill count, false no-info, and risky RAG positives.
