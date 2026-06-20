# YİÜ Selector Precision Probe Review

Date: 2026-06-19  
Base URL: `http://127.0.0.1:3001`  
Probe: `docs/evaluations/yiu-routing-random-10-2026-06-19T18-43-24-764Z.md`

## Goal

Verify that the post-random-100 broad/wrong Skill selections are rejected without losing high-confidence program fee/quota Skills, and that adjacent hospital/procurement RAG evidence fails closed.

## Result

The final focused run completed `10/10` with zero runtime or API errors:

| Route | Count |
|---|---:|
| skill_answered | 2 |
| rag_no_info | 6 |
| rag_grounded_answer | 2 |

The two positive controls remained precise Skill answers:

- `Ebelik kontenjanı nedir?` -> `YİÜ Intent - 71 ebelik_program_bilgileri`
- `Anestezi programının ücreti nedir?` -> `YİÜ Intent - 37 anestezi_ucret_kontenjan`

The reviewed broad or adjacent Skill matches no longer reached customers as Skills:

- `Başarı sıralamaları nedir?` -> no-info, not one arbitrary program Skill.
- `Hastane değişebilir mi?` -> no-info, not the program-change/yatay-geçiş Skill.
- `Devlet hastanesinde staj yapabilir miyim?` -> RAG, not the Tıp intörnlük Skill.
- `Üniversitenizde sevgili bulabilir miyim?` -> RAG, not the student-facilities Skill.
- `Laboratuvarlar yeni mi?` -> no-info, not the Tıp general Skill.
- `Hastane projeniz var mı?` -> no-info, not the university-general Skill.

The focused risk verifier also rejected the known adjacent evidence cases:

- affiliated-hospital ownership/type inferred from a founding foundation;
- current hospital/project existence inferred from a center regulation;
- student registration bargaining inferred from procurement/tender rules.

## Remaining review item

`Devlet hastanesinde staj yapabilir miyim?` returned a conditional grounded RAG answer based on general workplace approval and internship-document rules. This is safer and more relevant than the former unrelated Tıp intörnlük Skill, but the evidence still does not clearly establish that the policy applies to every program or specifically to a state hospital. Keep this row as a RAG subject-scope review item in the next full same-seed run.

The social/relationship question returned a bounded RAG answer about student communities and explicitly stated that no romantic outcome or guarantee is provided. It is no longer a false Skill selection.

## Implementation conclusion

The final contract remains one candidate-verifier call and one risk-verifier call. Skill selection now requires structured direct subject/facet coverage, response-bound extractive evidence, and sector/language-independent subject/facet token grounding. Risky RAG pass verdicts require direct subject/facet coverage plus selected-chunk evidence; Turkish registration/procurement wording now enters that guard.
