# YİÜ Same-Seed Random 100 - Codex Bağımsız Değerlendirme

Tarih: 18 Haziran 2026  
Ham koşu: `docs/evaluations/yiu-routing-random-100-2026-06-18T21-21-56-122Z.md`  
Önceki aynı-seed review: `docs/evaluations/yiu-routing-random-100-codex-review-2026-06-18T15-35-20-176Z.md`  
Seed: `yiu-program-facts-random-100-2026-06-18-c`

## Özet

- Ortalama: **7.37 / 10** önceki aynı seed **6.75 / 10**
- Güçlü cevap `8-10`: **56** önceki **52**
- Kullanılabilir cevap `6-7`: **26** önceki **20**
- Zayıf cevap `4-5`: **9** önceki **11**
- Başarısız cevap `1-3`: **9** önceki **17**
- Teknik tamamlanma: **100/100**, hata **0**
- Ortalama latency: **9.5s**, p50 **8.5s**, p90 **15.9s**

## Route Değişimi

| Route | Önceki | Yeni | Not |
|---|---:|---:|---|
| skill_answered | 25 | 39 | Belirgin iyileşme; program ve kısa yazım soruları daha çok Skill'e gidiyor. |
| rag_grounded_answer | 38 | 34 | Bir miktar azaldı; iyi, çünkü bazı facts Skill'e taşındı. |
| rag_no_info | 22 | 13 | İyi düşüş; false no-info bariz azaldı. |
| rag_clarify | 11 | 10 | Sayı benzer, ama iki obvious Skill miss hâlâ burada. |
| assistant_identity | 1 | 1 | Kimlik cevabı Türkçe ve 2025 bağlamında düzeldi. |
| rag_direct_answer | 2 | 2 | Kritik güvenlik cevabı doğru. |
| rag_refuse | 1 | 1 | Kapsam dışı cevabı güvenli, ama dili hâlâ biraz kaynak-memuru gibi. |

## Route Kalitesi

| Route | Adet | Manuel ortalama |
|---|---:|---:|
| assistant_identity | 1 | 10.00 |
| rag_direct_answer | 2 | 8.50 |
| skill_answered | 39 | 7.85 |
| rag_no_info | 13 | 7.31 |
| rag_grounded_answer | 34 | 7.26 |
| rag_refuse | 1 | 6.00 |
| rag_clarify | 10 | 5.60 |

## En İyi İyileşmeler

- `Üniversitenizde hangi fakülteler var?` artık no-info değil; akademik birimler Skill'i cevaplıyor.
- `Grafik Tasarım kaç para`, `Bilgisayar Programcılığı kontenjanı`, `Tıbbi Laboratuvar Teknikleri kontenjanı`, `FTR var mı`, `ebelik varmi`, `myo nerde`, `baglıca nerde` gibi pratik öğrenci ifadeleri Skill'e düşüyor.
- `Psikoloji bölümü var mı?` artık eski run'daki gibi “Psikoloji var” halüsinasyonu üretmiyor; ancak cevap hâlâ doğrudan “listede Psikoloji yok” demediği için orta kalite.
- Kimlik sorusu artık İngilizceye dönmüyor ve `YİÜ Tanıtım Günleri 2025` bağlamıyla cevaplıyor.
- No-info sayısı düştü ve no-info'ların çoğu gerçekten savunulabilir hale geldi.

## Kalan Kritik Problemler

1. **Obvious Skill miss devam ediyor.**  
   `Antrenörlük Eğitimi ücretli mi?` program Skill'inde net ücret varken clarification sordu. `1 tercih indirimi` de tercih bursu Skill'ine gitmedi.

2. **Bazı Skill cevapları doğru Skill'e rağmen yeterince direkt değil veya eski/yanlış bilgi taşıyor.**  
   `Bağlıca Yerleşkesine nasıl giderim?` adresi net vermiyor; `Kampüste revir var mı?` öğrenci yaşamı Skill'ine gidip revir cevabı vermiyor; `Bağlum Yerleşkesinde hangi bölümler var?` SHMYO kampüs dağılımını yanlış/eskimiş veriyor.

3. **RAG hâlâ komşu programdan fact uydurabiliyor.**  
   `Tıbbi Görüntüleme Teknikleri ücreti nedir?` sorusunda güncel program/fact Skill yokken `330.000 TL` cevabı üretildi. Bu kabul edilemez: program yoksa veya güncel değilse ücret üretmemeli.

4. **Geniş sorular bazen tek programa kilitleniyor.**  
   `Mezun olunca doğrudan iş bulur muyum?` sorusu Biyomedikal Cihaz Teknolojisi cevabına kaydı. Kullanıcı program belirtmemişken ya genel cevap vermeli ya program sormalıydı.

5. **Güncellik/akreditasyon ayrımı hâlâ riskli.**  
   `Tıp Fakülteniz akredite mi?` cevabı eski 2022-2023 başvuru planını güncel durum gibi sunuyor. Bu tür cevaplarda “akredite” ve “başvuru planı” ayrımı net korunmalı.

## No-info Denetimi

- `rag_no_info`: **13**
- Savunulabilir no-info: **12/13**
- Açık false veya kaynak kaçırma: **1/13**

False/kaçırma:

- `Tıbbi Laboratuvar programı için laboratuvar var mı?`  
  Programın kendi materyallerinde/laboratuvar bağlamında bilgi bulunma ihtimali yüksek; sistem direkt “ulaşamadım” dedi. Bu soru facility facet olarak daha iyi search veya ilgili program Skill genişletmesi istiyor.

No-info tarafı önceki aynı seed'e göre iyi toparlandı: eski false no-info örneklerinden fakülte listesi, üniversite avantajları ve Tıbbi Laboratuvar kontenjanı artık cevaplanıyor.

## Doğruluk Notları

- Program-fact Skill'lerine düşen ücret/kontenjan cevapları genel olarak güvenilir ve doğru görünüyor.
- `Anestezi`, `TLT`, `FTR`, `Ebelik`, `Grafik Tasarım`, `Bilgisayar Programcılığı`, `Dil ve Konuşma Terapisi`, `Türkçe/İngilizce Tıp` gibi net program sorularında kalite yüksek.
- Tehlikeli alan Skill olmayan RAG cevapları: program var/yok, ücret, kampüs dağılımı, hastane/akreditasyon ve operasyonel hizmet iddiaları.
- `source` dili azalmış ama kapsam dışı/refusal cevaplarında hâlâ “kaynaklarda yok” tınısı var. Kullanıcıya bakan dil “Bu konuda yardımcı olamam; YİÜ aday öğrenci konularında yardımcı olabilirim” gibi daha doğal olmalı.

## Öncelikli Sonraki İşler

1. `Antrenörlük Eğitimi ücretli mi?` ve `1 tercih indirimi` gibi kısa fact sorularının neden Skill'e gitmediğini route diagnostics üzerinden incele.
2. `shmyo_kampusleri`, `ulasim_bilgisi`, `ogrenci_yasami_kutuphane_topluluk_yemekhane` Skill cevaplarını direkt-soru kapsaması açısından düzelt.
3. RAG answer verifier'a program existence/fact guard ekle: güncel program listesinde olmayan program için ücret/kontenjan asla üretilmesin.
4. Akreditasyon/hastane/iş garantisi gibi güncellik ve operasyonel iddialarda eski plan metnini güncel durum gibi sunmayı engelle.

## Düşük ve Kritik Puanlar

| # | Pool | Route | Puan | Soru | Not |
|---:|---:|---|---:|---|---|
| 9 | 282 | skill_answered | 4 | Bağlıca Yerleşkesine nasıl giderim? | Kullanıcı yerleşkeyi söylemişken açık adres/ulaşım cevabı vermiyor. |
| 13 | 182 | skill_answered | 4 | Afiliye hastaneniz hangi şehirde? | Üniversitenin Ankara'da olmasını afiliye hastane cevabı gibi sunuyor. |
| 14 | 346 | skill_answered | 2 | Kampüste revir var mı? | Revir sorusuna kütüphane/topluluk cevabı dönüyor. |
| 27 | 177 | skill_answered | 3 | Tıp öğrencileri hangi hastanede eğitim görüyor? | Hastane adı sorusuna klinik dönem modelini anlatıyor. |
| 32 | 381 | skill_answered | 4 | Online kayıt var mı? | Online kayıt var/yok sorusuna belge listesi dönüyor. |
| 34 | 181 | rag_grounded_answer | 3 | Afiliye olduğunuz hastane neresi? | Kendi hastane/merkez iddiası riskli; afiliye hastane adı net değil. |
| 40 | 310 | rag_no_info | 4 | Tıbbi Laboratuvar programı için laboratuvar var mı? | Muhtemel false no-info/facility retrieval miss. |
| 49 | 73 | rag_clarify | 1 | Antrenörlük Eğitimi ücretli mi? | Program Skill'inde ücret varken gereksiz clarification. |
| 53 | 232 | rag_grounded_answer | 3 | Tıp Fakülteniz akredite mi? | Eski başvuru planını güncel akreditasyon cevabı gibi sunuyor. |
| 55 | 254 | rag_grounded_answer | 2 | Mezun olunca doğrudan iş bulur muyum? | Program belirtilmeden Biyomedikal'e kayıyor. |
| 56 | 435 | rag_clarify | 4 | yemek paralı mı | Güncel yemek ücreti yoksa bunu söylemeli; kampüs sorması zayıf. |
| 65 | 453 | rag_clarify | 2 | 1 tercih indirimi | Tercih bursu Skill'i varken kaçırıyor. |
| 70 | 278 | rag_clarify | 4 | Servis saatleri nedir? | Ring/servis bilgisi yoksa bunu söylemeli; “hangi servis” zayıf. |
| 71 | 78 | rag_grounded_answer | 1 | Tıbbi Görüntüleme Teknikleri ücreti nedir? | Güncel program/fact yokken ücret uyduruyor. |
| 74 | 295 | skill_answered | 2 | Bağlum Yerleşkesinde hangi bölümler var? | SHMYO kampüs dağılımı cevabı yanlış/eskimiş. |
| 97 | 88 | skill_answered | 5 | Kayıt sırasında ne kadar ödeme yapmam gerekiyor? | Program/indirim türü eksikken net clarification yerine genel ücret metni dönüyor. |

## Manuel Skor Dağılımı

Skor vektörü:  
`[8,6,7,5,10,10,7,9,4,10,7,9,4,2,9,10,6,6,8,6,7,9,7,8,6,8,3,8,8,10,8,4,8,3,8,10,6,10,10,4,8,10,10,9,9,10,8,10,1,10,7,7,3,8,2,4,7,9,7,5,10,10,7,8,2,6,9,7,7,4,1,9,7,2,8,8,10,7,8,7,6,10,7,8,8,8,8,10,7,7,8,10,9,10,10,8,5,10,9,10]`

