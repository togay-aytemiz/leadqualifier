# YİÜ Random 100 Codex Review

Run: `2026-06-17T16-42-59-385Z`
Raw report: `docs/evaluations/yiu-routing-random-100-2026-06-17T16-42-59-385Z.md`
Seed: `yiu-routing-random-2026-06-17-after-identity-skillcopy-b`
Question pool: `508`
Sample size: `100`

## Executive Summary

I manually reviewed the 100 answers for factual correctness, whether no-info was deserved, whether Skill routing was appropriate, and whether RAG claims were properly grounded.

The system is better than the earlier no-info meltdown, but it is still not ready to trust blindly in front of customers. The main failure mode is no longer "it never answers"; it is "it sometimes answers from the wrong level of evidence or the wrong Skill."

Manual Codex score: `6.73 / 10`

| Band | Count |
|---|---:|
| Strong, customer-usable (`8-10`) | 39 |
| Usable but needs caveat/copy improvement (`6-7`) | 36 |
| Weak (`4-5`) | 18 |
| Bad / unsafe / wrong intent (`1-3`) | 7 |

Raw route distribution:

| Route | Count |
|---|---:|
| `skill_answered` | 21 |
| `rag_grounded_answer` | 49 |
| `rag_clarify` | 13 |
| `rag_no_info` | 12 |
| `rag_refuse` | 4 |
| `rag_direct_answer` | 1 |

## Route Quality

### Skills

Skill hit rate was only `21/100`, and the Skill answers averaged roughly `6.1/10` in my manual review. That is the largest warning sign, because Skills are supposed to be the stable high-confidence layer.

The bad Skill cases were mostly not hallucinations; they were intent/template failures:

- `Laboratuvarda çalışmak istiyorum, hangi bölüm uygun?` matched Tıbbi Laboratuvar fee/quota, then asked the user which lab department they meant. It should recommend or compare lab-heavy programs.
- `tıp hastane kaçıncı sınıf` matched the Tıp education model Skill but still asked which class the user meant. The answer should say Dönem IV-V clinical staj, Dönem VI intörn.
- `Sağlık bölümü öğrencileri uygulama eğitimini nerede yapıyor?` matched SHMYO campus distribution, but the user asked practice training location.
- `Burslu öğrenciler ücret ödüyor mu?` matched Tıp fee Skill and answered only Tıp, while the question was general.
- `say bölümleri`, `ea var mı`, `baglum kampus`, `ftr var mı`, and `Kayıt tarihleri ne zaman?` exposed missing shorthand/alias coverage and/or over-clarifying Skill templates.

Verdict: phrase expansion is useful, but the bigger fix is subject/facet discipline in Skill matching and Skill answers that answer the facet directly.

### RAG

RAG answered more often than Skills and produced many good table/program facts. The risky cases are high-inference claims:

- `Tıbbi Görüntüleme için cihaz eğitimi nerede veriliyor?` inferred device training location from program campus.
- `Laboratuvarlar kampüs içinde mi?` inferred lab location from program/campus mapping.
- `Simülasyon laboratuvarınız var mı?` inferred simulation lab from a research center regulation.
- `Hastaneye toplu taşıma ile gidiliyor mu?` inferred hospital transport from campus transport evidence.
- `Kayıt ofisi nerede?` inferred a registration office from general rectorate/contact information.

Verdict: RAG retrieval is finding related chunks, but the answer generator still sometimes treats adjacent evidence as direct evidence. Facility/service/operational facts need a stricter direct-support check.

### No-Info

No-info is not the main problem in this run. There were `12/100` no-info replies.

| Bucket | Count | Notes |
|---|---:|---|
| Clearly defensible no-info | 8 | Subjective, undocumented, or very specific claims such as hoca başına öğrenci, yoğun bakım, otopark, vaka çeşitliliği. |
| Plausible but UX could be better | 3 | `Hazırlığı geçemezsem ne olur?`, `Hemşirelikte kan görmek zorunda mıyım?`, `Birden fazla hastaneyle anlaşmanız var mı?` |
| Suspicious false no-info | 1 | `Tıbbi Laboratuvar programı için laboratuvar var mı?` should probably be answered or at least given a qualified program/lab explanation. |

Verdict: the no-info rate itself is acceptable-ish, but the no-info copy is still too source-mechanics-heavy in places. The larger danger is unsupported positive answers, not abstention.

## Lowest-Quality Cases

| # | Question | Route | Manual score | Issue |
|---:|---|---|---:|---|
| 5 | Tıbbi Görüntüleme için cihaz eğitimi nerede veriliyor? | `rag_grounded_answer` | 3 | Unsupported inference from campus/program evidence. |
| 13 | Laboratuvarda çalışmak istiyorum, hangi bölüm uygun? | `skill_answered` | 3 | Wrong Skill behavior; asks a follow-up instead of helping compare lab-heavy programs. |
| 15 | tıp hastane kaçıncı sınıf | `skill_answered` | 3 | Skill matched but failed to answer the exact facet. |
| 17 | Torpil oluyor mu? | `rag_grounded_answer` | 3 | Source dump and unnatural "belgelerde yok" answer; should give a calm admissions/process boundary. |
| 55 | hastaneniz varmı | `rag_direct_answer` | 2 | Source-less direct answer for an institutional fact. This route should not be allowed for knowledge claims. |
| 66 | baglum kampus | `skill_answered` | 2 | Wrong Skill match; answered student life instead of Bağlum campus. |
| 79 | ea var mı | `skill_answered` | 3 | Skill selected but then clarified; should answer Sağlık Yönetimi / EA programs. |
| 91 | Simülasyon laboratuvarınız var mı? | `rag_grounded_answer` | 4 | Research-center evidence was over-promoted into simulation-lab availability. |
| 96 | Kayıt tarihleri ne zaman? | `skill_answered` | 4 | Generic registration answer; does not answer date/no-current-date boundary. |

## What This Means

The current architecture is close enough to keep iterating, but not close enough to call "aptal olmayan" yet. My read:

1. The system now retrieves and answers many simple facts.
2. Skill coverage is too low and sometimes worse than RAG because the matched answer template is too broad or evasive.
3. RAG is still too willing to infer operational/facility facts from adjacent evidence.
4. No-info is less of a blocker than before, but the suspicious no-info cases point to missing direct source snippets and weak table/facility retrieval.
5. Source-mechanics language is reduced but not gone; URLs and "belgede/kaynakta" style phrasing still leak from RAG.

## Recommended Next Fixes

1. Ban `rag_direct_answer` for institution facts. Only identity, greeting, off-topic boundary, and safety replies may use source-less direct response.
2. Add a generic direct-evidence rule for facility/service/equipment/location claims: campus/program existence cannot support lab, device, simulation, shuttle, hospital access, office, or practice-location claims unless the selected chunk directly states it.
3. Expand Skill trigger phrases for shorthand and typo-heavy student wording: `ftr`, `ea`, `say`, `baglum`, `balgat`, `kayıt tarihi`, `yurt var mı`, `burslu ücret`, `tıp hastane kaçıncı sınıf`, `laboratuvar var mı`.
4. Rewrite weak Skill answers so matched Skills answer the requested facet first, then optionally add a small caveat.
5. Add a "generic question matched to program-specific source" guard: if the evidence is only about Tıp, DKT, FTR, etc. and the user did not specify that program, either qualify the answer explicitly or ask for the program.
6. Keep no-info softer and more actionable, but do not loosen it before the unsupported-positive-claim guard is fixed.

## Bottom Line

This run is not a total failure, but it is not a clean demo-quality system yet. The biggest quality lift should come from tightening source-less/direct RAG, adding direct-evidence checks for operational claims, and improving Skill phrase/facet coverage. More Skills alone will help recall, but it will not fix wrong-facet Skill answers unless the matching and template behavior are cleaned up together.
