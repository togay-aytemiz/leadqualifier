# YİÜ Realistic Prospective-student Clarification Eval

> **INVALID RUN — DO NOT USE AS A CLARIFICATION SCORE.** OpenAI returned HTTP 429 `insufficient_quota` on every first turn, so none of the 20 conversations reached a valid routing decision or second turn. See `yiu-disjoint-100-and-clarification-codex-review-2026-06-20.md`.

Run: 2026-06-20T10-50-12-738Z
Base URL: https://app.askqualy.com
Demo slug: yiu-tanitim-gunleri-2026
Cases: 20
Average turn latency: 9.4s
p90 turn latency: 9.7s

## Status Counts

| Status | Count |
|---|---:|
| first_not_clarification | 20 |

## Raw Conversations

| # | Case | First message | Expected subject | Expected facet | First route | First answer | Short reply | Second route | Skill | Second answer | Status | Error |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | program-fee | ücreti ne kadar acaba | Anestezi | ücret | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | anestezi | - | - |  | first_not_clarification |  |
| 2 | program-score | puanı kaçla kapatmış | İngilizce Tıp burslu | taban puan | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | burslu İngilizce tıp | - | - |  | first_not_clarification |  |
| 3 | program-ranking | başarı sırası kaç peki | Anestezi burslu | başarı sırası | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | anestezi burslu | - | - |  | first_not_clarification |  |
| 4 | program-duration | kaç yıl sürüyor | Fizyoterapi ve Rehabilitasyon | eğitim süresi | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | fizyoterapi ve rehabilitasyon | - | - |  | first_not_clarification |  |
| 5 | program-campus | hangi kampüste okuyacağım | Hemşirelik | kampüs | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | hemşirelik | - | - |  | first_not_clarification |  |
| 6 | program-internship | staj işi nasıl oluyor | Ergoterapi | staj ve uygulama | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | ergoterapi | - | - |  | first_not_clarification |  |
| 7 | program-quota | kontenjan kaç kişi | Dil ve Konuşma Terapisi burslu | kontenjan | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | dil ve konuşma terapisi burslu | - | - |  | first_not_clarification |  |
| 8 | program-prep | hazırlık okumam gerekiyor mu | İngilizce Tıp | hazırlık | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | İngilizce tıp | - | - |  | first_not_clarification |  |
| 9 | program-accreditation | akreditasyonu var mı | Tıp Fakültesi | akreditasyon | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | tıp fakültesi | - | - |  | first_not_clarification |  |
| 10 | program-lab | laboratuvar imkanı nasıl | Tıbbi Laboratuvar Teknikleri | laboratuvar ve uygulama olanakları | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | tıbbi laboratuvar teknikleri | - | - |  | first_not_clarification |  |
| 11 | program-practice-start | uygulamalar ne zaman başlıyor | Ebelik | uygulama başlangıcı | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | ebelik | - | - |  | first_not_clarification |  |
| 12 | program-attendance | devamsızlık sınırı kaç | Hemşirelik uygulaması | devam zorunluluğu | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | hemşirelik uygulaması | - | - |  | first_not_clarification |  |
| 13 | program-payment | ödemeyi nasıl yapıyoruz | Anestezi ücretli | ödeme seçenekleri | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | anestezi ücretli | - | - |  | first_not_clarification |  |
| 14 | discount-type | indirim oranı ne kadar | Birinci tercih indirimi | indirim oranı | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | birinci tercih indirimi | - | - |  | first_not_clarification |  |
| 15 | registration-type | kayıt için ne yapmam lazım | YKS yeni kayıt | kayıt süreci | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | YKS ile yeni kayıt | - | - |  | first_not_clarification |  |
| 16 | registration-documents | hangi belgeleri getireceğim | Uluslararası öğrenci kaydı | kayıt belgeleri | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | uluslararası öğrenci kaydı | - | - |  | first_not_clarification |  |
| 17 | dorm-type | hangi yurda başvurabilirim | Kız öğrenci yurdu | yurt seçeneği | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | kız öğrenci | - | - |  | first_not_clarification |  |
| 18 | career-outcome | bitirince ne iş yapıyorum | Grafik Tasarım | kariyer olanakları | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | grafik tasarım | - | - |  | first_not_clarification |  |
| 19 | transfer-type | geçiş yapabilir miyim | Yatay geçiş | geçiş koşulları | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | yatay geçiş | - | - |  | first_not_clarification |  |
| 20 | programs-by-score-type | hangi bölümleri tercih edebilirim | TYT programları | program seçenekleri | rag_no_info | Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin. | TYT puanıyla | - | - |  | first_not_clarification |  |
