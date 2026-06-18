# YİÜ Random 100 Codex Review

Run: `2026-06-18T10-29-56-934Z`
Raw report: `docs/evaluations/yiu-routing-random-100-2026-06-18T10-29-56-934Z.md`
Raw JSON: `tmp/crawl-output/yiu-routing-random-100-2026-06-18T10-29-56-934Z.json`
Seed: `yiu-independent-review-2026-06-18-v1`

## Executive Summary

The run is better than the earlier broken baselines, but it is still not good enough for a confident public demo.

- Completed: `99/100`
- Transport/eval error: `1`
- Route counts: `40` Skill, `30` grounded RAG, `16` no-info, `11` clarification, `2` assistant identity
- Codex manual score: `7.10 / 10` across the `99` completed answers
- Score buckets: `54` strong, `26` usable, `12` weak, `7` bad
- Main failure mode: simple brochure/program facts still leak into fallback RAG or no-info instead of hitting a precise program fact Skill.

The short version: the system is not mostly hallucinating anymore. The bigger problem is recall and answer shape. Very easy facts like DKT quota, Grafik Tasarım quota, foundation year, SHMYO program list, and sibling discount are already in the approved corpus, but the bot either misses the right row or hits an overly broad Skill.

## Scoring Rubric

- `8-10`: Correct, natural, and useful. Minor extra detail is acceptable.
- `6-7`: Mostly correct but incomplete, over-cautious, too broad, or awkward.
- `4-5`: Weak. The answer may be partly safe but misses the requested facet or asks an unnecessary follow-up.
- `1-3`: Bad. False no-info, unsupported inference, wrong facet, operational failure, or misleading answer.

## No-Info Audit

There were `16` no-info style answers.

| Verdict | Count | Cases |
|---|---:|---|
| True/defensible no-info | 10 | weather, yemek quality, otopark, vague hospital ownership/accreditation details, subjective/easiest-program questions |
| False no-info | 4 | `#9` DKT quota, `#22` Grafik Tasarım quota, `#47` foundation year, `#79` SHMYO program list |
| Operational unavailable | 1 | `#77` English Nursing returned source-unavailable instead of a grounded answer/no-info |
| Borderline | 1 | `#57` accreditation advice could answer more helpfully, but source support is limited |

False no-info examples:

| # | Question | Codex verdict |
|---:|---|---|
| 9 | Dil ve Konuşma Terapisi kontenjanı kaç? | False no-info. The verified brochure has DKT quota rows: paid `2`, burslu `7`, %50 discount `40`. |
| 22 | Grafik Tasarım kontenjanı nedir? | False no-info. The verified brochure has Grafik Tasarım quota rows: paid `7`, burslu `5`, %50 discount `27`. |
| 47 | Üniversiteniz ne zaman kuruldu? | False no-info. The verified brochure says the university has operated since `2013`; broader history can mention the foundation/hospital background separately if needed. |
| 79 | Sağlık Hizmetleri Meslek Yüksekokulunda hangi programlar var? | False no-info. The program list exists in the verified brochure and an existing Skill has similar coverage. |

## Weak Or Incorrect Cases

| # | Question | Route | Score | Issue |
|---:|---|---|---:|---|
| 3 | Afiliye hastanede çocuk hastalıkları servisi var mı? | RAG | 2 | Unsupported inference: a Child Health internship does not prove a named affiliated hospital service exists. |
| 31 | Kardeş indirimi var mı? | Skill | 4 | Skill says no net sibling-discount amount, but the verified brochure says sibling students receive `5%` discount. |
| 37 | say bölümleri | Skill | 4 | Matched a general academic-units Skill and returned all programs instead of filtering SAY programs. |
| 50 | Stajda nöbet tutuluyor mu? | Skill | 5 | Talks about internship periods but does not answer the duty/night-shift facet. |
| 77 | Üniversitenizde İngilizce Hemşirelik var mı? | RAG | 1 | Operational unavailable response. Should either answer absence from catalog or return a normal no-info. |
| 81 | Kayıtta pazarlık yapılıyor mu? | RAG | 5 | Retrieved procurement/ihale text and exposed irrelevant “pazarlık usulü” context. Should simply say no supported registration-negotiation info. |
| 83 | Tıp öğrencileri hangi hastanede eğitim görüyor? | Skill | 3 | Answered clinical timing/model instead of the hospital name/location. If exact hospital is unknown, it should say that directly. |
| 89 | Kendi hastanenizi nereye kuracaksınız? | RAG | 4 | Asked a clarification instead of saying there is no supported plan/location evidence. |
| 98 | Online kayıt var mı? | Skill | 4 | Returned document list; does not directly answer online registration availability. |

## Route Quality Notes

Skill answers are now the best-performing path, but grouped Skills are causing wrong-shape answers. The worst Skill cases are not because Skills are bad as a concept; they are because one broad Skill owns several different user intents and cannot answer the exact facet cleanly.

RAG is safer than before because it abstains more often and the high-risk verifier catches some weak evidence. Still, it can miss table rows even when the row is in the clean corpus. It also sometimes lets adjacent documents support a claim that needs direct evidence, especially around hospital/clinical/service facts.

Clarifications are mixed. Good clarifications happened for genuinely program-dependent questions such as staj, devamsızlık, burs-cut conditions, and broad career fit. Over-clarifications happened for payment, service hours, cafeteria cost, refund, and future hospital location, where a search/no-info answer would be more helpful than asking the user to specify something that will not fix the evidence gap.

## Brochure Program-Fact Skill Plan

I recommend making the brochure facts program-based, but generated from the verified brochure instead of hand-authored one by one.

### Decision

Create one compact `YİÜ Intent - Program Fact - <program>` Skill per canonical brochure program, not one Skill per metric.

Each program Skill should cover:

- program existence
- faculty/school
- campus when known
- degree level and duration when known
- point type
- paid / burslu / %50 quota
- paid / %50 fee
- base score and success rank when present
- clear absence wording when a metric is not present in the verified brochure

This keeps matching precise without exploding into separate fee/quota/score/presence Skills.

### Answer Style

The answer should be direct, not source-clerk prose.

Example shape:

```text
Dil ve Konuşma Terapisi Yüksek İhtisas Üniversitesinde Sağlık Bilimleri Fakültesi altında yer alan SAY puan türündeki lisans programıdır.

2025 kontenjanları: ücretli 2, burslu 7, %50 indirimli 40.
2025 ücretleri: ücretli 490.000 TL, %50 indirimli 245.000 TL. Burslu satırda ücret tutarı verilmez.
2024 verileri: burslu taban puan 406,296 ve başarı sırası 76.136; ücretli taban puan 288,301 ve başarı sırası 307.129; %50 indirimli taban puan 296,474 ve başarı sırası 277.071.
```

### Implementation Shape

1. Extend the existing brochure parser in `scripts/knowledge/yiu-brochure-facts.ts` so it outputs normalized `ProgramFact` records.
2. Add a generated pack file such as `docs/evaluations/yiu-program-fact-skill-pack-2026-06-18.md`.
3. Update `scripts/skills/push-yiu-intent-skill-pack.ts` to load the base intent pack plus the generated program-fact pack as one union before stale-skill disabling.
4. Extend `scripts/skills/audit-yiu-intent-skill-pack.ts` so required facts are checked from parsed brochure records, not hand-written snippets.
5. Push the new pack and refresh embeddings.
6. Run targeted probes for the current misses: DKT quota, Grafik Tasarım quota, SHMYO program list, sibling discount, SAY programs, Tıp hospital question, online registration.
7. Run a fresh random 100 after targeted probes pass.

### Why This Should Help

The current system has two awkward choices: a broad Skill that answers too much or a RAG path that sometimes misses table rows. Program-fact Skills give the matcher a clean landing pad for the most common admissions questions. They also keep this data-driven: no organization-specific runtime guard, no hardcoded answer branch, no brittle case-by-case patch.

### Acceptance Gate

- False no-info on supported brochure facts should be `0` in the targeted probe.
- Random 100 manual score should move from `7.10` to at least `7.8`.
- Bad bucket should fall from `7` to at most `3`.
- Program fee/quota/presence questions should prefer program-fact Skills over fallback RAG.
- Skill answers must not contain source-clerk wording such as “broşürde/tabloda/kaynakta”.
