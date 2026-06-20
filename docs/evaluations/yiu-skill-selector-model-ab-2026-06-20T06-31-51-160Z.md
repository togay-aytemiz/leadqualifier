# YİÜ Skill Selector Controlled Model A/B

- Frozen payload: `docs/evaluations/yiu-skill-selector-frozen-payloads-2026-06-20.json`
- Transport: `curl-transport`
- Repeats per case/config: `3`
- Decision: `switch_to_gpt-5.5-none`

| Config | Exact accuracy | False Skills | Positive recall | p50 ms | p90 ms | Avg tokens | Gate |
|---|---:|---:|---:|---:|---:|---:|---|
| gpt-4.1-mini | 86.7% | 4 | 100.0% | 2121 | 2965 | 9351 | FAIL |
| gpt-5.5-none | 100.0% | 0 | 100.0% | 3236 | 3880 | 9363 | PASS |
| gpt-5.5-low | 100.0% | 0 | 100.0% | 3501 | 4280 | 9363 | PASS |

## Non-exact runs

| Config | Case | Repeat | Selected | Reason/Error |
|---|---|---:|---|---|
| gpt-4.1-mini | focused-2 | 1 | local:tip_turkce_program_bilgileri | Bu Skill, Yüksek İhtisas Üniversitesi Tıp Fakültesi (Türkçe) programının 2024 başarı sıralarını ve kontenjan bilgilerini doğrudan vermektedir. Kullanıcının programların başarı sıralarını sorması ile tam örtüşmektedir ve kapsamı başarı sıralarını içermektedir. |
| gpt-4.1-mini | focused-2 | 2 | local:bilgisayar_programciligi_program_bilgileri | Bu Skill, Yüksek İhtisas Üniversitesi Bilgisayar Programcılığı programının 2024 başarı sırası verilerini kapsamaktadır. Kullanıcının genel 'başarı sıralamaları nedir?' sorusuna, özel bir program için başarı sıralarının verildiği en açıklayıcı yanıttır ve doğrudan soruyu yanıtlamaktadır. |
| gpt-4.1-mini | focused-2 | 3 | local:tip_turkce_program_bilgileri | The user asked about the success rankings (başarı sıralamaları) for Yüksek İhtisas Üniversitesi programs. The Tıp Fakültesi (Türkçe) program information includes exact 2024 başarı sırası (success rank) data among the other admission criteria, specifically addressing başarı sıralaması for one of the university's main programs. This skill provides direct and detailed information on success rankings for that program, matching the entity, scope, and facet exactly. |
| gpt-4.1-mini | focused-5 | 3 | local:tip_intornluk | The user is asking about the possibility of doing an internship (staj) at a state hospital, which is directly addressed by the 'tip_intornluk' skill that explains the internship (intörn hekimlik) phase in the 6th year of medical faculty education, involving clinical practice in a hospital setting. This skill directly covers the scope of clinical internship availability and related information. |
