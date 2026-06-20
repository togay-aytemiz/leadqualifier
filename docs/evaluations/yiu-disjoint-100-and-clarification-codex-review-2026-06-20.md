# YİÜ Disjoint 100 + Clarification Codex Review

**Date:** 2026-06-20
**Status:** Blocked by OpenAI API quota; not a valid full-system quality score

## Executive Result

The experiment selection was valid, but most model-dependent responses were not:

- source pool: 508;
- excluded prior-seed rows: 100;
- remaining candidate pool: 408;
- newly selected routing rows: 100;
- overlap with the prior 100: 0;
- request/HTTP harness errors: 0;
- valid non-RAG observations: 21 (20 Skill, 1 assistant identity);
- invalid File Search observations: 79/100;
- invalid clarification observations: 20/20 first turns;
- confirmed provider error: HTTP 429 `insufficient_quota`;
- observed routing latency: average 7.7 s, p50 8.6 s, p90 9.4 s, but this is dominated by failed OpenAI calls and is not representative of healthy answer latency.

The visible `Şu anda bilgi kaynağına erişemiyorum` replies are temporary infrastructure fallbacks. They must not be scored as correct or incorrect knowledge-base `no_info` decisions.

## Root Cause Evidence

Live Netlify logs for a reproduced File Search request showed both the skill query rewrite and one-step File Search call reaching OpenAI and returning:

- HTTP status: 429;
- error type/code: `insufficient_quota`;
- message: current quota exceeded.

This is quota/credit exhaustion, not an RPM/TPM rate limit, timeout, authentication failure, or retrieval miss.

The original evaluation harness also classified every `rag_file_search.failure_reason` as `rag_no_info`. The harness is now changed so these outcomes are reported as `rag_pipeline_error` and excluded from valid-response counts.

## Valid Skill and Identity Review

All 21 non-File-Search rows were read manually. “Partial” means the selected domain was defensible and the response stayed safe, but it did not directly finish the asked facet.

| Run row | Pool | Question | Route / Skill | Codex verdict | Notes |
|---:|---:|---|---|---|---|
| 3 | 66 | Hemşirelik ücreti ne kadar? | Hemşirelik ücret/kontenjan | Correct | Correct program and current stored fee variants; more detail than requested. |
| 4 | 32 | Bilgisayar Programcılığı var mı? | Bilgisayar Programcılığı program bilgileri | Correct | Correct existence and program facts. |
| 6 | 67 | Ebelik ücreti ne kadar? | Ebelik program bilgileri | Correct | Correct program and fee variants. |
| 12 | 21 | Sağlık Bilimleri Fakültesinde hangi bölümler var? | SBF programları | Correct | Correct faculty list and score-type distinction. |
| 25 | 37 | Ameliyathane Hizmetleri var mı? | Ameliyathane ücret/kontenjan | Correct | Correct existence and program facts. |
| 26 | 218 | Kampüsten hastaneye servis var mı? | Ulaşım bilgisi | Partial, safe | Correct transport domain, but gives addresses/current-notice caveat instead of answering service availability. |
| 32 | 154 | SAY puan türüyle hangi bölümler var? | SBF programları | Correct | Includes Tıp and the SAY SBF programs; excludes EA Sağlık Yönetimi. |
| 35 | 422 | tıp hastane kaçıncı sınıf | Tıp eğitim modeli | Correct | Answers clinical/hospital phase as Dönem IV–VI. |
| 38 | 281 | 100. Yıl Yerleşkesine nasıl giderim? | Ulaşım bilgisi | Partial, safe | Provides the address, not an actual public-transport/direction answer. |
| 51 | 108 | İlk 10.000’e girene burs var mı? | YKS üstün başarı bursu | Correct | Directly answers the relevant burs bracket. |
| 53 | 276 | Kampüsler arası servis var mı? | Ulaşım bilgisi | Partial, safe | Correct domain and no unsupported claim, but does not answer whether a service exists. |
| 64 | 502 | Sen öğrenci misin? | Assistant identity | Correct | Clearly identifies itself as an AI assistant. |
| 67 | 137 | İlk ve Acil Yardım kontenjanı kaç? | İlk ve Acil Yardım ücret/kontenjan | Correct | Correct program and quota variants. |
| 68 | 9 | Lisans ve ön lisans programlarını ayrı ayrı listeler misin? | Akademik birimler genel | Correct | Correctly separates degree levels. |
| 71 | 246 | Mavi diploma veriyor musunuz? | Diploma/diploma eki | Partial, safe | Avoids an unsupported international-validity guarantee but does not directly confirm the requested provision. |
| 73 | 416 | Hazırlık sınıfı var mı? | Tıp hazırlık | Wrong routing behavior | The program is missing; it assumes a Tıp context instead of asking which program. |
| 74 | 77 | Tıbbi Laboratuvar Teknikleri ücreti nedir? | Tıbbi Laboratuvar ücret/kontenjan | Correct | Correct program and fee variants. |
| 77 | 76 | Ameliyathane Hizmetleri ücreti nedir? | Ameliyathane ücret/kontenjan | Correct | Correct program and fee variants. |
| 83 | 384 | Kayıt tarihleri ne zaman? | Kayıt işlemleri | Partial, safe | Returns a document checklist and says dates come from the yearly announcement; it does not give dates. |
| 93 | 260 | Kampüs içinde yurt var mı? | Konaklama/yurt | Partial, safe | No unsupported promise, but it does not directly settle on-campus dorm existence. |
| 97 | 379 | Kayıt nasıl yapılır? | Kayıt işlemleri | Correct | Useful local YKS registration flow and correctly requests registration type for variants. |

Aggregate for the 20 Skill replies:

- correct Skill/domain match: 19/20;
- fully correct/useful answer: 13/20;
- partial but safely bounded answer: 6/20;
- wrong routing behavior: 1/20;
- unsupported factual positive: 0/20.

The assistant-identity row was correct.

## Invalid Routing Rows Reviewed

The following 79 rows were individually checked in the raw artifact. Every one has `rag_file_search.failure_reason = pipeline_error`, no answer status, no retrieval diagnostics, and the same temporary-unavailable reply. Therefore each verdict is `INVALID_API_QUOTA`, not `no_info`:

1(#372), 2(#507), 5(#298), 7(#215), 8(#146), 9(#227), 10(#114), 11(#308), 13(#234), 14(#149), 15(#186), 16(#261), 17(#6), 18(#355), 19(#430), 20(#92), 21(#156), 22(#293), 23(#250), 24(#229), 27(#151), 28(#445), 29(#258), 30(#91), 31(#309), 33(#499), 34(#10), 36(#395), 37(#465), 39(#41), 40(#160), 41(#306), 42(#360), 43(#354), 44(#29), 45(#230), 46(#297), 47(#147), 48(#171), 49(#226), 50(#451), 52(#257), 54(#183), 55(#483), 56(#124), 57(#109), 58(#290), 59(#495), 60(#419), 61(#87), 62(#363), 63(#16), 65(#248), 66(#400), 69(#75), 70(#349), 72(#12), 75(#328), 76(#402), 78(#272), 79(#462), 80(#210), 81(#191), 82(#320), 84(#303), 85(#214), 86(#494), 87(#102), 88(#398), 89(#482), 90(#179), 91(#407), 92(#94), 94(#251), 95(#245), 96(#204), 98(#447), 99(#263), 100(#493).

Several of these would clearly have been important routing checks if the API were healthy, including `Tıp Fakülteniz var mı?` (#16), `İlk ve Acil Yardım programı ücreti ne kadar?` (#75), `Tıbbi Görüntüleme Teknikleri var mı?` (#41), campus, dorm, internship, hospital, and registration-policy questions. No quality inference is made from their fallback replies.

## Clarification Review

All 20 first messages were realistic under-specified prospective-student questions, and every configured short reply supplied only the intended missing slot. Examples include `anestezi`, `burslu İngilizce tıp`, `YKS ile yeni kayıt`, and `kız öğrenci`.

All 20 live first turns returned the same quota-driven pipeline fallback. The affected case IDs are:

1(program-fee), 2(program-score), 3(program-ranking), 4(program-duration), 5(program-campus), 6(program-internship), 7(program-quota), 8(program-prep), 9(program-accreditation), 10(program-lab), 11(program-practice-start), 12(program-attendance), 13(program-payment), 14(discount-type), 15(registration-type), 16(registration-documents), 17(dorm-type), 18(career-outcome), 19(transfer-type), 20(programs-by-score-type).

Because the first turns were infrastructure failures, the harness correctly did not inject a second user reply or fabricate pending state. Clarification quality and second-turn binding remain unmeasured.

There is also a separate architecture finding: the current one-step File Search JSON schema permits only `answer`, `no_info`, and `refuse`. The query rewriter calculates `needsClarification`, but the demo route does not branch on that field before candidate selection/File Search. Consequently a healthy rerun alone is unlikely to produce the intended `rag_clarify` behavior; that behavior needs an explicit routing decision and a clarification response contract.

## Next Action

1. Restore API credit or raise the active project spend limit.
2. Confirm one healthy non-Skill request no longer records `failure_reason` and returns File Search diagnostics.
3. Rerun the same disjoint selection so the valid Skill observations remain comparable and the 79 invalid rows are replaced.
4. Decide whether clarification should be emitted by the query normalizer/router or added to the one-step File Search contract; then rerun the fixed 20-case conversation suite.

No production routing or prompt tuning was performed during this measurement.
