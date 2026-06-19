# YİÜ Same-Seed Random 100 Comparison

Run: `2026-06-19T07-55-33-843Z`  
Seed: `yiu-program-facts-random-100-2026-06-18-c`  
Base URL: `https://app.askqualy.com`  
Compared with: `2026-06-19T06-32-12-885Z`

## Summary

| Metric | Previous | Latest | Delta |
|---|---:|---:|---:|
| Completed | 100 | 100 | 0 |
| Errors | 0 | 0 | 0 |
| Skill answers | 38 | 35 | -3 |
| Grounded RAG | 29 | 32 | +3 |
| No-info | 22 | 22 | 0 |
| Clarification | 7 | 7 | 0 |
| Average latency | 11.1s | 11.9s | +0.8s |
| p90 latency | 17.0s | 18.6s | +1.6s |

`27/100` questions changed route or selected Skill. Raw answer text changed in `49/100` cases.

## Clear Improvements

- `Ebelik kontenjanı nedir?`: false no-info -> correct `ebelik_program_bilgileri` Skill.
- `ftr var mı`: RAG -> correct FTR program Skill.
- `Başarı sıralamaları nedir?`: wrong single-program Tıp Skill -> program clarification.
- `Psikoloji bölümü var mı?`: wrong broad academic-unit Skill -> safe no-info.
- `Şehit ve gazi yakınlarına burs var mı?`: RAG -> relevant burs/indirim Skill.
- `Beceri laboratuvarı var mı?`: broad Tıp overview Skill -> directly supported FAQ RAG answer.
- `hasta başı eğitim varmı`: generic education-model Skill -> directly supported Tıp yönergesi answer.
- `Kayıt sırasında ne kadar ödeme yapmam gerekiyor?`: no-info -> required program clarification.
- `Dolmuşla ulaşım var mı?` and `Staj sırasında yemek veya ulaşım karşılanıyor mu?`: potentially inferred RAG answers -> safer no-info.

## Clear Regressions

- `grafik tasarım kaç para`: correct Grafik Tasarım program Skill -> false no-info, despite the live Skill containing the exact 2025 fee.
- `Hastanede öğrenci dinlenme alanı var mı?`: no-info -> unrelated student-life Skill; the answer does not address a hospital rest area.
- `Laboratuvarlar yeni mi?`: no-info -> Tıp overview Skill saying laboratories are modern; “modern” does not prove “new”.
- `Devlet hastanesinde staj yapabilir miyim?`: clarification -> Tıp intörnlük Skill; the answer does not say whether a state-hospital placement is possible.
- `Üniversitenizde hangi fakülteler var?`: broad academic-unit Skill -> RAG answer that omits Spor Bilimleri Fakültesi.
- `Yüksek İhtisas Üniversitesi hakkında bilgi verir misin?`: direct university overview Skill -> broad RAG answer.
- `Afiliye hastane ne demek?`: useful grounded explanation -> no-info.
- `En kötü bölümünüz hangisi?`: no-info -> unsupported statement that every department meets quality standards.

## RAG Accuracy Risks

The latest run still contains unsupported or over-inferred positive claims:

- `Tıp öğrencileri hangi hastanede eğitim görüyor?`: claims students train in the university's own Health Application and Research Center.
- `Anestezi cihazı uygulaması yapılıyor mu?`: turns graduate competency/job-description text into proof of actual device practice.
- `Tıbbi Laboratuvar programı için laboratuvar var mı?`: infers laboratory facilities from fields where graduates may work.
- `Afiliye hastanede acil servis var mı?`: asserts the affiliated hospital has an emergency service from adjacent student-emergency guidance.

These are answer/evidence verifier problems rather than Skill-description problems.

## Diagnosis

The routing metadata change is directionally useful:

- It fixed the known Ebelik false no-info.
- It stopped some broad questions from collapsing into a single-program Skill.
- It improved shorthand program routing such as `ftr var mı`.

However, the matching path is now too selective in at least one obvious case (`grafik tasarım kaç para`) and still accepts nearby-topic Skills in several cases. The fallback message metadata does not currently retain the Skill candidate/verifier trace, so the Grafik Tasarım miss cannot yet be separated into semantic-candidate failure versus verifier rejection from this artifact alone.

## Conclusion

This is not yet a net quality win. Skill precision improved for some broad/unsupported matches, but recall regressed on a supported fee fact and RAG over-inference remains the larger correctness risk. The next focused work should be:

1. Persist Skill candidate and verifier diagnostics on fallback/RAG bot messages.
2. Investigate the Grafik Tasarım fee miss using that trace.
3. Tighten the RAG answer/evidence verifier against facility, hospital, and practice claims inferred from curriculum or career text.

