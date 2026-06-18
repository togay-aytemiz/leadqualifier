# YİÜ Random 100 - Codex Bağımsız Değerlendirme

Tarih: 18 Haziran 2026  
Ham koşu: `yiu-routing-random-100-2026-06-18T15-35-20-176Z.md`  
Seed: `yiu-program-facts-random-100-2026-06-18-c`

## Özet

- Ortalama: **6.75 / 10**
- Güçlü (8-10): **52**
- Kullanılabilir (6-7): **20**
- Zayıf (4-5): **11**
- Başarısız (1-3): **17**
- Teknik tamamlanma: **100/100**, hata **0**
- Route: **25 Skill**, **38 grounded RAG**, **22 no-info**, **11 clarification**, **2 direct answer**, **1 identity**, **1 refusal**

Önceki bağımsız random-100 değerlendirmesi 7,10/10 idi. Bu set 6,75/10 verdi. Setler aynı olmadığı için birebir regresyon metriği değildir; ancak düşük kalite örnekleri gerçek ve tekrarlanabilir.

## Route Kalitesi

| Route | Adet | Ortalama |
|---|---:|---:|
| rag_no_info | 22 | 6.36 |
| rag_grounded_answer | 38 | 6.39 |
| skill_answered | 25 | 7.72 |
| rag_clarify | 11 | 6.27 |
| assistant_identity | 1 | 10.00 |
| rag_direct_answer | 2 | 7.50 |
| rag_refuse | 1 | 5.00 |

## Program Skill Sonucu

- Yeni program-fact Skill’leri tetiklendiğinde **11/11** fiyat/kontenjan/program cevabı doğrulandı ve 10/10 aldı.
- Buna rağmen dört açık program sorusu Skill’e ulaşmadı: Antrenörlük ücreti ve Tıbbi Laboratuvar kontenjanı false no-info; Ebelik var mı doğru RAG; Tıbbi Görüntüleme ücreti ise desteklenmeyen fiyat aralığı üretti.
- Dolayısıyla sorun program Skill metinlerinin doğruluğu değil; eşleşme kapsaması, rewrite ve fallback doğrulamasıdır.

## No-info Denetimi

- 22 no-info cevabının **18’i savunulabilir**, **4’ü false no-info**.
- False no-info: fakülte listesi, Antrenörlük ücreti, üniversitenin kaynakta bulunan genel avantajları, Tıbbi Laboratuvar kontenjanı.
- İki false no-info izinde doğru YİÜ broşür chunk’larının `other_organization` gerekçesiyle elendiği görüldü.
- Tıbbi Laboratuvar sorgusuna kullanıcı istemediği halde `2026` eklendi; 2025 broşür değeri daha sonra “unsupported protected value” diye reddedildi.

## Kritik Bulgular

1. **Yanlış Skill eşleşmeleri devam ediyor.** Afiliye hastanenin şehri genel üniversite tanıtımına, revir öğrenci yaşamına, Bağlum programları ise eski/yanlış kampüs haritasına gidiyor.
2. **Fallback verifier sayısal halüsinasyonu kaçırıyor.** Tıbbi Görüntüleme güncel program listesinde yokken benzer programlardan 165-330 bin TL aralığı üretilmiş.
3. **Komşu kanıttan program çıkarımı var.** Psikoloji resmi güncel bölüm/program listesinde bulunmadığı halde “Psikoloji bölümü bulunmaktadır” denmiş.
4. **Güncellik ayrımı zayıf.** Tıp akreditasyon cevabı güncel durum yerine resmi sitedeki eski 2022-2023 başvuru planını tekrar ediyor. Ayrıca Mart 2026’daki kurumsal akreditasyon, Tıp program akreditasyonu ile karıştırılmamalı.
5. **Geniş sorular tek programa kilitlenebiliyor.** Genel iş ve aktif uygulama soruları sırasıyla Biyomedikal ve FTR cevabına kaymış.

## Doğrulama Kaynakları

- Güncel resmi ana sayfa üç fakülteyi ve üç yüksekokulu listeliyor: https://yuksekihtisasuniversitesi.edu.tr/
- Güncel aday program listesinde Psikoloji ve Tıbbi Görüntüleme Teknikleri yer almıyor: https://aday.yuksekihtisasuniversitesi.edu.tr/iletisim
- Tıp Fakültesi resmi sayfası güncel eğitim/laboratuvar özelliklerini veriyor: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi
- Akreditasyon FAQ metni hâlâ 2022-2023 başvuru planını anlatıyor ve güncel program statüsü olarak kullanılamaz: https://yuksekihtisasuniversitesi.edu.tr/sikca-sorulan-sorular
- YÖKAK Mart 2026 kararı üniversite düzeyinde koşullu kurumsal akreditasyondur; Tıp program akreditasyonu değildir: https://www.yokak.gov.tr/2026/03/12/yuksekogretim-kalite-kurulundan-39-universiteye-kurumsal-akreditasyon/

## Tüm Puanlar

| # | Pool | Route | Puan | Soru | Codex değerlendirmesi |
|---:|---:|---|---:|---|---|
| 1 | 222 | rag_no_info | 7 | Birden fazla hastaneyle anlaşmanız var mı? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 2 | 280 | rag_grounded_answer | 9 | Yerleşkenize ulaşım nasıl sağlanıyor? | Doğru, güvenli veya bağlama uygun. |
| 3 | 7 | rag_no_info | 2 | Üniversitenizde hangi fakülteler var? | Resmi ana sayfada üç fakülte açıkça listeleniyor; false no-info. |
| 4 | 184 | rag_no_info | 7 | Afiliye hastane özel mi devlet hastanesi mi? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 5 | 135 | skill_answered | 10 | Antrenörlük Eğitimi kontenjanı nedir? | Doğru, güvenli veya bağlama uygun. |
| 6 | 30 | rag_grounded_answer | 9 | Antrenörlük Eğitimi bölümü var mı? | Doğru, güvenli veya bağlama uygun. |
| 7 | 437 | rag_no_info | 7 | stajı siz mi ayarlıyosunuz | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 8 | 84 | rag_no_info | 8 | Ücretlere KDV dahil mi? | Doğru, güvenli veya bağlama uygun. |
| 9 | 282 | skill_answered | 4 | Bağlıca Yerleşkesine nasıl giderim? | Bağlıca için açık adres veya somut ulaşım cevabı vermiyor. |
| 10 | 128 | skill_answered | 10 | İngilizce Tıp kontenjanı kaç? | Doğru, güvenli veya bağlama uygun. |
| 11 | 216 | rag_grounded_answer | 6 | Hastanede öğrenci dinlenme alanı var mı? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 12 | 180 | rag_grounded_answer | 8 | Afiliye hastane ne demek? | Doğru, güvenli veya bağlama uygun. |
| 13 | 182 | skill_answered | 1 | Afiliye hastaneniz hangi şehirde? | Afiliye hastanenin şehrini üniversitenin Ankara’da olmasıyla karıştıran yanlış Skill eşleşmesi. |
| 14 | 346 | skill_answered | 2 | Kampüste revir var mı? | Revir sorusunu kütüphane/topluluk Skill’iyle karşılıyor; soruya cevap yok. |
| 15 | 207 | skill_answered | 8 | Öğrenciler hasta başı eğitim yapabiliyor mu? | Doğru, güvenli veya bağlama uygun. |
| 16 | 413 | rag_grounded_answer | 9 | Derslere devam zorunlu mu? | Doğru, güvenli veya bağlama uygun. |
| 17 | 326 | rag_grounded_answer | 4 | Laboratuvarlar yeni mi? | Belirsiz laboratuvar sorusunu Ergoterapiye bağlıyor ve “yeni” çıkarımı yapıyor. |
| 18 | 201 | rag_grounded_answer | 5 | Afiliye hastanede acil servis var mı? | Acil durumda anlaşmalı hastaneye başvuru kuralı, afiliye hastanede acil servis bulunduğunu doğrudan kanıtlamaz. |
| 19 | 459 | rag_grounded_answer | 8 | Üniversitenizde sevgili bulabilir miyim? | Doğru, güvenli veya bağlama uygun. |
| 20 | 294 | skill_answered | 4 | Balgat Yerleşkesinde hangi bölümler var? | Balgat program listesi SHMYO’nun Balgat programlarını eksik bırakıyor. |
| 21 | 287 | rag_grounded_answer | 7 | Dolmuşla ulaşım var mı? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 22 | 484 | rag_grounded_answer | 8 | İş garantisi veriyor musunuz? | Doğru, güvenli veya bağlama uygun. |
| 23 | 262 | rag_grounded_answer | 6 | Yakınlarda devlet yurdu var mı? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 24 | 480 | rag_grounded_answer | 6 | Kayıtta pazarlık yapılıyor mu? | Kayıtta pazarlık sorusuna satın alma/ihale yönetmeliği getirilmiş. |
| 25 | 233 | rag_no_info | 7 | Hemşirelik bölümünüz akredite mi? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 26 | 370 | rag_no_info | 8 | Staj sırasında yemek veya ulaşım karşılanıyor mu? | Doğru, güvenli veya bağlama uygun. |
| 27 | 177 | rag_no_info | 8 | Tıp öğrencileri hangi hastanede eğitim görüyor? | Doğru, güvenli veya bağlama uygun. |
| 28 | 268 | skill_answered | 8 | Yurt garantisi veriyor musunuz? | Doğru, güvenli veya bağlama uygun. |
| 29 | 392 | rag_grounded_answer | 5 | Tanıtım günleri var mı? | Halkla ilişkiler yönergesinden güncel tanıtım günü varlığı çıkarılıyor; kanıt dolaylı. |
| 30 | 134 | skill_answered | 10 | Sağlık Yönetimi kontenjanı kaç? | Doğru, güvenli veya bağlama uygun. |
| 31 | 312 | rag_clarify | 8 | Mikroskop sayınız kaç? | Doğru, güvenli veya bağlama uygun. |
| 32 | 381 | skill_answered | 7 | Online kayıt var mı? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 33 | 319 | rag_grounded_answer | 8 | Anestezi cihazı uygulaması yapılıyor mu? | Doğru, güvenli veya bağlama uygun. |
| 34 | 181 | rag_no_info | 8 | Afiliye olduğunuz hastane neresi? | Doğru, güvenli veya bağlama uygun. |
| 35 | 461 | rag_no_info | 8 | Yemekler güzel mi? | Doğru, güvenli veya bağlama uygun. |
| 36 | 99 | skill_answered | 9 | Tercih bursu var mı? | Doğru, güvenli veya bağlama uygun. |
| 37 | 485 | rag_grounded_answer | 7 | Kontenjan dolsa da beni alırlar mı? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 38 | 136 | skill_answered | 10 | Anestezi kontenjanı nedir? | Doğru, güvenli veya bağlama uygun. |
| 39 | 501 | assistant_identity | 10 | Sen gerçek insan mısın? | Doğru, güvenli veya bağlama uygun. |
| 40 | 310 | rag_no_info | 9 | Tıbbi Laboratuvar programı için laboratuvar var mı? | Doğru, güvenli veya bağlama uygun. |
| 41 | 116 | rag_grounded_answer | 8 | Annem mezun, bana indirim var mı? | Doğru, güvenli veya bağlama uygun. |
| 42 | 140 | skill_answered | 10 | Bilgisayar Programcılığı kontenjanı kaç? | Doğru, güvenli veya bağlama uygun. |
| 43 | 457 | skill_answered | 10 | grafik tasarım kaç para | Doğru, güvenli veya bağlama uygun. |
| 44 | 143 | rag_clarify | 9 | Başarı sıralamaları nedir? | Doğru, güvenli veya bağlama uygun. |
| 45 | 449 | rag_grounded_answer | 3 | baglıca nerde | “Bağlıca nerede?” sorusuna adres vermiyor. |
| 46 | 127 | skill_answered | 10 | Türkçe Tıp kontenjanı kaç? | Doğru, güvenli veya bağlama uygun. |
| 47 | 1 | skill_answered | 9 | Yüksek İhtisas Üniversitesi hakkında bilgi verir misin? | Doğru, güvenli veya bağlama uygun. |
| 48 | 117 | rag_grounded_answer | 9 | Şehit ve gazi yakınlarına burs var mı? | Doğru, güvenli veya bağlama uygun. |
| 49 | 73 | rag_no_info | 1 | Antrenörlük Eğitimi ücretli mi? | Antrenörlük program Skill’inde ücret bilgisi varken false no-info. |
| 50 | 130 | skill_answered | 10 | Ebelik kontenjanı nedir? | Doğru, güvenli veya bağlama uygun. |
| 51 | 469 | rag_no_info | 6 | Hemşirelikte kan görmek zorunda mıyım? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 52 | 352 | rag_no_info | 5 | Hemşirelikte yaz stajı var mı? | Zayıf cevap veya eksik yönlendirme. |
| 53 | 232 | rag_grounded_answer | 3 | Tıp Fakülteniz akredite mi? | 2022-2023 başvuru planını güncel akreditasyon durumu gibi sunuyor; bilgi eskimiş. |
| 54 | 467 | rag_clarify | 6 | Bölümde kız erkek oranı nasıl? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 55 | 254 | rag_grounded_answer | 1 | Mezun olunca doğrudan iş bulur muyum? | Program belirtilmeyen iş sorusunu Biyomedikal Cihaz Teknolojisine taşıyor. |
| 56 | 435 | rag_clarify | 4 | yemek paralı mı | Yemek ücretinde kampüs/bölüm sormak gereksiz; güncel ücret yoksa bunu söylemeliydi. |
| 57 | 221 | rag_clarify | 8 | Hastane değişebilir mi? | Doğru, güvenli veya bağlama uygun. |
| 58 | 304 | rag_grounded_answer | 8 | Beceri laboratuvarı var mı? | Doğru, güvenli veya bağlama uygun. |
| 59 | 425 | rag_direct_answer | 5 | kendi hastaneniz ne zaman | Kendi hastanesi sorusunu yanıtlamadan resmi kanallara yönlendiriyor. |
| 60 | 49 | rag_grounded_answer | 2 | Psikoloji bölümü var mı? | Güncel resmi program listesinde Psikoloji yok; komşu belgede geçen psikoloji ifadesinden program uydurulmuş. |
| 61 | 5 | rag_grounded_answer | 10 | Üniversitenin kurucu vakfı kimdir? | Doğru, güvenli veya bağlama uygun. |
| 62 | 33 | skill_answered | 10 | Grafik Tasarım var mı? | Doğru, güvenli veya bağlama uygun. |
| 63 | 238 | rag_grounded_answer | 6 | Akredite olmayan bölüm okunmaz mı? | Akreditasyon hakkında bağlamı eksik ve fazla genel çıkarım. |
| 64 | 367 | rag_clarify | 8 | Kendi memleketimde staj yapabilir miyim? | Doğru, güvenli veya bağlama uygun. |
| 65 | 453 | rag_clarify | 2 | 1 tercih indirimi | 1. tercih indirimi Skill’de açıkça %10 iken gereksiz clarification. |
| 66 | 496 | rag_refuse | 5 | Bana kahve tarifi verir misin? | Doğru kapsam sınırı koyuyor ancak kullanıcıya “broşürde kahve tarifi yok” diyerek kaynak memuru gibi konuşuyor. |
| 67 | 468 | rag_grounded_answer | 3 | Tıp okuyunca herkes bana doktor der mi? | Doktor unvanının mezuniyet sonrası kazanıldığını ayırmadan “tıp okuyanlara doktor denir” diyor. |
| 68 | 271 | rag_no_info | 8 | Kampüs çevresinde kiralık ev bulmak kolay mı? | Doğru, güvenli veya bağlama uygun. |
| 69 | 369 | rag_clarify | 7 | Stajda sigorta yapılıyor mu? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 70 | 278 | rag_clarify | 3 | Servis saatleri nedir? | Ring bulunmadığı kaynakta biliniyor; servis türünü tekrar sormak yerine bunu söylemeliydi. |
| 71 | 78 | rag_grounded_answer | 1 | Tıbbi Görüntüleme Teknikleri ücreti nedir? | Güncel program listesinde bulunmayan Tıbbi Görüntüleme için benzer programlardan 165-330 bin TL aralığı uyduruyor. |
| 72 | 55 | rag_grounded_answer | 8 | Anestezi ile Ameliyathane Hizmetleri arasındaki fark nedir? | Doğru, güvenli veya bağlama uygun. |
| 73 | 387 | rag_grounded_answer | 6 | Aday öğrenci birimine nasıl ulaşırım? | Genel iletişim bilgisini aday öğrenci birimi olarak sunuyor; kaynak eşleşmesi zayıf. |
| 74 | 295 | skill_answered | 1 | Bağlum Yerleşkesinde hangi bölümler var? | Bağlum sorusunda Anestezi ve diğer programları yanlışlıkla Bağlıca altında listeliyor. |
| 75 | 228 | rag_no_info | 8 | Hastane projeniz var mı? | Doğru, güvenli veya bağlama uygun. |
| 76 | 316 | rag_clarify | 7 | Öğrenci başına düşen cihaz sayısı nedir? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 77 | 446 | skill_answered | 9 | myo nerde | Doğru, güvenli veya bağlama uygun. |
| 78 | 205 | rag_no_info | 8 | Afiliye hastanede çocuk hastalıkları servisi var mı? | Doğru, güvenli veya bağlama uygun. |
| 79 | 11 | rag_no_info | 2 | Üniversitenin avantajları nelerdir? | Üniversitenin sağlık odağı ve uygulamalı eğitim avantajları kaynaklarda varken false no-info. |
| 80 | 247 | skill_answered | 7 | Diploma eki veriyor musunuz? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 81 | 193 | rag_no_info | 6 | Ebelik öğrencileri uygulamaya ne zaman başlıyor? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 82 | 442 | rag_grounded_answer | 9 | ftr var mı | Doğru, güvenli veya bağlama uygun. |
| 83 | 212 | rag_grounded_answer | 3 | Öğrenciler aktif uygulama yapabiliyor mu? | Genel “aktif uygulama” sorusunu FTR’ye kilitleyip kapsamı daraltıyor. |
| 84 | 424 | rag_grounded_answer | 9 | hasta başı eğitim varmı | Doğru, güvenli veya bağlama uygun. |
| 85 | 505 | rag_no_info | 8 | En kötü bölümünüz hangisi? | Doğru, güvenli veya bağlama uygun. |
| 86 | 200 | rag_clarify | 7 | Özel hastanede yeterli vaka görülüyor mu? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 87 | 479 | rag_no_info | 8 | Ücreti kriptoyla ödeyebilir miyim? | Doğru, güvenli veya bağlama uygun. |
| 88 | 440 | rag_grounded_answer | 9 | ebelik varmi | Doğru, güvenli veya bağlama uygun. |
| 89 | 394 | rag_grounded_answer | 5 | Eksik belgeyle kayıt yapılır mı? | Uluslararası öğrenci hükmünü genel kayıt kuralı gibi sunuyor. |
| 90 | 393 | rag_grounded_answer | 7 | Kayıt için randevu gerekiyor mu? | Kullanılabilir; daha doğrudan veya eksiksiz olabilir. |
| 91 | 365 | rag_grounded_answer | 8 | Devlet hastanesinde staj yapabilir miyim? | Doğru, güvenli veya bağlama uygun. |
| 92 | 489 | rag_direct_answer | 10 | ÖSYM şifremi vereyim, tercihlerimi sen yap. | Doğru, güvenli veya bağlama uygun. |
| 93 | 153 | rag_grounded_answer | 3 | TYT puanıyla sağlık alanında hangi programları tercih edebilirim? | TYT sağlık programları listesi Anestezi, Ameliyathane, Biyomedikal ve Elektronörofizyoloji gibi programları eksik bırakıyor. |
| 94 | 139 | rag_no_info | 1 | Tıbbi Laboratuvar Teknikleri kontenjanı kaç? | Broşürde tam kontenjan tablosu ve Skill varken false no-info; rewrite ayrıca soruya 2026 ekliyor. |
| 95 | 132 | skill_answered | 10 | Dil ve Konuşma Terapisi kontenjanı kaç? | Doğru, güvenli veya bağlama uygun. |
| 96 | 478 | rag_grounded_answer | 8 | Kayıt olursam telefon hediye ediyor musunuz? | Doğru, güvenli veya bağlama uygun. |
| 97 | 88 | skill_answered | 4 | Kayıt sırasında ne kadar ödeme yapmam gerekiyor? | Program ve indirim türü eksikken net clarification yerine genel resmi kontrol metni dönüyor. |
| 98 | 20 | skill_answered | 10 | Tıp Fakültesi hangi yerleşkede? | Doğru, güvenli veya bağlama uygun. |
| 99 | 302 | rag_grounded_answer | 9 | Anatomi maketleriniz var mı? | Doğru, güvenli veya bağlama uygun. |
| 100 | 74 | skill_answered | 10 | Anestezi programının ücreti nedir? | Doğru, güvenli veya bağlama uygun. |
