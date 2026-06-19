# YİÜ Same-Seed Random 100 - Codex Manuel Doğruluk ve No-info Review

Tarih: 19 Haziran 2026  
Ham koşu: `docs/evaluations/yiu-routing-random-100-2026-06-19T06-32-12-885Z.md`  
Önceki same-seed review: `docs/evaluations/yiu-routing-random-100-codex-review-2026-06-18T21-21-56-122Z.md`  
Seed: `yiu-program-facts-random-100-2026-06-18-c`  
Base URL: `https://app.askqualy.com`  
Not: İlk deneme prod maintenance yüzünden `100/100` 503 döndüğü için review dışı bırakıldı. Prod demo DB maintenance kapatıldıktan sonra bu rapor koşturuldu.

## Özet

- Ortalama manuel skor: **7.14 / 10**; önceki aynı seed **7.37 / 10**.
- Güçlü cevap `8-10`: **52**; önceki **56**.
- Kullanılabilir cevap `6-7`: **28**; önceki **26**.
- Zayıf cevap `4-5`: **13**; önceki **9**.
- Başarısız cevap `1-3`: **7**; önceki **9**.
- Teknik tamamlanma: **100/100**, hata **0**.
- Ortalama latency: **11.1s**, p50 **12.9s**, p90 **17.0s**.

## Route Değişimi

| Route | Önceki | Yeni | Not |
|---|---:|---:|---|
| skill_answered | 39 | 38 | Sayı benzer; bazı net program/fact soruları hâlâ kaçıyor. |
| rag_grounded_answer | 34 | 29 | Biraz azaldı; bazı riskli cevaplar no-info'ya çekilmiş. |
| rag_no_info | 13 | 22 | Güvenli tarafa fazla kaydı; çoğu savunulabilir ama bir bariz false no-info var. |
| rag_clarify | 10 | 7 | Azaldı; önceki gereksiz clarify örneklerinden bazıları düzelmiş. |
| rag_direct_answer | 2 | 2 | Kimlik/güvenlik tarzı doğrudan cevaplar iyi. |
| assistant_identity | 1 | 1 | Türkçe ve 2025 bağlamı doğru. |
| rag_refuse | 1 | 1 | Güvenli ama dili hâlâ kaynak-memuru gibi. |

## Route Kalitesi

| Route | Adet | Manuel ortalama | Güçlü | Kullanılabilir | Zayıf | Başarısız |
|---|---:|---:|---:|---:|---:|---:|
| skill_answered | 38 | 7.74 | 27 | 5 | 3 | 3 |
| rag_grounded_answer | 29 | 6.66 | 12 | 10 | 4 | 3 |
| rag_no_info | 22 | 6.91 | 11 | 7 | 3 | 1 |
| rag_clarify | 7 | 6.29 | 0 | 5 | 2 | 0 |
| rag_direct_answer | 2 | 8.00 | 1 | 1 | 0 | 0 |
| assistant_identity | 1 | 10.00 | 1 | 0 | 0 | 0 |
| rag_refuse | 1 | 5.00 | 0 | 0 | 1 | 0 |

## Ne Düzeldi?

- `Antrenörlük Eğitimi ücretli mi?` artık Skill'e düşüyor ve ücret/kontenjanı doğru veriyor.
- `1 tercih indirimi` artık tercih bursu cevabını doğru veriyor.
- `Tıbbi Görüntüleme Teknikleri ücreti nedir?` artık eski/stale programdan ücret uydurmuyor; güvenli no-info'ya dönüyor.
- `Kampüste revir var mı?` artık net ve doğru cevaplanıyor.
- `sen gerçek insan mısın?` cevabı Türkçe, kurum bağlamlı ve ChatGPT karışıklığı yok.

## Kalan Kök Nedenler

1. **Skill matcher bazı mevcut program Skills'lerini hâlâ kaçırıyor.**  
   `Ebelik kontenjanı nedir?` no-info'ya düştü, ama aynı run içinde `ebelik varmi` doğru Ebelik Skill'ine düştü. Bu bilgi yokluğu değil; Skill recall/verifier hattında kaçak.

2. **Skill verifier geniş soruyu tek program Skill'iyle kapatabiliyor.**  
   `Başarı sıralamaları nedir?` sorusunda rewrite doğru şekilde "programlarının başarı sıralamaları" dedi, ama verifier Türkçe Tıp Skill'ini direct coverage saydı. Geniş subject ile tek-program Skill'i birbirine eşit sayılmamalı.

3. **Bazı Skill cevapları doğru Skill olsa bile yanıt kapsamı eksik.**  
   `Balgat Yerleşkesinde hangi bölümler var?` sadece MYO ve Spor Bilimleri diyor; SHMYO'nun Balgat programlarını dışarıda bırakıyor. `Psikoloji bölümü var mı?` listede psikoloji olmadığını açıkça söylemek yerine genel liste dönüyor.

4. **RAG eski/operasyonel kaynaklardan hâlâ riskli çıkarım yapabiliyor.**  
   `Afiliye olduğunuz hastane neresi?`, `Tıp Fakülteniz akredite mi?`, `Mezun olunca doğrudan iş bulur muyum?` sorularında cevaplar ya eski planı güncel durum gibi okuyor ya da program belirtilmeden tek programa kilitleniyor.

5. **No-info çoğunlukla güvenli ama bazen ürün davranışı zayıf.**  
   Bazı sorularda gerçekten bilgi yok; bazı sorularda ise daha iyi cevap `hangi program/ödeme türü için?` gibi kısa bir clarification olmalıydı. `Kayıt sırasında ne kadar ödeme yapmam gerekiyor?` buna örnek.

6. **Eval gözlemi hâlâ yarım.**  
   Skill'e düşmeyen RAG cevaplarında bot mesajında Skill-routing diagnostikleri görünmüyor. `Ebelik kontenjanı` gibi kaçaklarda "candidate geldi mi, verifier mı reddetti, eşik mi yetmedi?" sorusunu ham rapordan tek adımda göremiyoruz.

## No-info Denetimi

`rag_no_info`: **22**

- Savunulabilir/gerçek no-info: **16**
- Açık false no-info: **1**
- Daha iyi clarification veya program/facility kapsamı isteyen zayıf no-info: **5**

False no-info:

| # | Pool | Soru | Neden |
|---:|---:|---|---|
| 50 | 130 | Ebelik kontenjanı nedir? | Ebelik program Skill'i var ve aynı run içinde başka Ebelik sorusunu cevapladı. Bu no-info değil, Skill kaçışı. |

Zayıf no-info / ürün davranışı:

| # | Pool | Soru | Not |
|---:|---:|---|---|
| 40 | 310 | Tıbbi Laboratuvar programı için laboratuvar var mı? | Program/facility facet hâlâ güçlü direkt kanıt istiyor; güvenli ama aday için tatmin edici değil. |
| 52 | 352 | Hemşirelikte yaz stajı var mı? | Hemşirelik uygulama/staj kaynakları geliyor ama answer no-info'ya dönüyor; "yaz stajı" özelinde daha iyi ayrım gerekli. |
| 81 | 193 | Ebelik öğrencileri uygulamaya ne zaman başlıyor? | Ebelik uygulama sorusunda program kaynakları zayıf; no-info güvenli ama aday açısından eksik. |
| 97 | 88 | Kayıt sırasında ne kadar ödeme yapmam gerekiyor? | Program/indirim/ödeme planı eksikse clarification daha iyi olurdu. |
| 1 | 222 | Birden fazla hastaneyle anlaşmanız var mı? | Güvenli no-info; ancak hastane/klinik eğitim soruları için daha yönlendirici bir follow-up faydalı. |

## Kritik Düşük Puanlar

| # | Pool | Route | Puan | Soru | Kök neden |
|---:|---:|---|---:|---|---|
| 13 | 182 | skill_answered | 3 | Afiliye hastaneniz hangi şehirde? | Genel üniversite Skill'i yanlış eşleşmiş; afiliye hastane sorusuna cevap değil. |
| 20 | 294 | skill_answered | 4 | Balgat Yerleşkesinde hangi bölümler var? | Yerleşke Skill'i eksik kapsamlı; Balgat'taki SHMYO programları dışarıda kalıyor. |
| 27 | 177 | skill_answered | 3 | Tıp öğrencileri hangi hastanede eğitim görüyor? | Hastane adı soruluyor, cevap eğitim modelini anlatıyor. |
| 34 | 181 | rag_grounded_answer | 2 | Afiliye olduğunuz hastane neresi? | SUAM/metinlerinden hastane adı çıkarımı yapıyor; net afiliye hastane kanıtı yok. |
| 37 | 485 | rag_grounded_answer | 4 | Kontenjan dolsa da beni alırlar mı? | Kayıt/yerleştirme sorusuna yatay geçiş mevzuatı karışmış; riskli. |
| 44 | 143 | skill_answered | 3 | Başarı sıralamaları nedir? | Geniş program sorusu tek Türkçe Tıp Skill'iyle cevaplanmış. |
| 50 | 130 | rag_no_info | 2 | Ebelik kontenjanı nedir? | Mevcut program Skill'i kaçmış; false no-info. |
| 53 | 232 | rag_grounded_answer | 3 | Tıp Fakülteniz akredite mi? | 2022-2023 başvuru planını güncel akreditasyon cevabı gibi sunuyor. |
| 55 | 254 | rag_grounded_answer | 3 | Mezun olunca doğrudan iş bulur muyum? | Program belirtilmeden Biyomedikal kariyer metnine kilitleniyor. |
| 60 | 49 | skill_answered | 5 | Psikoloji bölümü var mı? | Program listesinde psikoloji olmadığını açık söylemiyor. |
| 63 | 238 | rag_grounded_answer | 4 | Akredite olmayan bölüm okunmaz mı? | Eski akreditasyon planını tekrar güncel bağlam gibi kullanıyor. |
| 66 | 496 | rag_refuse | 5 | Bana kahve tarifi verir misin? | Güvenli ama "kaynaklarda yok" dili kaynak-memuru gibi. |
| 83 | 212 | rag_grounded_answer | 5 | Öğrenciler aktif uygulama yapabiliyor mu? | Program belirtilmeden FTR özelindeki 28 saat uygulamayı genelleştiriyor. |

## Sonuç

Bu run "sistem hâlâ aptal" hissini tamamen haksız çıkarmıyor, ama problemi daha daraltıyor:

- Program-fact Skill'leri seçildiğinde çoğunlukla doğru.
- No-info artık eskisi kadar saçma değil; çoğu savunulabilir.
- En ağır kalite kaybı **yanlış Skill kapsamı**, **broad soruyu tek programa indirgeme**, ve **operasyonel/akreditasyon RAG çıkarımı**.

Bir sonraki en verimli hamle kod tarafında üç küçük, genel kural olmalı:

1. Skill verifier'da broad subject koruması: kullanıcı tüm programları/kampüsü/başarı sıralamalarını soruyorsa tek-program Skill direct coverage sayılmasın.
2. Skill miss diagnostiklerini RAG bot mesajına da taşı: kaçan soruda candidate/verifier/eşik sebebi raporda görünsün.
3. RAG answer generator'da program belirtilmeyen kariyer/uygulama/akreditasyon/hastane cevapları için tek programa kilitlenmeyi engelle; ya genel güvenli cevap ver ya da tek clarification sor.

## Manuel Skor Vektörü

`[7,9,8,6,9,9,6,8,7,9,8,8,3,9,8,9,7,6,7,4,7,8,6,5,8,7,3,7,8,9,7,5,7,2,8,10,4,9,10,4,8,9,9,3,8,9,8,9,9,2,6,5,3,8,3,5,7,8,6,5,9,9,4,7,10,5,6,8,7,5,9,8,6,9,8,7,8,7,7,6,5,8,5,8,8,8,8,9,7,7,7,10,8,9,9,8,6,10,9,9]`
