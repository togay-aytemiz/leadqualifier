# YİÜ Same-Seed Random 100 — Post Verifier-Timeout Review

Date: 2026-06-19  
Seed: `yiu-program-facts-random-100-2026-06-18-c`  
Base URL: `http://127.0.0.1:3001`  
Run: `docs/evaluations/yiu-routing-random-100-2026-06-19T17-00-06-710Z.md`

## Result

The full same-seed run completed `100/100` with zero script, OpenAI quota, or transport errors:

| Route | Count |
|---|---:|
| skill_answered | 51 |
| rag_grounded_answer | 26 |
| rag_no_info | 20 |
| rag_refuse | 2 |
| assistant_identity | 1 |

Average latency was `9.0s`, p50 was `7.1s`, and p90 was `14.7s`. Compared with the previous billing-valid combined view, average latency fell from `11.6s` to `9.0s`, while Skill routing increased from `29` to `51`.

## Skill routing diagnostics

The terminal Skill outcomes are now visible and are no longer overwritten by the RAG fallback marker:

| Outcome | Count |
|---|---:|
| verified_skill | 36 |
| exact_skill | 15 |
| verification_no_skill | 46 |
| verification_timeout | 1 |
| no_candidate_queries | 1 |
| no Skill diagnostics (assistant identity) | 1 |

The former top-X/verifier-timeout misses recovered in this run:

- `Ebelik kontenjanı nedir?` -> `YİÜ Intent - 71 ebelik_program_bilgileri`
- `ebelik varmi` -> `YİÜ Intent - 71 ebelik_program_bilgileri`
- `Anestezi programının ücreti nedir?` -> `YİÜ Intent - 37 anestezi_ucret_kontenjan`
- `grafik tasarım kaç para` -> `YİÜ Intent - 82 grafik_tasarim_program_bilgileri`
- `Tıbbi Laboratuvar Teknikleri kontenjanı kaç?` -> `YİÜ Intent - 39 tibbi_laboratuvar_teknikleri_ucret_kontenjan`

There was one preserved `verification_timeout`: `Hemşirelikte yaz stajı var mı?`. It safely fell through to RAG and returned a directly supported answer, so this timeout did not cause a wrong visible response. Candidate diagnostics expose all program facets, including `fee`, `quota`, `base_score`, and `success_rank`.

## Comparison with the previous valid same-seed view

| Transition | Count |
|---|---:|
| Skill -> Skill | 28 |
| grounded RAG -> grounded RAG | 22 |
| grounded RAG -> Skill | 19 |
| no-info -> no-info | 17 |
| no-info -> grounded RAG | 4 |
| no-info -> Skill | 3 |
| grounded RAG -> no-info | 2 |

The remaining five rows account for identity/refusal stability and one transition each from Skill to no-info, direct answer to refusal, and clarification to Skill.

## Remaining quality risks

The higher Skill count is a real recall improvement, but it is not equivalent to `51/51` correct routing. Four visible matches remain too broad or answer an adjacent facet:

- `Başarı sıralamaları nedir?` selected the single-program Bilgisayar Programcılığı Skill despite no program subject being specified.
- `Üniversitenizde sevgili bulabilir miyim?` selected the student-life Skill and answered about facilities instead of handling the conversational question directly.
- `Hastane değişebilir mi?` selected the program-change/yatay-geçiş Skill.
- `Devlet hastanesinde staj yapabilir miyim?` selected the Tıp intörnlük Skill but did not answer whether a state-hospital placement is allowed.

RAG evidence validation also still accepts several adjacent-evidence inferences that deserve tightening:

- `Afiliye hastane özel mi devlet hastanesi mi?` infers hospital ownership/type from the founding foundation.
- `Hastane projeniz var mı?` treats a Health Practice and Research Center regulation as proof of a currently operating university hospital.
- `Kayıtta pazarlık yapılıyor mu?` retrieves procurement tender rules that are unrelated to tuition registration.
- `Laboratuvarlar yeni mi?` narrows an unscoped university-wide question to Ergoterapi laboratories.

## Conclusion

The verifier-timeout/diagnostics fix materially improves Skill capture for explicit program facts and lowers latency. The next focused work should be selector precision for missing or mismatched subjects/facets, followed by direct-evidence checks for hospital status and low-risk-looking but semantically adjacent RAG answers.
