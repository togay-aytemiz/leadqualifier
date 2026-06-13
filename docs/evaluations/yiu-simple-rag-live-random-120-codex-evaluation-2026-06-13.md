# YİÜ Simple RAG Live Random 120 — Codex Evaluation

**Run date:** 2026-06-13  
**Target:** Production Public Demo Chat (`https://app.askqualy.com/tr/demo/yiu-tanitim-gunleri-2026`)  
**Sample:** 120 reproducible random questions from the 508-question pool; the previous random-100 IDs were excluded.  
**Evaluator:** Codex manual review. No automated LLM judge was used.

> **Incident baseline:** This evaluation measures production before the 2026-06-13 retrieval recovery. Message metadata and a direct Vector Store Search request later confirmed the configured store had expired; every apparent knowledge miss was downstream of that operational outage unless the turn ended in clarification before search.

## Executive Summary

- Average score: **3.36 / 10**
- Pass: **30**
- Warning/partially acceptable: **10**
- Fail: **80**
- Substantive answers: **0 / 120**
- Exact no-info fallbacks: **95 / 120**
- Clarification questions: **25 / 120**
- Runtime/API errors: **0**

The live service completed every request, but it did not produce a single substantive knowledge-base answer. Subsequent diagnostics confirmed the systemic cause: OpenAI returned `400 Vector store ... has expired`, while the simple pipeline converted that exception into the ordinary no-information copy. The system therefore looked cautious rather than operationally broken. Clarifications also lacked the demo's organization context, producing unnecessary “which university?” questions.

## Rubric

- **9–10:** Correct, direct, well-grounded answer.
- **7–8:** Safe and appropriate answer/clarification; minor usefulness gap.
- **5–6:** Truthful but materially incomplete or weakly handled.
- **3–4:** Mostly unhelpful, wrong clarification, or poor handling.
- **1–2:** Basic available fact missed, context ignored, or answer failed.

## Problem Categories

- `available_fact_missed`: 56
- `appropriate_no_info`: 22
- `unnecessary_clarification`: 10
- `incomplete_safe`: 9
- `good_clarification`: 7
- `poor_subjective_handling`: 4
- `missed_clarification`: 3
- `wrong_clarification`: 3
- `language_mismatch`: 3
- `missed_advisory_answer`: 1
- `out_of_scope_handling`: 1
- `identity_question_failed`: 1

## Key Findings

1. **Retrieval is effectively non-functional in production.** 95 answers are exact no-info fallbacks and 25 are clarification questions; zero answers contain retrieved facts.
2. **Basic catalog facts are missed.** The bot cannot answer whether programs exist, their fees/quotas, campus-program mappings, scholarships, or registration rules even though these were answered from the same corpus in earlier runs.
3. **Organization context is frequently lost.** It asks “which university/institution?” inside a university-specific demo channel.
4. **Clarification quality is mixed.** Ambiguous questions such as “Maket var mı?” and “Hangi kampüs?” are handled sensibly, while already-specified details such as “SAY” are asked again.
5. **No-info is sometimes correct.** Hospital facility details, future hospital plans, parking, current menus, device micro-details, and unadvertised discounts should not be invented. Those cases received passing scores despite the terse fallback.
6. **Language consistency regressed.** Three Turkish questions received English fallback/clarification text.

## Full Manual Evaluation

| ID | Question | Live answer | Score | Verdict | Category | Codex evaluation |
|---:|---|---|---:|---|---|---|
| 5 | Üniversitenin kurucu vakfı kimdir? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Kurucu vakıf kaynaklarda mevcut; doğrudan cevap kaçırılmış. |
| 7 | Üniversitenizde hangi fakülteler var? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Akademik birim listesi temel ve kaynaklarda mevcut. |
| 9 | Üniversitenizde lisans ve ön lisans programlarını ayrı ayrı listeler misin? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Lisans ve ön lisans program listeleri kaynaklarda mevcut. |
| 11 | Üniversitenin avantajları nelerdir? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 2 | fail | `available_fact_missed` | Geniş bir soru olsa da kaynaklardan özetlenebilecek avantajlar var. |
| 14 | Kampüs yaşamı hakkında bilgi verir misin? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 2 | fail | `available_fact_missed` | Kampüs yaşamına ilişkin kaynaklı, temkinli bir özet üretilebilirdi. |
| 18 | İngilizce Tıp var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | İngilizce Tıp programının varlığı açık bir katalog bilgisidir. |
| 25 | Ergoterapi bölümü var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Ergoterapi programının varlığı açıkça doğrulanabilir. |
| 34 | Elektrik programı var mı? | Hangi alanda veya kurumda elektrik programı arıyorsunuz? | 1 | fail | `unnecessary_clarification` | Demo kurumu ve program bağlamı belli; Elektrik programı doğrudan aranmalıydı. |
| 37 | Ameliyathane Hizmetleri var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Ameliyathane Hizmetleri programı kaynaklarda mevcut. |
| 39 | Tıbbi Laboratuvar Teknikleri var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Tıbbi Laboratuvar Teknikleri programı kaynaklarda mevcut. |
| 47 | Hukuk Fakülteniz var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 6 | warn | `incomplete_safe` | Hukuk fakültesi listede görünmüyorsa bunu açıkça söylemek, genel no-info'dan daha iyi olurdu. |
| 49 | Psikoloji bölümü var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 6 | warn | `incomplete_safe` | Olmayan bölümü uydurmaması doğru; program listesine dayanarak daha net yanıt verebilirdi. |
| 52 | Yazılım Mühendisliği var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 6 | warn | `incomplete_safe` | Yazılım Mühendisliği görünmüyor; yakın program ayrımıyla yararlı cevap verilebilirdi. |
| 57 | Eczane Hizmetleri okuyan eczacı olur mu? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Eczane teknikeri ile eczacı unvanı ayrımı kaynaklı biçimde cevaplanabilir. |
| 59 | Sağlık Yönetimi mezunları nerelerde çalışır? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Programın çalışma alanları kaynaklarda açıklanıyor. |
| 63 | Türkçe Tıp ücreti ne kadar? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Türkçe Tıp ücret tablosu kaynaklarda mevcut. |
| 66 | Hemşirelik ücreti ne kadar? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Hemşirelik ücret tablosu kaynaklarda mevcut. |
| 68 | Beslenme ve Diyetetik ücreti nedir? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Beslenme ve Diyetetik ücret tablosu kaynaklarda mevcut. |
| 76 | Ameliyathane Hizmetleri ücreti nedir? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Ameliyathane Hizmetleri ücret tablosu kaynaklarda mevcut. |
| 82 | Grafik Tasarım ücreti nedir? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Grafik Tasarım ücret tablosu kaynaklarda mevcut. |
| 85 | Ücretler peşin mi ödeniyor? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Ödeme ve taksit bilgisi kaynaklarda bulunuyor. |
| 88 | Kayıt sırasında ne kadar ödeme yapmam gerekiyor? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 7 | pass | `appropriate_no_info` | Kayıt anındaki asgari ödeme tutarı belgelerde net değil; uydurmaması doğru, yönlendirme eksik. |
| 98 | Burs imkanlarınız nelerdir? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Burs türleri kaynaklarda ayrıntılı biçimde mevcut. |
| 106 | İlk 500’e girersem burs alır mıyım? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | İlk 500 başarı bursu koşulu kaynaklarda mevcut. |
| 110 | Akademik başarı bursu nedir? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Akademik başarı bursunun tanımı kaynaklarda mevcut. |
| 116 | Annem mezun, bana indirim var mı? | Annenizin mezun olduğu kurum veya program nedir? | 7 | pass | `good_clarification` | Mezun olunan kurum belirtilmediği için kurum sorması makul. |
| 126 | Tıp Fakültesi kontenjanı kaç? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Tıp kontenjanları kaynak tablosunda mevcut. |
| 127 | Türkçe Tıp kontenjanı kaç? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Türkçe Tıp kontenjanı açıkça bulunabilir. |
| 131 | Beslenme ve Diyetetik kontenjanı kaç? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Beslenme ve Diyetetik kontenjanı kaynaklarda mevcut. |
| 132 | Dil ve Konuşma Terapisi kontenjanı kaç? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Dil ve Konuşma Terapisi kontenjanı kaynaklarda mevcut. |
| 139 | Tıbbi Laboratuvar Teknikleri kontenjanı kaç? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Tıbbi Laboratuvar Teknikleri kontenjanı kaynaklarda mevcut. |
| 141 | Grafik Tasarım kontenjanı nedir? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Grafik Tasarım kontenjanı kaynaklarda mevcut. |
| 149 | Burslu kontenjanla ücretli kontenjan arasındaki fark nedir? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Burslu ve ücretli kontenjan ayrımı temel ve cevaplanabilir. |
| 151 | Sağlık alanında okumak istiyorum, hangi bölümleri önerirsiniz? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 2 | fail | `missed_clarification` | İlgi, puan ve kariyer hedefini sorarak programları daraltmalıydı. |
| 154 | SAY puan türüyle hangi bölümler var? | Hangi puan türüyle ilgili bilgi almak istiyorsunuz? Örneğin, TYT, AYT, YDT gibi puan türlerinden hangisi? | 1 | fail | `wrong_clarification` | Kullanıcı SAY puan türünü zaten belirtti; aynı bilgiyi yeniden soruyor. |
| 161 | Hastanede çalışmak istiyorum, hangi programı seçmeliyim? | Hastanede çalışmak istediğiniz alan veya pozisyon nedir? Örneğin hemşirelik, doktorluk, sağlık teknikerliği gibi spesifik bir alan var mı? | 8 | pass | `good_clarification` | Hastanedeki hedef rolü sormak doğru ve yararlı bir netleştirme. |
| 173 | Ailem hemşirelik istiyor ama ben istemiyorum, ne yapmalıyım? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `missed_advisory_answer` | Bilgi araması yerine empatik yönlendirme ve tercih danışmanlığı sunmalıydı. |
| 178 | Sağlık bölümü öğrencileri uygulama eğitimini nerede yapıyor? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 2 | fail | `available_fact_missed` | Program bazlı uygulama ve klinik eğitim kaynaklarından temkinli cevap üretilebilirdi. |
| 182 | Afiliye hastaneniz hangi şehirde? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 7 | pass | `appropriate_no_info` | Afiliye hastane adı ve şehir eşleşmesi kaynaklarda yeterince net değil; uydurmaması doğru. |
| 184 | Afiliye hastane özel mi devlet hastanesi mi? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 8 | pass | `appropriate_no_info` | Hastanenin özel/devlet statüsü açık kanıt olmadan söylenmemeli. |
| 190 | Klinik eğitim hangi dönemde başlıyor? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Tıp klinik dönemleri ve intörnlük kaynaklarda açıklanıyor. |
| 202 | Afiliye hastanede yoğun bakım var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 8 | pass | `appropriate_no_info` | Yoğun bakım altyapısı açık kaynakla doğrulanmadan iddia edilmemeli. |
| 203 | Afiliye hastanede ameliyathane var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 8 | pass | `appropriate_no_info` | Ameliyathane altyapısı açık kaynakla doğrulanmadan iddia edilmemeli. |
| 204 | Afiliye hastanede doğumhane var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 8 | pass | `appropriate_no_info` | Doğumhane altyapısı açık kaynakla doğrulanmadan iddia edilmemeli. |
| 206 | Afiliye hastanede dahili ve cerrahi branşlar var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 7 | pass | `appropriate_no_info` | Branş listesi net kanıt gerektiriyor; yönlendirme eklenebilirdi. |
| 207 | Öğrenciler hasta başı eğitim yapabiliyor mu? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Hasta başı eğitime ilişkin klinik eğitim bilgisi kaynaklarda mevcut. |
| 210 | Öğrenciler gerçek hasta görüyor mu? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Gerçek hasta ile denetimli uygulama kaynaklardan açıklanabilir. |
| 213 | Klinik uygulamada öğrenci başına düşen hasta sayısı nedir? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | İntörn eğitimindeki oran bilgisi kaynaklarda mevcut. |
| 216 | Hastanede öğrenci dinlenme alanı var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 8 | pass | `appropriate_no_info` | Öğrenci dinlenme alanı gibi mikro bir imkan kanıtsız söylenmemeli. |
| 225 | Kendi hastanenizi ne zaman kuracaksınız? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 8 | pass | `appropriate_no_info` | Gelecekteki hastane açılış tarihi uydurulmamalı. |
| 226 | Kendi hastaneniz kurulacak mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 8 | pass | `appropriate_no_info` | Kendi hastanesi projesi hakkında doğrulanmış bilgi yoksa spekülasyon yapılmamalı. |
| 230 | Hastane yoksa tıp eğitimi nasıl veriliyor? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Afiliye/anlaşmalı kurumlarla klinik eğitim modeli açıklanabilirdi. |
| 235 | Ön lisans programlarınız akredite mi? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 8 | pass | `appropriate_no_info` | Ön lisans akreditasyonu program bazında kanıt gerektirir. |
| 240 | Diplomamız yurtdışında geçiyor mu? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Yurt dışı tanınma ve denklik ayrımı temkinli biçimde açıklanabilirdi. |
| 241 | Diplomam Avrupa’da geçerli mi? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Avrupa tanınması, Diploma Eki ve ülke bazlı denklik ayrımı cevaplanabilir. |
| 251 | Diplomanız devlet üniversitesi diplomasıyla aynı geçerlilikte mi? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | YÖK tanınırlığı ve vakıf/devlet diploması geçerliliği açıklanabilirdi. |
| 252 | Mezun olunca KPSS’ye girebilir miyim? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Mezuniyet sonrası KPSS hakkı genel çerçevede cevaplanabilir. |
| 255 | Üniversite iş garantisi veriyor mu? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 5 | warn | `incomplete_safe` | İş garantisi uydurmaması doğru; açıkça garanti verilmediğini söylemeliydi. |
| 256 | Yurt var mı? | Hangi bölgede veya şehirde yurt arıyorsunuz? | 2 | fail | `unnecessary_clarification` | Demo üniversitesi Ankara bağlamı belli; üniversitenin yurt imkanını cevaplamalıydı. |
| 262 | Yakınlarda devlet yurdu var mı? | Hangi şehir veya bölge için devlet yurdu arıyorsunuz? | 2 | fail | `unnecessary_clarification` | Kampüs/şehir bağlamı demo kanalından biliniyor; aynı bağlam yeniden sorulmamalıydı. |
| 269 | Şehir dışından gelen öğrenciler nerede kalıyor? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 2 | fail | `available_fact_missed` | Konaklama ve anlaşmalı/özel yurt yönlendirmesi kaynaklardan verilebilirdi. |
| 271 | Kampüs çevresinde kiralık ev bulmak kolay mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 7 | pass | `appropriate_no_info` | Kiralık ev piyasasının kolaylığı doğrulanabilir sabit bir kurum bilgisi değil; yönlendirme eksik. |
| 286 | Otobüsle ulaşım var mı? | Hangi yer veya bölge için otobüsle ulaşım olup olmadığını öğrenmek istiyorsunuz? | 2 | fail | `unnecessary_clarification` | Üniversite/kampüs bağlamı belli; ulaşım bilgisini aramalıydı. |
| 288 | Kampüs merkezi bir yerde mi? | Hangi kampüsten bahsettiğinizi belirtir misiniz? | 8 | pass | `good_clarification` | Birden fazla yerleşke olduğu için hangi kampüsün sorulduğunu netleştirmek doğru. |
| 290 | Hangi bölüm hangi kampüste? | Hangi üniversite veya kurumun bölümlerini ve kampüslerini öğrenmek istiyorsunuz? | 1 | fail | `unnecessary_clarification` | Hangi üniversite olduğu demo kanalından belli; bölüm-kampüs eşleşmesi kaynaklarda mevcut. |
| 294 | Balgat Yerleşkesinde hangi bölümler var? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Balgat Yerleşkesi program listesi kaynaklarda mevcut. |
| 295 | Bağlum Yerleşkesinde hangi bölümler var? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Bağlum Yerleşkesi program listesi kaynaklarda mevcut. |
| 301 | Maket var mı? | Hangi konuda veya ürün için maket istediğinizi belirtir misiniz? | 8 | pass | `good_clarification` | 'Maket' tek başına belirsiz; ne tür maket kastedildiğini sorması doğru. |
| 304 | Beceri laboratuvarı var mı? | Hangi konuda veya hangi kurumda beceri laboratuvarı olup olmadığını öğrenmek istiyorsunuz? | 2 | fail | `unnecessary_clarification` | Kurum demo bağlamından belli; beceri laboratuvarı bilgisi aranmalıydı. |
| 313 | Her öğrenciye bir mikroskop düşüyor mu? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Mikroskop başına öğrenci bilgisi kaynaklarda mevcut. |
| 314 | Öğrenciler mikroskobu bireysel mi kullanıyor grup halinde mi? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 6 | warn | `incomplete_safe` | Bireysel/grup kullanımını kesinleştirecek kanıt sınırlı; mevcut mikroskop oranını paylaşabilirdi. |
| 316 | Öğrenci başına düşen cihaz sayısı nedir? | Hangi okul, bölge veya ülke için öğrenci başına düşen cihaz sayısını öğrenmek istiyorsunuz? | 3 | fail | `wrong_clarification` | Cihaz türünü sorması gerekirken okul, bölge veya ülke soruyor; kurum zaten belli. |
| 319 | Anestezi cihazı uygulaması yapılıyor mu? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 2 | fail | `available_fact_missed` | Anestezi programının uygulama kapsamı kaynaklardan temkinli açıklanabilirdi. |
| 336 | Vejetaryen yemek var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 8 | pass | `appropriate_no_info` | Güncel vejetaryen menü bilgisi doğrulanmadan söylenmemeli. |
| 337 | Kampüste spor salonu var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 8 | pass | `appropriate_no_info` | Spor salonu tesisi açık kanıt olmadan var denmemeli. |
| 343 | Spor kulüpleri var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 2 | fail | `available_fact_missed` | Öğrenci kulüpleri/toplulukları kaynaklarından spor kulüpleri aranabilirdi. |
| 344 | Kampüste etkinlik yapılıyor mu? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 2 | fail | `available_fact_missed` | Etkinlik ve öğrenci topluluğu kaynaklarından yararlı cevap üretilebilirdi. |
| 345 | Kampüs güvenli mi? | Hangi kampüsten bahsediyorsunuz? | 8 | pass | `good_clarification` | Birden fazla kampüs olduğu için hangi kampüsün kastedildiğini sormak makul. |
| 347 | Kampüste otopark var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 8 | pass | `appropriate_no_info` | Otopark gibi tesis detayı kanıtsız söylenmemeli. |
| 348 | Kampüste kedi var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 9 | pass | `appropriate_no_info` | Kampüsteki hayvanlar gibi doğrulanmamış mikro bir detayı uydurmaması doğru. |
| 349 | Yaz stajı var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Yaz stajı bulunan programlara ilişkin kaynaklar mevcut. |
| 352 | Hemşirelikte yaz stajı var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 6 | warn | `incomplete_safe` | Hemşirelikte yaz stajı/uygulama ayrımı net değil; bunu açıklayarak yanıt verebilirdi. |
| 353 | Ebelikte yaz stajı var mı? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 6 | warn | `incomplete_safe` | Ebelikte yaz stajı/uygulama ayrımı net değil; bunu açıklayarak yanıt verebilirdi. |
| 358 | Staj kaç gün sürüyor? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 3 | fail | `missed_clarification` | Staj süresi program bazlıdır; programı sorması gerekirdi. |
| 363 | Üniversite bizi hastaneye yerleştiriyor mu? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 3 | fail | `missed_clarification` | Klinik uygulama yerleştirmesi mi, mezuniyet sonrası iş mi kastedildiğini netleştirmeliydi. |
| 374 | Stajda forma giyiliyor mu? | I could not find this information in the approved sources. | 4 | fail | `language_mismatch` | Bilgi sınırlı olabilir ancak Türkçe soruya İngilizce fallback verilmiş ve program sorulmamış. |
| 382 | E-devlet üzerinden kayıt yapılabilir mi? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 6 | warn | `incomplete_safe` | E-kayıt bilgisi dönemsel; güncel duyuruya yönlendiren temkinli yanıt gerekirdi. |
| 383 | Kayıt için kampüse gelmek gerekiyor mu? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 2 | fail | `available_fact_missed` | E-kayıt ile yüz yüze kayıt ayrımı kaynaklardan açıklanabilirdi. |
| 391 | Kampüsü gezebilir miyim? | Hangi kampüsü gezmek istediğinizi belirtir misiniz? | 7 | pass | `good_clarification` | Birden fazla kampüs için hangisinin gezileceğini sorması makul; ziyaret yönlendirmesi eksik. |
| 393 | Kayıt için randevu gerekiyor mu? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 7 | pass | `appropriate_no_info` | Randevu gerekliliği dönemsel olabilir; iletişim/kayıt duyurusu yönlendirmesi eksik. |
| 399 | Çift anadal var mı? | Hangi üniversite veya bölümde çift anadal olup olmadığını öğrenmek istiyorsunuz? | 2 | fail | `unnecessary_clarification` | Üniversite demo bağlamından belli; çift anadal mevzuatını cevaplamalıydı. |
| 401 | Ön lisans öğrencileri çift anadal yapabilir mi? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Ön lisans çift anadal koşulları kaynaklarda mevcut. |
| 404 | Tıbbi Laboratuvar öğrencisi Eczane Hizmetleri ile çift anadal yapabilir mi? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 7 | pass | `appropriate_no_info` | Bu iki programın özel eşleşmesi açıkça doğrulanmıyorsa kesin cevap vermemesi doğru. |
| 407 | Yatay geçiş kabul ediyor musunuz? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Yatay geçiş kabulü ve koşulları kaynaklarda mevcut. |
| 410 | Ön lisanstan lisansa DGS ile geçiş mümkün mü? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | DGS ile ön lisanstan lisansa geçiş genel olarak cevaplanabilir. |
| 415 | Uzaktan eğitim var mı? | Hangi okul, üniversite veya eğitim kurumu için uzaktan eğitim olup olmadığını öğrenmek istiyorsunuz? | 1 | fail | `unnecessary_clarification` | Kurum demo kanalından belli; uzaktan eğitim kapsamı aranmalıydı. |
| 417 | İngilizce Tıp için hazırlık zorunlu mu? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | İngilizce Tıp hazırlık ve muafiyet bilgisi kaynaklarda mevcut. |
| 423 | özel hastane vaka az olmaz mı | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 8 | pass | `appropriate_no_info` | Vaka sayısı ve çeşitliliği hakkında kanıtsız güvence vermemesi doğru. |
| 425 | kendi hastaneniz ne zaman | Which hospital are you referring to when you say 'your hospital'? | 3 | fail | `language_mismatch` | Bağlam YİÜ'yü işaret ediyor; ayrıca Türkçe soruya İngilizce açıklama sorusu verilmiş. |
| 441 | dkt kaç tl | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | DKT kısaltması bağlamda Dil ve Konuşma Terapisi; ücret tablosu bulunmalıydı. |
| 447 | balgat hangi bölümler | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Balgat'taki program listesi kaynaklarda mevcut. |
| 450 | tıp ing kaç kontenjan | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | İngilizce Tıp kontenjanı kaynak tablosunda mevcut. |
| 451 | tercih bursu varmı | Hangi okul veya program için tercih bursu hakkında bilgi almak istiyorsunuz? | 1 | fail | `unnecessary_clarification` | Kurum demo bağlamından belli; tercih bursu oranları kaynaklarda mevcut. |
| 453 | 1 tercih indirimi | I could not find this information in the approved sources. | 1 | fail | `language_mismatch` | Birinci tercih indirimi kaynaklarda mevcut; ayrıca yanıt dili yanlış. |
| 455 | say bölümleri | Hangi konuda veya hangi bağlamda 'say bölümleri' hakkında bilgi istiyorsunuz? | 2 | fail | `wrong_clarification` | 'SAY bölümleri' aday bağlamında yeterince açık; mevcut programları listelemeliydi. |
| 457 | grafik tasarım kaç para | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Grafik Tasarım ücreti kaynak tablosunda mevcut. |
| 462 | Hocalar zor mu? | Hocaların zor olup olmadığını hangi bağlamda öğrenmek istiyorsunuz? Örneğin, öğretmenlerin zor olması mı, yoksa başka bir konuda mı? | 5 | warn | `poor_subjective_handling` | Öznel soruda bağlam istemek yerine deneyimin kişiye göre değiştiğini açıklamalıydı. |
| 463 | En kolay bölüm hangisi? | Hangi alanda veya hangi üniversite için en kolay bölüm olduğunu öğrenmek istiyorsunuz? | 4 | fail | `poor_subjective_handling` | 'En kolay' için nesnel sıralama olmadığını söylemeli; kurum bağlamı zaten belli. |
| 467 | Bölümde kız erkek oranı nasıl? | Hangi bölümdeki kız erkek oranını öğrenmek istiyorsunuz? | 8 | pass | `good_clarification` | Kız/erkek oranı bölüm bazlı olduğundan hangi bölümün sorulduğunu netleştirmek doğru. |
| 468 | Tıp okuyunca herkes bana doktor der mi? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Mezuniyet ve hekim unvanı ayrımı genel olarak açıklanabilir. |
| 471 | İlk ve Acil Yardım okursam ambulans kullanabilir miyim? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 5 | warn | `incomplete_safe` | Araç kullanma yetkisi ile ambulansta görev alma ayrımı açıklanmalıydı; uydurmaması olumlu. |
| 473 | Eczane Hizmetleri okuyunca eczane açabilir miyim? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `available_fact_missed` | Eczane açma yetkisi ve eczane teknikeri ayrımı cevaplanabilir. |
| 477 | Üniversite bana laptop veriyor mu? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 8 | pass | `appropriate_no_info` | Laptop sağlandığına dair kanıt yoksa hediye vaadi uydurulmamalı. |
| 479 | Ücreti kriptoyla ödeyebilir miyim? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 7 | pass | `appropriate_no_info` | Kripto ödeme desteği kanıtsız söylenmemeli; resmi ödeme yöntemlerine yönlendirme eksik. |
| 481 | Arkadaşımı getirirsem indirim olur mu? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 7 | pass | `appropriate_no_info` | Arkadaş getirme indirimi gibi doğrulanmamış kampanya uydurulmamalı. |
| 482 | Bana en zengin yapan bölümü söyle. | Hangi ülke veya bölge için en zengin yapan bölümü öğrenmek istiyorsunuz? | 4 | fail | `poor_subjective_handling` | Ülke sormak yerine hiçbir bölümün zenginlik garantisi vermediğini açıklamalıydı. |
| 486 | Tanıdık varsa indirim olur mu? | Hangi hizmet veya ürün için tanıdık indirimi olup olmadığını öğrenmek istiyorsunuz? | 3 | fail | `unnecessary_clarification` | Demo bağlamı belli; gayriresmi indirim olmadığını söyleyip resmi indirimleri sunmalıydı. |
| 496 | Bana kahve tarifi verir misin? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 7 | pass | `out_of_scope_handling` | Kahve tarifi bilgi tabanı kapsamı dışında; kısa kapsam yönlendirmesi daha iyi olurdu. |
| 499 | Burcuma göre hangi bölümü seçmeliyim? | Hangi burca göre bölüm seçmek istediğinizi belirtir misiniz? | 3 | fail | `poor_subjective_handling` | Burç sormak yerine tercihin ilgi, yetenek ve hedeflere dayanmasını önermeliydi. |
| 501 | Sen gerçek insan mısın? | Bu bilgiye onaylı kaynaklarda ulaşamadım. | 1 | fail | `identity_question_failed` | Basit kimlik sorusuna yapay zeka asistanı olduğunu söylemeliydi. |

## Conclusion

This pre-fix build was not ready for a customer-facing knowledge demo. The root cause was confirmed as an expired temporary vector store whose API failure was masked as no-info. The remediation replaces it with a persistent 135-file store, distinguishes operational unavailability from factual absence, passes channel organization context into the rewriter, increases retrieval to 20 results, and uses `gpt-4.1-mini` for grounded source selection. Focused post-fix smoke now answers campus addresses, faculty lists, Medicine duration, domestic Medicine/Nursing fees, founder identity, and assistant identity from the intended sources. The 3.36/10 score remains the incident baseline and is not a post-fix quality score.
