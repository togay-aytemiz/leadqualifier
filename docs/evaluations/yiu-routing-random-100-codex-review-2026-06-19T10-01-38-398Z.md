# YİÜ Same-Seed Random 100 - Codex Manuel Doğruluk Review

Tarih: 19 Haziran 2026  
Ham koşu: `docs/evaluations/yiu-routing-random-100-2026-06-19T10-01-38-398Z.md`  
Seed: `yiu-program-facts-random-100-2026-06-18-c`  
Base URL: `http://localhost:3000` (mevcut production build, production Supabase/OpenAI verisi)

## Koşu Notu

İlk deneme, test organizasyonunun `10000/10000` aylık paket kredisini tüketmiş olması nedeniyle Skill cevaplarını billing kapısında durdurdu ve yanıltıcı biçimde `0 Skill` üretti. Operatör isteğiyle paket limitine `10000` kredi eklendi; hesap `20000` limit, `10000` kullanım, `10000` kullanılabilir bakiye ve `lock_reason=none` olarak doğrulandı. Aşağıdaki değerlendirme yalnızca kredi sonrası temiz `100/100` koşuya aittir.

## Özet

- Teknik tamamlanma: **100/100**, hata **0**.
- Route dağılımı: **38 Skill**, **44 grounded RAG**, **16 no-info**, **1 refusal**, **1 assistant identity**.
- Ortalama latency: **9.4s**, p50 **10.8s**, p90 **14.3s**.
- Manuel Codex skoru: **7.22 / 10**.
- Güçlü cevap (`8-10`): **54**.
- Kullanılabilir cevap (`6-7`): **25**.
- Zayıf cevap (`4-5`): **12**.
- Başarısız cevap (`1-3`): **9**.

## Route Kalitesi

| Route | Adet | Manuel ortalama | Güçlü | Kullanılabilir | Zayıf | Başarısız |
|---|---:|---:|---:|---:|---:|---:|
| skill_answered | 38 | 8.08 | 25 | 7 | 3 | 3 |
| rag_grounded_answer | 44 | 6.45 | 19 | 11 | 9 | 5 |
| rag_no_info | 16 | 7.00 | 8 | 7 | 0 | 1 |
| assistant_identity | 1 | 10.00 | 1 | 0 | 0 | 0 |
| rag_refuse | 1 | 9.00 | 1 | 0 | 0 | 0 |

## Skill Değerlendirmesi

Ham Skill sayısı **38**. Bunların **32'si en az kullanılabilir**, **6'sı zayıf veya başarısız**.

Açık yanlış Skill seçimleri:

| # | Soru | Seçilen Skill | Sorun |
|---:|---|---|---|
| 13 | Afiliye hastaneniz hangi şehirde? | `universite_genel_tanitim` | Üniversitenin Ankara'da olduğunu söylüyor; afiliye hastanenin kimliğini/şehrini cevaplamıyor. |
| 27 | Tıp öğrencileri hangi hastanede eğitim görüyor? | `tip_fakultesi_egitim_modeli` | Klinik dönemleri anlatıyor; istenen hastane adını vermiyor. |
| 44 | Başarı sıralamaları nedir? | `tip_turkce_program_bilgileri` | Geniş tüm-program sorusunu tek Türkçe Tıp programına indiriyor. |

Zayıf kapsam örnekleri: `Laboratuvarlar yeni mi?` sorusu modern laboratuvar bilgisini “yeni” yerine kullanıyor; Balgat yerleşkesi cevabı SHMYO'nun Balgat programlarını dışarıda bırakıyor; `yemek paralı mı` cevabı ücret sorusuna fiyat/boundary cevabı vermiyor.

## No-info Denetimi

`rag_no_info`: **16**

- Savunulabilir gerçek no-info: **11**.
- Clarification veya daha iyi boundary gereken: **4**.
- Açık false no-info: **1**.

False no-info:

| # | Soru | Neden |
|---:|---|---|
| 99 | Anatomi maketleriniz var mı? | Onaylı Tıp Skill'i anatomi laboratuvarı, kadavra ve maketlerle uygulama bilgisini içeriyor; bilgi mevcutken RAG no-info döndü. |

Clarification/boundary ile daha iyi olacak no-info'lar: `Hastane değişebilir mi?`, `Öğrenci başına düşen cihaz sayısı nedir?`, `Ebelik öğrencileri uygulamaya ne zaman başlıyor?`, `En kötü bölümünüz hangisi?`.

## RAG Doğruluğu

RAG daha istekli cevap veriyor ama route ortalaması **6.45/10** ile Skill ve no-info'nun gerisinde. En riskli sonuçlar:

| # | Soru | Puan | Sorun |
|---:|---|---:|---|
| 4 | Afiliye hastane özel mi devlet hastanesi mi? | 3 | Vakıf/üniversite kuruluş metninden hastanenin statüsünü çıkarıyor. |
| 24 | Kayıtta pazarlık yapılıyor mu? | 3 | Öğrenci kaydını satın alma/ihale yönetmeliğindeki pazarlık usulüyle ilişkilendiriyor. |
| 53 | Tıp Fakülteniz akredite mi? | 3 | 2022-2023 başvuru planını güncel akreditasyon durumu gibi kullanıyor. |
| 60 | Psikoloji bölümü var mı? | 1 | Program kataloğunda olmayan Psikoloji bölümünün bulunduğunu iddia ediyor. |
| 75 | Hastane projeniz var mı? | 2 | Sağlık Uygulama ve Araştırma Merkezi yönetmeliğini çalışan/kendi hastane varlığına çeviriyor. |

Diğer zayıf çıkarımlar; yakında devlet yurdu bulunmadığı iddiası, Tıbbi Laboratuvar program tanımından fiziksel laboratuvar varlığı çıkarılması, afiliye hastane yerine SUAM anlatılması ve staj işletmesi değişikliği kuralından memlekette staj hakkı türetilmesidir.

## Akış Diagnostiği

- Skill cevapları: **15 exact**, **23 verified**.
- Non-Skill fallback: **61**.
- Fallback'ların **60'ı** Skill aşamasında üretilen standalone query'yi File Search'te aynen kullandı; yalnız **1** soru ikinci/simple-RAG rewrite'a kaldı.
- Fallback'ların **25'inde** adaylar bulunmasına rağmen verification sonucu metadata'da yok. Mevcut `1800ms` candidate-verifier bütçesi hâlâ görünür bir recall riski.

## Sonuç

Kredi sonrası Skill-first routing çalışıyor; `0 Skill` gerçek matcher sonucu değildi. Yine de sistem henüz olması gerektiği kadar güvenilir değil:

1. Skill seçildiğinde kalite güçlü, fakat broad-subject ve wrong-facet seçimleri tamamen kapanmamış.
2. No-info çoğunlukla mantıklı; yalnız anatomi maketi sorusu açık false no-info.
3. En büyük doğruluk riski RAG'in “ilgili metin var” ile “sorulan gerçek doğrudan kanıtlandı” ayrımını yapamaması.
4. Candidate verifier timeout sebebi `rag_fallback` ile overwrite edildiğinden diagnostik terminal nedeni kayboluyor.

## Manuel Skor Vektörü

`[7,8,4,3,10,9,5,8,7,10,8,9,3,9,7,9,5,8,8,4,6,8,4,3,8,7,3,9,8,10,9,8,7,4,8,10,6,9,10,4,6,10,10,3,8,10,9,7,10,10,5,5,3,8,7,5,6,8,7,1,8,10,4,5,10,9,8,7,9,7,9,8,6,10,2,6,9,8,7,6,6,10,8,7,6,8,8,9,9,7,7,6,8,10,10,8,6,9,2,10]`
