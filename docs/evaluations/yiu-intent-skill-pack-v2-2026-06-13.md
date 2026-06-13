# YİÜ Intent Skill Pack V2

Durum: V2 sadeleştirme paketi DB'ye push edildi. Yakın skill'ler merge edildi, eksik broşür/program coverage'ı eklendi. Follow-up/engagement cümleleri bu revizyonda bilinçli olarak zincirleme skill tetikleyecek şekilde değiştirilmedi.
Hazırlanma tarihi: 2026-06-13
Hedef: Yüksek İhtisas Üniversitesi demo botu için RAG öncesinde semantik Skill matching ile güvenli, çakışması azaltılmış intent/yetenek paketi.

## V2 Değişiklik Özeti

- Merge: `tip_fakultesi_var_mi` + `tip_fakultesi_egitim_dili` -> `tip_programlari_ve_egitim_dili`.
- Merge: `tip_ucret_turkce` + `tip_ucret_ingilizce` -> `tip_ucretleri`.
- Merge: `tip_kontenjan_turkce` + `tip_kontenjan_ingilizce` -> `tip_kontenjanlari`.
- Merge: `tip_taban_puan` + `tip_basari_sirasi` -> `tip_puan_ve_basari_sirasi`.
- Merge: `tip_sinif_gecme_not_hesabi` + `tip_finale_girmeden_gecme` + `tip_butunleme_sinavi` -> `tip_sinav_gecme_final_butunleme`.
- Widen: burs genel intent'i `burs_ve_indirimler_genel` olarak güçlendirildi.
- Add: SHMYO eksik program değerleri, lisans/ön lisans fizyoterapi ayrımı, diploma eki/mavi diploma sınırı, kayıt/resmi kontrol, akademik takvim/duyuru, öğrenci yaşamı kapsamı.
- DB push notu: Script v2 push sırasında prefix altındaki v2'de bulunmayan eski `YİÜ Intent - ...` skill'leri disable eder; silmez.

## DB Push Kaydı

- Push tarihi: 2026-06-13
- Script: `scripts/skills/push-yiu-intent-skill-pack.ts`
- Demo slug: `yiu-tanitim-gunleri-2026`
- Organizasyon ID: `50102447-4bb2-4bd5-a332-fb721a3c7949`
- Aktif v2 skill sayısı: 60
- İlk v2 push sonucu: 12 inserted, 48 unchanged, 12 stale v1 skill disabled
- İkinci trigger düzeltme push sonucu: 4 updated, 56 unchanged
- Son embedding sonucu: 377 `skill_embeddings` satırı yenilendi

## Kaynaklar

- Yüksek İhtisas Üniversitesi ana web sitesi: `https://yuksekihtisasuniversitesi.edu.tr/`
- Eklenen broşür: `/Users/togay/Downloads/son-brosurrrrr-2.pdf`
- Doğrulanmış broşür markdown çıkarımı: `tmp/rag-evals/yiu-brochure/yiu-admissions-brochure-verified.md`
- Kurumsal mevzuat sayfası: `https://yuksekihtisasuniversitesi.edu.tr/sayfa/kurumsal/kurumsal-bilgiler/mevzuat`
- Tıp Fakültesi yönergeleri sayfası: `https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi/mevzuatlar/yonergeler`
- Mevzuat/Tıp yönerge PDF havuzu: `tmp/rag-evals/yiu-link-pdfs/pdf-links.json`

## Kullanım Notları

- Her intent en az 5 kullanıcı örneği ve 1 instructed cevap içerir.
- Cevaplar kısa, doğrudan ve kullanıcıya dönük yazılmıştır.
- Fiyat, kontenjan, taban puan ve başarı sırası cevaplarında 2025 broşür bilgisi ve 2024 referans verisi ayrımı korunmalıdır.
- Kesinlik gerektiren tercih/kayıt konularında ÖSYM kılavuzu ve üniversitenin güncel duyuruları son doğrulama kaynağıdır.
- Fiziksel cihaz, laboratuvar, servis, yurt gibi konularda kaynakta doğrudan kanıt yoksa olumlu varlık iddiası yapılmamalıdır.

---

## 01. universite_genel_tanitim

Amaç: Üniversitenin kısa tanıtımı, kuruluş hikayesi ve sağlık odağı.

Kullanıcı örnekleri:
- Yüksek İhtisas Üniversitesi nasıl bir üniversite?
- YİÜ hakkında bilgi verir misin?
- Bu üniversiteyi kısaca anlatır mısın?
- Yüksek İhtisas özel mi?
- Üniversitenizin geçmişi nedir?

Instructed cevap:
Yüksek İhtisas Üniversitesi, Ankara'da bulunan bir vakıf üniversitesidir. Tanıtım kaynaklarında üniversitenin Türkiye Yüksek İhtisas Hastanesi Vakfı tarafından kurulduğu, sağlık alanındaki geçmişini eğitim, araştırma ve topluma hizmet odağıyla sürdürdüğü belirtilir.

Broşürde Tıp Fakültesi, Sağlık Bilimleri Fakültesi, Spor Bilimleri Fakültesi, Sağlık Hizmetleri Meslek Yüksekokulu ve Meslek Yüksekokulu ile özellikle sağlık bilimleri alanında insan gücü yetiştirildiği vurgulanır.

Kaynak notu: Ana web sitesi, aday öğrenci sayfası, tanıtım broşürü.

---

## 02. akademik_birimler_genel

Amaç: Üniversitedeki fakülte/yüksekokul türlerini genel listelemek.

Kullanıcı örnekleri:
- Hangi fakülteler var?
- Üniversitede hangi bölümler var?
- Akademik birimleriniz neler?
- YİÜ'de hangi okullar bulunuyor?
- Fakülte ve yüksekokulları sayar mısın?

Instructed cevap:
Yüksek İhtisas Üniversitesi tanıtım kaynaklarında şu akademik birimler öne çıkar:

- Tıp Fakültesi
- Sağlık Bilimleri Fakültesi
- Spor Bilimleri Fakültesi
- Sağlık Hizmetleri Meslek Yüksekokulu
- Meslek Yüksekokulu
- Lisansüstü Eğitim Enstitüsü
- Yabancı Diller Yüksekokulu

Hangi programı düşündüğünü söylersen ücret, kontenjan, yerleşke veya eğitim süresi gibi bilgileri daha net paylaşabilirim.

Kaynak notu: Ana web sitesi menüsü, tanıtım broşürü.

---

## 03. kampusler_genel_adres

Amaç: "Kampüsler nerede?" gibi genel yerleşke sorularını doğrudan cevaplamak.

Kullanıcı örnekleri:
- Kampüsler nerede?
- Yerleşkeleriniz hangi semtte?
- Üniversite hangi kampüslerde eğitim veriyor?
- YİÜ kampüs adresleri neler?
- Kampüs adreslerini yazar mısın?

Instructed cevap:
Yüksek İhtisas Üniversitesi için kaynaklarda şu yerleşkeler yer alıyor:

- 100. Yıl / İşçi Blokları Yerleşkesi: İşçi Blokları Mahallesi 1505. Sokak / Cadde No:18/A, Çankaya, Ankara
- Balgat Yerleşkesi: Oğuzlar Mahallesi 1375. Sokak No:8, Balgat, Ankara
- Bağlum Yerleşkesi: Karakaya Mahallesi Bağlum Bulvarı No:1, Keçiören, Ankara
- Bağlıca Yerleşkesi: Bağlıca Mahallesi, Höyük Caddesi No:1, Bağlıca, Ankara

Hangi fakülte veya programı düşündüğünü yazarsan ilgili yerleşkeyi ayrıca söyleyebilirim.

Kaynak notu: Web sitesi iletişim/footer bilgileri, tanıtım broşürü yerleşke eşleşmeleri.

---

## 04. tip_kampusu_adres

Amaç: Tıp Fakültesi'nin yerleşkesini ve adresini cevaplamak.

Kullanıcı örnekleri:
- Tıp Fakültesi hangi kampüste?
- Tıp kampüsü nerede?
- Tıp Fakültesi adresi nedir?
- Tıp nerede okunuyor?
- İngilizce Tıp hangi yerleşkede?

Instructed cevap:
Tıp Fakültesi, kaynaklarda 100. Yıl / İşçi Blokları Yerleşkesi ile eşleşiyor. Adres: İşçi Blokları Mahallesi 1505. Sokak No:18/A, Çankaya / Ankara.

Broşürde Tıp Fakültesi Türkçe ve İngilizce programlarının aynı yerleşke başlığı altında gösterildiğini görüyoruz.

Kaynak notu: Tanıtım broşürü program-yerleşke eşleşmesi, web sitesi iletişim sayfası.

---

## 05. saglik_bilimleri_kampusu_adres

Amaç: Sağlık Bilimleri Fakültesi yerleşkesini cevaplamak.

Kullanıcı örnekleri:
- Sağlık Bilimleri Fakültesi nerede?
- SBF kampüsü nerede?
- Hemşirelik hangi kampüste?
- Dil ve Konuşma Terapisi hangi yerleşkede?
- Sağlık Bilimleri adresi nedir?

Instructed cevap:
Tanıtım broşüründe Sağlık Bilimleri Fakültesi programları Bağlıca Yerleşkesi ile eşleşiyor. Adres: Bağlıca Mahallesi, Höyük Caddesi No:1, Bağlıca / Ankara.

Bu yerleşke altında Ergoterapi, Ebelik, Hemşirelik, Beslenme ve Diyetetik, Fizyoterapi ve Rehabilitasyon, Dil ve Konuşma Terapisi ve Sağlık Yönetimi programları listeleniyor.

Kaynak notu: Tanıtım broşürü program-yerleşke eşleşmesi.

---

## 06. shmyo_kampusleri

Amaç: Sağlık Hizmetleri MYO'nun Bağlum/Balgat ayrımını açıklamak.

Kullanıcı örnekleri:
- SHMYO hangi kampüste?
- Sağlık Hizmetleri Meslek Yüksekokulu nerede?
- Anestezi hangi yerleşkede?
- Tıbbi Laboratuvar hangi kampüste?
- İlk ve Acil Yardım kampüsü neresi?

Instructed cevap:
Tanıtım broşüründe Sağlık Hizmetleri Meslek Yüksekokulu programları iki yerleşkeye ayrılmış görünüyor:

- Bağlum Yerleşkesi: Anestezi, Ameliyathane Hizmetleri, İlk ve Acil Yardım, Tıbbi Tanıtım ve Pazarlama, Optisyenlik, Tıbbi Dokümantasyon ve Sekreterlik, Tele-Sağlık Teknikerliği.
- Balgat Yerleşkesi: Elektronörofizyoloji, Biyomedikal Cihaz Teknolojisi, Fizyoterapi, Tıbbi Veri İşleme Teknikerliği, Tıbbi Laboratuvar Teknikleri.

Bağlum adresi Karakaya Mahallesi Bağlum Bulvarı No:1 Keçiören / Ankara; Balgat adresi Oğuzlar Mahallesi 1375. Sokak No:8 Balgat / Ankara.

Kaynak notu: Tanıtım broşürü program-yerleşke eşleşmesi.

---

## 07. myo_spor_kampusu

Amaç: MYO ve Spor Bilimleri Fakültesi yerleşkesini cevaplamak.

Kullanıcı örnekleri:
- Meslek Yüksekokulu hangi kampüste?
- Bilgisayar Programcılığı nerede?
- Grafik Tasarım kampüsü neresi?
- Spor Bilimleri Fakültesi nerede?
- Antrenörlük Eğitimi hangi yerleşkede?

Instructed cevap:
Tanıtım broşüründe Meslek Yüksekokulu ve Spor Bilimleri Fakültesi Balgat Yerleşkesi ile eşleşiyor.

Balgat Yerleşkesi adresi: Oğuzlar Mahallesi 1375. Sokak No:8, Balgat / Ankara.

Broşürde Meslek Yüksekokulu altında Bilgisayar Programcılığı, Eczane Hizmetleri, Elektrik ve Grafik Tasarım; Spor Bilimleri Fakültesi altında Antrenörlük Eğitimi listeleniyor.

Kaynak notu: Tanıtım broşürü program-yerleşke eşleşmesi.

---

## 08. iletisim_genel

Amaç: Telefon, e-posta ve öğrenci işleri iletişim sorularını karşılamak.

Kullanıcı örnekleri:
- Telefon numaranız nedir?
- Öğrenci işlerine nasıl ulaşırım?
- YİÜ iletişim bilgisi verir misin?
- Tıp Fakültesi öğrenci işleri numarası var mı?
- Üniversiteye nasıl ulaşabilirim?

Instructed cevap:
Web sitesi ve broşürde genel iletişim için ana telefon `0 (312) 329 10 10` olarak yer alıyor. Bağlum yerleşkesi için broşürde `0 (312) 329 74 25` telefonu da verilmiş.

Web sitesi iletişim sayfasında Tıp Fakültesi öğrenci işleri için ana hat üzerinden dahili bilgiler de listeleniyor. Kesin ve güncel birim yönlendirmesi için üniversitenin iletişim sayfasını veya ana santrali kullanmanı öneririm.

Kaynak notu: Web sitesi iletişim sayfası, tanıtım broşürü.

---

## 09. konaklama_yurt_bilgisi

Amaç: Yurt/konaklama sorularında güvenli ve yardımcı cevap vermek.

Kullanıcı örnekleri:
- Yurt var mı?
- Konaklama imkanı var mı?
- Öğrenciler nerede kalıyor?
- Üniversitenin yurdu var mı?
- Yurt ücretleri nerede yazıyor?

Instructed cevap:
Tanıtım broşüründe konaklama bilgileri için üniversitenin resmi konaklama/yurt sayfasına yönlendirme bulunuyor. Ancak broşürde bu başlık altında net yurt adı, kontenjan veya ücret listesi verilmediği için kesin bilgi vermek doğru olmaz.

Yurt, başvuru, ücret ve kontenjan gibi konularda güncel bilgiyi üniversitenin resmi konaklama sayfasından veya öğrenci işleri/aday öğrenci biriminden teyit etmeni öneririm.

Kaynak notu: Tanıtım broşürü QR bağlantıları, web sitesi yurtlar sayfası menüsü.

---

## 10. ulasim_bilgisi

Amaç: Ulaşım/servis sorularında servis uydurmadan yönlendirmek.

Kullanıcı örnekleri:
- Kampüse nasıl giderim?
- Servis var mı?
- Ulaşım bilgisi verir misin?
- Tıp kampüsüne ulaşım nasıl?
- Bağlum'a nasıl ulaşırım?

Instructed cevap:
Kaynaklarda yerleşke adresleri ve ulaşım bilgileri için resmi bağlantı yer alıyor; fakat servis güzergahı, saatleri veya servis varlığı için net bir tablo görmüyorum.

Bu nedenle adresi paylaşabilirim: hangi fakülte veya programı soruyorsan ilgili yerleşkeyi söyle. Servis/güzergah gibi değişebilen bilgiler için üniversitenin güncel ulaşım duyurusunu veya ilgili yerleşke öğrenci işlerini teyit etmek en güvenlisi.

Kaynak notu: Tanıtım broşürü ulaşım QR bağlantısı, yerleşke adresleri.

---

## 11. tip_fakultesi_genel_bilgi

Amaç: Tıp Fakültesi hakkında genel tanıtım sorularını cevaplamak.

Kullanıcı örnekleri:
- Tıp Fakültesi hakkında bilgi verir misin?
- Tıp eğitiminiz nasıl?
- Yüksek İhtisas Tıp nasıl bir fakülte?
- Tıp Fakültenizi anlatır mısınız?
- Neden Yüksek İhtisas Tıp?

Instructed cevap:
Yüksek İhtisas Üniversitesi Tıp Fakültesi; entegre teorik ve pratik eğitim, Probleme Dayalı Öğrenim, birinci sınıftan itibaren Klinik Beceri Eğitimi, İletişim Becerileri Eğitimi, Kanıta Dayalı Tıp Eğitimi, modern laboratuvarlar, kadavra diseksiyonu ve multidisipliner laboratuvar uygulamaları gibi başlıklarla tanıtılmaktadır.

Tıp eğitimi yoğun ve uzun soluklu bir süreçtir. Bu nedenle tercih yaparken sadece puan ve ücret değil; eğitim modeli, uygulama olanakları, klinik eğitim süreci, akademik kadro ve mesleğe kişisel uygunluk birlikte değerlendirilmelidir.

Kaynak notu: Tıp Fakültesi web içeriği, tanıtım broşürü, Tıp yönergeleri.

---

## 12. tip_programlari_ve_egitim_dili

Amaç: Tıp programının varlığı, Türkçe/İngilizce seçenekleri ve öğretim dili sorularını tek yerde cevaplamak.

Kullanıcı örnekleri:
- Üniversitenizde Tıp Fakültesi var mı?
- Tıp bölümü var mı?
- Tıp Fakültesi Türkçe mi İngilizce mi?
- İngilizce Tıp var mı?
- Türkçe Tıp var mı?
- Tıp programının dili nedir?

Instructed cevap:
Evet, Yüksek İhtisas Üniversitesinde Tıp Fakültesi bulunmaktadır. Tanıtım broşüründe Tıp Fakültesi için Türkçe ve İngilizce program satırları ayrı ayrı listelenmiştir.

Programların güncel kontenjanı, burs türü, ücreti, öğretim dili ve özel koşulları her tercih döneminde ÖSYM kılavuzu ve üniversitenin güncel aday öğrenci duyuruları ile kesinleşir. Tercih yapmadan önce ilgili yılın ÖSYM kılavuzunda program adını ve özel koşulları kontrol etmek gerekir.

Kaynak notu: Tanıtım broşürü Tıp Fakültesi tablosu, ana web sitesi akademik birimler.

---

## 14. tip_fakultesi_egitim_suresi

Amaç: Tıp Fakültesi kaç yıl sorularını yanıtlamak.

Kullanıcı örnekleri:
- Tıp kaç yıl?
- Tıp Fakültesi eğitim süresi ne kadar?
- YİÜ Tıp kaç senelik?
- Tıp okumak kaç yıl sürüyor?
- Tıp Fakültesi 6 yıl mı?

Instructed cevap:
Tıp Fakültesinde eğitim süresi 6 yıldır. Tıp eğitiminde ilk yıllar preklinik dönem, sonraki yıllar klinik stajlar ve son yıl Dönem VI intörnlük eğitimi şeklinde yapılandırılır.

İngilizce program veya hazırlık koşulu gibi özel durumlar için ilgili yılın ÖSYM kılavuzu ve üniversite duyuruları ayrıca kontrol edilmelidir.

Kaynak notu: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi, Tıp web içerikleri.

---

## 15. tip_fakultesi_egitim_modeli

Amaç: Tıp eğitim modelini dönemler bazında açıklamak.

Kullanıcı örnekleri:
- Tıp eğitimi nasıl ilerliyor?
- Preklinik ve klinik dönem nasıl?
- Tıp Fakültesinde stajlar ne zaman başlıyor?
- Tıp programının yapısı nasıl?
- İlk 3 yıl ve son yıllar nasıl ayrılıyor?

Instructed cevap:
Tıp Fakültesi eğitim yapısı kaynaklarda genel olarak şöyle anlatılıyor: Dönem I, II ve III'te ders kurulları ağırlıklı Harmanlanmış/Hibrit Preklinik Tıp Bilimleri eğitimi; Dönem IV ve V'te klinik stajlardan oluşan Klinik Tıp Bilimleri eğitimi; Dönem VI'da ise intörnlük eğitimi yer alır.

Bu yapı, temel tıp bilgisi ile klinik uygulamayı aşamalı şekilde birleştirmeyi hedefler.

Kaynak notu: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi.

---

## 16. tip_anatomi_laboratuvari_kadavra

Amaç: Anatomi laboratuvarı, kadavra ve maket sorularında doğrudan cevap vermek.

Kullanıcı örnekleri:
- Kadavra var mı?
- Anatomi laboratuvarınız var mı?
- Tıp öğrencileri kadavra görüyor mu?
- Anatomi maketleri var mı?
- Kadavra diseksiyonu yapılıyor mu?

Instructed cevap:
Evet, Tıp Fakültesi tanıtım içeriğinde anatomi laboratuvarında kadavra diseksiyonu imkanı ve maketlerle uygulamalar yer alıyor. Kaynaklarda ayrıca modern laboratuvarlar ve multidisipliner laboratuvar uygulamaları vurgulanıyor.

Ancak "her öğrenci kaç kez girer, grup sayısı nedir, uygulama takvimi nasıldır" gibi operasyonel detaylar için ilgili dönem ders programı veya fakülte duyuruları kontrol edilmelidir.

Kaynak notu: Tıp Fakültesi web içeriği, aday öğrenci içerikleri.

---

## 17. tip_klinik_beceri_egitimi

Amaç: Klinik Beceri Eğitimi ve pratik eğitim sorularını cevaplamak.

Kullanıcı örnekleri:
- Klinik beceri eğitimi var mı?
- Pratik eğitim ne zaman başlıyor?
- Birinci sınıftan uygulama oluyor mu?
- Tıp öğrencileri klinik beceri öğreniyor mu?
- Klinik Beceri Eğitimi ne demek?

Instructed cevap:
Tıp Fakültesi tanıtım ve yönerge kaynaklarında Klinik Beceri Eğitimi öne çıkan başlıklardan biridir. Bu eğitim, öğrencilerin hekimlik mesleğine yönelik temel klinik/pratik becerileri yapılandırılmış şekilde öğrenmesini hedefler.

Kaynaklarda Klinik Beceri Eğitimi Kurulu'nun yapısı, görevleri ve işleyişine ilişkin ayrı yönerge de bulunmaktadır. Güncel ders/dönem uygulamaları için ilgili akademik yıl programı ayrıca kontrol edilmelidir.

Kaynak notu: Tıp Fakültesi Klinik Beceri Eğitimi Yönergesi, Tıp web içeriği.

---

## 18. tip_kanita_dayali_tip

Amaç: Kanıta Dayalı Tıp eğitimi sorularını karşılamak.

Kullanıcı örnekleri:
- Kanıta Dayalı Tıp eğitimi var mı?
- KDT nedir?
- Tıp öğrencileri araştırma yapıyor mu?
- Bilimsel araştırma eğitimi veriliyor mu?
- Kanıta dayalı tıp kurulunuz var mı?

Instructed cevap:
Evet, Tıp Fakültesi kaynaklarında Kanıta Dayalı Tıp Eğitimi yer alıyor. Bu başlık, öğrencilerin bilimsel kanıtı değerlendirme, araştırma mantığıyla düşünme ve tıbbi kararları kanıta dayandırma becerilerini geliştirmeyi hedefleyen eğitim alanı olarak sunuluyor.

Tıp Fakültesi Kanıta Dayalı Tıp Kurulu Yönergesi de bu alandaki programların planlanması ve yürütülmesiyle ilgili düzenlemeleri içerir.

Kaynak notu: Tıp Fakültesi Kanıta Dayalı Tıp Kurulu Yönergesi, Tıp web içeriği.

---

## 19. tip_iletisim_becerileri

Amaç: İletişim becerileri eğitimi sorularını cevaplamak.

Kullanıcı örnekleri:
- Tıpta iletişim becerileri eğitimi var mı?
- Hasta ile iletişim öğretiliyor mu?
- İletişim Becerileri Eğitimi nedir?
- Tıp eğitiminde hasta iletişimi var mı?
- Doktorlukta iletişim dersi alıyor muyuz?

Instructed cevap:
Tıp Fakültesi kaynaklarında İletişim Becerileri Eğitimi ayrı bir eğitim başlığı olarak yer alıyor. Bu eğitim, hekimlik mesleğinde hasta, hasta yakını ve sağlık ekibiyle etkili iletişim kurma becerisini destekleyen alanlardan biridir.

Güncel ders saati, dönem dağılımı ve uygulama planı için ilgili akademik yıl ders programı veya fakülte duyuruları kontrol edilmelidir.

Kaynak notu: Tıp Fakültesi İletişim Becerileri Eğitimi Kurulu Yönergesi, Tıp web içeriği.

---

## 20. tip_ucretleri

Amaç: Tıp Türkçe/İngilizce ücret, burslu ve %50 indirimli fiyat sorularını tek tabloda cevaplamak.

Kullanıcı örnekleri:
- Tıp ücreti ne kadar?
- Türkçe Tıp kaç TL?
- İngilizce Tıp ücreti ne kadar?
- Tıp %50 indirimli kaç para?
- Tıp burslu ücret öder mi?
- Tıp İngilizce ücretli 2025 fiyatı nedir?

Instructed cevap:
2025 tanıtım broşüründeki Tıp Fakültesi satırlarına göre:

- Tıp Fakültesi (Ücretli): 720.000 TL
- Tıp Fakültesi (%50 İndirimli): 360.000 TL
- Tıp Fakültesi (Burslu): ücret alanı `-` olarak gösterilmiş
- Tıp Fakültesi (İngilizce) (Ücretli): 720.000 TL
- Tıp Fakültesi (İngilizce) (%50 İndirimli): 360.000 TL
- Tıp Fakültesi (İngilizce) (Burslu): ücret alanı `-` olarak gösterilmiş

Ayrıca broşürde Tıp Fakültesi hazırlık satırı için 410.000 TL bilgisi yer alır. Ücretler tercih/kayıt döneminde güncellenebileceği için kesin kontrolü üniversitenin güncel ücret duyurusu ve ÖSYM kılavuzu ile yapmak gerekir.

Kaynak notu: Tanıtım broşürü Tıp Fakültesi 2025 kontenjan ve fiyat tablosu.

---

## 22. tip_kontenjanlari

Amaç: Tıp Türkçe/İngilizce kontenjan, ücretli/burslu/%50 kontenjan sorularını tek yerde cevaplamak.

Kullanıcı örnekleri:
- Tıp kontenjanı kaç?
- Türkçe Tıp kaç kişi alıyor?
- İngilizce Tıp kontenjanı kaç?
- Tıp burslu kontenjan kaç?
- İngilizce Tıp %50 indirimli kontenjanı nedir?
- Tıp ücretli kontenjan kaç?

Instructed cevap:
2025 tanıtım broşüründeki Tıp Fakültesi kontenjanları şöyle:

Türkçe Tıp:
- Ücretli: 75
- Burslu: 13
- %50 İndirimli: 10

İngilizce Tıp:
- Ücretli: 41
- Burslu: 7
- %50 İndirimli: 6

Kontenjanlar tercih döneminde ÖSYM kılavuzu ile kesinleştiği için son ve bağlayıcı kontrol ilgili yılın ÖSYM kılavuzundan yapılmalıdır.

Kaynak notu: Tanıtım broşürü Tıp Fakültesi 2025 kontenjan ve fiyat tablosu.

---

## 24. tip_puan_ve_basari_sirasi

Amaç: Tıp taban puanı ve başarı sırası sorularını Türkçe/İngilizce, ücretli/burslu/%50 varyantlarıyla tek yerde cevaplamak.

Kullanıcı örnekleri:
- Tıp taban puanı kaç?
- Tıp başarı sırası kaç?
- İngilizce Tıp sıralaması nedir?
- Tıp burslu kaç binle almış?
- Tıp ücretli kaç puanla almış?
- Tıp %50 indirimli taban puanı nedir?

Instructed cevap:
Broşürde 2024 taban puanı ve başarı sırası referansları verilmiş. Tıp Fakültesi satırları şöyle:

- Tıp Fakültesi (Ücretli): taban puanı 453,467; başarı sırası 36.073
- Tıp Fakültesi (Burslu): taban puanı 497,406; başarı sırası 11.519
- Tıp Fakültesi (%50 İndirimli): taban puanı 483,077; başarı sırası 18.145
- Tıp Fakültesi (İngilizce) (Ücretli): taban puanı 448,213; başarı sırası 39.907
- Tıp Fakültesi (İngilizce) (Burslu): taban puanı 496,513; başarı sırası 11.890
- Tıp Fakültesi (İngilizce) (%50 İndirimli): taban puanı 479,259; başarı sırası 20.117

Bunlar geçmiş yıl referansıdır; yerleşme garantisi vermez. Güncel tercih için ilgili yılın ÖSYM kılavuzu esas alınmalıdır.

Kaynak notu: Tanıtım broşürü Tıp Fakültesi 2024 taban puanı ve başarı sırası sütunları.

---

## 26. tip_hazirlik

Amaç: Tıp hazırlık ve hazırlık ücreti sorularında güvenli cevap vermek.

Kullanıcı örnekleri:
- İngilizce Tıp'ta hazırlık var mı?
- Tıp hazırlık ücreti ne kadar?
- Hazırlık kaç para?
- Tıp Fakültesi hazırlık zorunlu mu?
- İngilizce hazırlık fiyatı nedir?

Instructed cevap:
2025 tanıtım broşüründe Tıp Fakültesi için hazırlık satırında 410.000 TL fiyat bilgisi yer alıyor.

Ancak hazırlığın hangi öğrenci için zorunlu olduğu, muafiyet koşulları ve güncel uygulama ilgili yılın ÖSYM kılavuzu, Yabancı Diller Yüksekokulu duyuruları ve üniversitenin güncel kayıt duyurularıyla doğrulanmalıdır. Hazırlıkla ilgili kesin karar için bu resmi kaynakları kontrol etmek gerekir.

Kaynak notu: Tanıtım broşürü Tıp Fakültesi hazırlık satırı, hazırlık muafiyet duyuruları.

---

## 27. saglik_bilimleri_programlari

Amaç: Sağlık Bilimleri Fakültesi programlarını listelemek.

Kullanıcı örnekleri:
- Sağlık Bilimleri Fakültesinde hangi bölümler var?
- SBF programları neler?
- Hemşirelik var mı?
- Dil ve Konuşma Terapisi var mı?
- Sağlık alanında 4 yıllık hangi bölümler var?

Instructed cevap:
Tanıtım broşüründe Sağlık Bilimleri Fakültesi altında şu programlar listeleniyor:

- Beslenme ve Diyetetik
- Dil ve Konuşma Terapisi
- Fizyoterapi ve Rehabilitasyon
- Hemşirelik
- Sağlık Yönetimi
- Ergoterapi
- Ebelik

Hangi programı düşündüğünü söylersen ücret, kontenjan, puan türü veya yerleşke bilgisini ayrıca paylaşabilirim.

Kaynak notu: Tanıtım broşürü program listeleri.

---

## 28. saglik_bilimleri_ucret_genel

Amaç: SBF program ücretlerini genel grup olarak cevaplamak.

Kullanıcı örnekleri:
- Sağlık Bilimleri ücretleri ne kadar?
- SBF bölümleri kaç para?
- 4 yıllık sağlık bölümleri ücretleri nedir?
- Hemşirelik ve DKT fiyatları aynı mı?
- Sağlık Bilimleri %50 indirimli ücretler nedir?

Instructed cevap:
2025 tanıtım broşürüne göre Sağlık Bilimleri Fakültesinde birçok program için ücretli fiyat 490.000 TL, %50 indirimli fiyat 245.000 TL olarak listelenmiş. Bu grup Beslenme ve Diyetetik, Dil ve Konuşma Terapisi, Fizyoterapi ve Rehabilitasyon ve Hemşirelik satırlarında görülür.

Sağlık Yönetimi için ücretli 460.000 TL, %50 indirimli 230.000 TL; Ergoterapi ve Ebelik için de ücretli 460.000 TL, %50 indirimli 230.000 TL bilgisi yer alır.

Hangi programı sorduğunu yazarsan kontenjan ve taban puanla birlikte net satırı paylaşabilirim.

Kaynak notu: Tanıtım broşürü Sağlık Bilimleri Fakültesi 2025 tablosu.

---

## 29. hemsirelik_ucret_kontenjan

Amaç: Hemşirelik ücret/kontenjan/sıralama sorularını cevaplamak.

Kullanıcı örnekleri:
- Hemşirelik kaç para?
- Hemşirelik kontenjanı kaç?
- Hemşirelik burslu var mı?
- Hemşirelik %50 indirimli fiyatı nedir?
- Hemşirelik taban puanı kaç?

Instructed cevap:
2025 tanıtım broşüründe Hemşirelik için satırlar şöyle:

- Hemşirelik (Ücretli): kontenjan 2, 2025 fiyat 490.000 TL, 2024 taban puanı 286,806, başarı sırası 313.101
- Hemşirelik (Burslu): kontenjan 7, fiyat alanı `-`, 2024 taban puanı 360,410, başarı sırası 131.581
- Hemşirelik (%50 İndirimli): kontenjan 45, 2025 fiyat 245.000 TL, 2024 taban puanı 301,991, başarı sırası 258.575

Bu bilgiler broşür referansıdır; kesin kontenjan ve koşullar için ÖSYM kılavuzu kontrol edilmelidir.

Kaynak notu: Tanıtım broşürü Sağlık Bilimleri Fakültesi tablosu.

---

## 30. dil_konusma_terapisi_ucret_kontenjan

Amaç: DKT programı ücret/kontenjan sorularını cevaplamak.

Kullanıcı örnekleri:
- Dil ve Konuşma Terapisi kaç para?
- DKT kontenjanı kaç?
- Dil konuşma burslu var mı?
- DKT %50 indirimli fiyatı nedir?
- Dil ve Konuşma Terapisi taban puanı kaç?

Instructed cevap:
2025 tanıtım broşüründe Dil ve Konuşma Terapisi için satırlar şöyle:

- Dil ve Konuşma Terapisi (Ücretli): kontenjan 2, 2025 fiyat 490.000 TL, 2024 taban puanı 288,301, başarı sırası 307.129
- Dil ve Konuşma Terapisi (Burslu): kontenjan 7, fiyat alanı `-`, 2024 taban puanı 406,296, başarı sırası 76.136
- Dil ve Konuşma Terapisi (%50 İndirimli): kontenjan 40, 2025 fiyat 245.000 TL, 2024 taban puanı 296,474, başarı sırası 277.071

Kaynak notu: Tanıtım broşürü Sağlık Bilimleri Fakültesi tablosu.

---

## 31. fizyoterapi_rehabilitasyon_ucret_kontenjan

Amaç: FTR lisans programının ücret/kontenjan sorularını cevaplamak.

Kullanıcı örnekleri:
- Fizyoterapi ve Rehabilitasyon kaç para?
- FTR kontenjanı kaç?
- Fizyoterapi lisans mı?
- FTR burslu var mı?
- Fizyoterapi taban puanı kaç?

Instructed cevap:
2025 tanıtım broşüründe Fizyoterapi ve Rehabilitasyon için satırlar şöyle:

- Fizyoterapi ve Rehabilitasyon (Ücretli): kontenjan 2, 2025 fiyat 490.000 TL, 2024 taban puanı 252,411, başarı sırası 510.665
- Fizyoterapi ve Rehabilitasyon (Burslu): kontenjan 7, fiyat alanı `-`, 2024 taban puanı 310,627, başarı sırası 233.156
- Fizyoterapi ve Rehabilitasyon (%50 İndirimli): kontenjan 40, 2025 fiyat 245.000 TL, 2024 taban puanı 253,403, başarı sırası 504.403

"Fizyoterapi ve Rehabilitasyon" Sağlık Bilimleri Fakültesi lisans programıdır; SHMYO'daki "Fizyoterapi" ön lisans programıyla karıştırılmamalıdır.

Kaynak notu: Tanıtım broşürü Sağlık Bilimleri Fakültesi tablosu.

---

## 32. beslenme_diyetetik_ucret_kontenjan

Amaç: Beslenme ve Diyetetik ücret/kontenjan sorularını cevaplamak.

Kullanıcı örnekleri:
- Beslenme ve Diyetetik kaç para?
- Diyetisyenlik kontenjanı kaç?
- Beslenme burslu var mı?
- Beslenme %50 indirimli fiyatı nedir?
- Beslenme ve Diyetetik taban puanı kaç?

Instructed cevap:
2025 tanıtım broşüründe Beslenme ve Diyetetik için satırlar şöyle:

- Beslenme ve Diyetetik (Ücretli): kontenjan 2, 2025 fiyat 490.000 TL, 2024 taban puanı 259,245, başarı sırası 458.987
- Beslenme ve Diyetetik (Burslu): kontenjan 7, fiyat alanı `-`, 2024 taban puanı 335,804, başarı sırası 173.823
- Beslenme ve Diyetetik (%50 İndirimli): kontenjan 40, 2025 fiyat 245.000 TL, 2024 taban puanı 261,341, başarı sırası 444.798

Kaynak notu: Tanıtım broşürü Sağlık Bilimleri Fakültesi tablosu.

---

## 33. ergoterapi_ebelik_ucret_kontenjan

Amaç: Yeni/puanı olmayan Ergoterapi ve Ebelik satırlarını güvenli cevaplamak.

Kullanıcı örnekleri:
- Ergoterapi ücreti nedir?
- Ebelik kaç para?
- Ergoterapi kontenjanı kaç?
- Ebelik kontenjanı kaç?
- Ebelik burslu var mı?
- Ergoterapi taban puanı neden yok?

Instructed cevap:
2025 tanıtım broşüründe Ergoterapi ve Ebelik için şu bilgiler yer alıyor:

- Ergoterapi: ücretli kontenjan 6 ve fiyat 460.000 TL; burslu kontenjan 4; %50 indirimli kontenjan 19 ve fiyat 230.000 TL.
- Ebelik: ücretli kontenjan 6 ve fiyat 460.000 TL; burslu kontenjan 4; %50 indirimli kontenjan 19 ve fiyat 230.000 TL.

Broşürde bu iki program için 2024 taban puanı ve başarı sırası alanları `-` olarak gösterilmiş. Bu nedenle geçmiş yıl puanı yerine güncel ÖSYM kılavuzunu kontrol etmek gerekir.

Kaynak notu: Tanıtım broşürü Sağlık Bilimleri Fakültesi tablosu.

---

## 34. saglik_yonetimi_ea

Amaç: EA puan türü ve Sağlık Yönetimi sorularını cevaplamak.

Kullanıcı örnekleri:
- EA bölüm var mı?
- Sağlık Yönetimi hangi puan türü?
- Eşit ağırlıkla hangi bölüm var?
- Sağlık Yönetimi ücreti ne kadar?
- Sağlık Yönetimi kontenjanı kaç?

Instructed cevap:
Tanıtım broşüründe EA puan türüyle listelenen program Sağlık Yönetimi'dir.

2025 broşür satırları:

- Sağlık Yönetimi (Ücretli): kontenjan 2, fiyat 460.000 TL, 2024 taban puanı 211,394, başarı sırası 1.366.894
- Sağlık Yönetimi (Burslu): kontenjan 7, fiyat alanı `-`, 2024 taban puanı 297,876, başarı sırası 364.146
- Sağlık Yönetimi (%50 İndirimli): kontenjan 40, fiyat 230.000 TL, 2024 taban puanı 226,124, başarı sırası 1.159.672

Kaynak notu: Tanıtım broşürü Sağlık Bilimleri Fakültesi tablosu.

---

## 35. shmyo_programlari

Amaç: Sağlık Hizmetleri MYO programlarını listelemek.

Kullanıcı örnekleri:
- SHMYO'da hangi programlar var?
- 2 yıllık sağlık bölümleri neler?
- TYT sağlık programları hangileri?
- Anestezi var mı?
- İlk ve Acil Yardım var mı?

Instructed cevap:
Tanıtım broşüründe Sağlık Hizmetleri Meslek Yüksekokulu altında şu programlar listeleniyor:

- Ameliyathane Hizmetleri
- Anestezi
- Biyomedikal Cihaz Teknolojisi
- Elektronörofizyoloji
- Optisyenlik
- Tıbbi Dokümantasyon ve Sekreterlik
- Tıbbi Laboratuvar Teknikleri
- Tıbbi Tanıtım ve Pazarlama
- Fizyoterapi
- İlk ve Acil Yardım
- Tele-Sağlık Teknikerliği
- Tıbbi Veri İşleme Teknikerliği

Bu programlar TYT puan türüyle listelenmiştir.

Kaynak notu: Tanıtım broşürü SHMYO program listesi ve tablosu.

---

## 36. shmyo_ucret_genel

Amaç: SHMYO ücretlerini genel cevaplamak.

Kullanıcı örnekleri:
- SHMYO ücretleri ne kadar?
- 2 yıllık sağlık bölümleri kaç para?
- Anestezi ve ameliyathane kaç TL?
- Sağlık meslek yüksekokulu fiyatları nedir?
- TYT sağlık programlarında %50 indirimli fiyat ne?

Instructed cevap:
2025 tanıtım broşüründe SHMYO programlarının çoğunda ücretli fiyat 330.000 TL, %50 indirimli fiyat 165.000 TL olarak listeleniyor. Buna Ameliyathane Hizmetleri, Anestezi, Biyomedikal Cihaz Teknolojisi, Elektronörofizyoloji, Optisyenlik, Tıbbi Dokümantasyon ve Sekreterlik, Tıbbi Laboratuvar Teknikleri ve İlk ve Acil Yardım gibi programlar dahildir.

Fizyoterapi ön lisans için ücretli 320.000 TL, %50 indirimli 160.000 TL; Tele-Sağlık Teknikerliği ve Tıbbi Veri İşleme Teknikerliği için ücretli 285.000 TL, %50 indirimli 142.500 TL bilgisi yer alır.

Hangi programı soruyorsan net satırı paylaşabilirim.

Kaynak notu: Tanıtım broşürü SHMYO 2025 tablosu.

---

## 37. anestezi_ucret_kontenjan

Amaç: Anestezi programının ücret/kontenjan bilgisi.

Kullanıcı örnekleri:
- Anestezi kaç para?
- Anestezi kontenjanı kaç?
- Anestezi burslu var mı?
- Anestezi %50 indirimli fiyat nedir?
- Anestezi taban puanı kaç?

Instructed cevap:
2025 tanıtım broşüründe Anestezi için satırlar şöyle:

- Anestezi (Ücretli): kontenjan 10, fiyat 330.000 TL, 2024 taban puanı 296,241, başarı sırası 932.028
- Anestezi (Burslu): kontenjan 10, fiyat alanı `-`, 2024 taban puanı 360,865, başarı sırası 349.366
- Anestezi (%50 İndirimli): kontenjan 50, fiyat 165.000 TL, 2024 taban puanı 315,728, başarı sırası 698.670

Kaynak notu: Tanıtım broşürü SHMYO tablosu.

---

## 38. ilk_acil_yardim_ucret_kontenjan

Amaç: İlk ve Acil Yardım ücret/kontenjan bilgisi.

Kullanıcı örnekleri:
- İlk ve Acil Yardım kaç para?
- İlk Acil kontenjanı kaç?
- İlk acil kontenjan
- Paramedik programı var mı?
- İlk ve Acil Yardım burslu kaç kişi?
- İlk ve Acil Yardım %50 indirimli fiyatı nedir?

Instructed cevap:
2025 tanıtım broşüründe İlk ve Acil Yardım için satırlar şöyle:

- İlk ve Acil Yardım (Ücretli): kontenjan 5, fiyat 330.000 TL
- İlk ve Acil Yardım (Burslu): kontenjan 5, fiyat alanı `-`
- İlk ve Acil Yardım (%50 İndirimli): kontenjan 29, fiyat 165.000 TL

Broşürde bu program için 2024 taban puanı ve başarı sırası alanları `-` olarak gösterilmiş.

Kaynak notu: Tanıtım broşürü SHMYO tablosu.

---

## 39. tibbi_laboratuvar_teknikleri_ucret_kontenjan

Amaç: Tıbbi Laboratuvar Teknikleri ücret/kontenjan/sıralama bilgisi.

Kullanıcı örnekleri:
- Tıbbi Laboratuvar Teknikleri kaç para?
- TLT kontenjanı kaç?
- Laboratuvar teknikleri burslu var mı?
- Tıbbi Laboratuvar %50 indirimli fiyat nedir?
- Tıbbi Laboratuvar taban puanı kaç?

Instructed cevap:
2025 tanıtım broşüründe Tıbbi Laboratuvar Teknikleri için satırlar şöyle:

- Tıbbi Laboratuvar Teknikleri (Ücretli): kontenjan 10, fiyat 330.000 TL, 2024 taban puanı 263,122, başarı sırası 1.429.838
- Tıbbi Laboratuvar Teknikleri (Burslu): kontenjan 9, fiyat alanı `-`, 2024 taban puanı 334,689, başarı sırası 521.304
- Tıbbi Laboratuvar Teknikleri (%50 İndirimli): kontenjan 55, fiyat 165.000 TL, 2024 taban puanı 287,670, başarı sırası 1.050.102

Kaynak notu: Tanıtım broşürü SHMYO tablosu.

---

## 40. ameliyathane_hizmetleri_ucret_kontenjan

Amaç: Ameliyathane Hizmetleri ücret/kontenjan bilgisi.

Kullanıcı örnekleri:
- Ameliyathane Hizmetleri kaç para?
- Ameliyathane kontenjanı kaç?
- Ameliyathane burslu var mı?
- Ameliyathane %50 indirimli fiyat nedir?
- Ameliyathane taban puanı kaç?

Instructed cevap:
2025 tanıtım broşüründe Ameliyathane Hizmetleri için satırlar şöyle:

- Ameliyathane Hizmetleri (Ücretli): kontenjan 5, fiyat 330.000 TL, 2024 taban puanı 268,669, başarı sırası 1.340.077
- Ameliyathane Hizmetleri (Burslu): kontenjan 10, fiyat alanı `-`, 2024 taban puanı 328,856, başarı sırası 570.522
- Ameliyathane Hizmetleri (%50 İndirimli): kontenjan 55, fiyat 165.000 TL, 2024 taban puanı 280,807, başarı sırası 1.150.818

Kaynak notu: Tanıtım broşürü SHMYO tablosu.

---

## 41. tibbi_tanitim_pazarlama_tutarsizlik

Amaç: Tıbbi Tanıtım ve Pazarlama satırındaki kaynak tutarsızlığını güvenli cevaplamak.

Kullanıcı örnekleri:
- Tıbbi Tanıtım ve Pazarlama kaç para?
- Tıbbi Tanıtım burslu ücretli mi?
- Tıbbi Tanıtım kontenjanı kaç?
- Tıbbi Tanıtım %50 indirimli fiyat nedir?
- Tıbbi Tanıtım tablosunda burslu fiyat neden var?

Instructed cevap:
2025 tanıtım broşüründe Tıbbi Tanıtım ve Pazarlama için iki satır görünüyor:

- Tıbbi Tanıtım ve Pazarlama (Burslu): kontenjan 4, 2024 taban puanı 309,532, başarı sırası 767.115; fiyat alanında 330.000 TL görünüyor.
- Tıbbi Tanıtım ve Pazarlama (%50 İndirimli): kontenjan 30, fiyat 165.000 TL, 2024 taban puanı 215,543, başarı sırası 2.278.037.

Burada dikkatli olmak gerekir: broşürde burslu satırda fiyat görünmesi, diğer burslu satırların genellikle `-` olmasıyla tutarsız. Bu nedenle bu satır için kayıt/aday ilişkileri biriminden teyit almak en doğru yaklaşım olur.

Kaynak notu: Doğrulanmış broşür markdown "Kontrol Gerektiren Kaynak Tutarsızlığı".

---

## 42. tele_saglik_tibbi_veri_ucret

Amaç: Tele-Sağlık ve Tıbbi Veri İşleme yeni programlarının ücret/kontenjan bilgisi.

Kullanıcı örnekleri:
- Tele-Sağlık Teknikerliği kaç para?
- Tıbbi Veri İşleme Teknikerliği var mı?
- Tele sağlık kontenjanı kaç?
- Tıbbi Veri İşleme kontenjanı kaç?
- Tıbbi Veri İşleme %50 fiyatı nedir?
- Tele-Sağlık burslu kaç kişi?

Instructed cevap:
2025 tanıtım broşüründe Tele-Sağlık Teknikerliği ve Tıbbi Veri İşleme Teknikerliği için aynı kontenjan/fiyat yapısı görünüyor:

- Ücretli: kontenjan 8, fiyat 285.000 TL
- Burslu: kontenjan 5, fiyat alanı `-`
- %50 İndirimli: kontenjan 26, fiyat 142.500 TL

Broşürde bu programlar için 2024 taban puanı ve başarı sırası alanları `-` olarak gösterilmiş.

Kaynak notu: Tanıtım broşürü SHMYO tablosu.

---

## 43. myo_programlari

Amaç: Meslek Yüksekokulu programlarını listelemek.

Kullanıcı örnekleri:
- MYO'da hangi bölümler var?
- Meslek Yüksekokulu programları neler?
- Bilgisayar Programcılığı var mı?
- Eczane Hizmetleri var mı?
- Grafik Tasarım var mı?

Instructed cevap:
Tanıtım broşüründe Meslek Yüksekokulu altında şu programlar listeleniyor:

- Bilgisayar Programcılığı
- Eczane Hizmetleri
- Elektrik
- Grafik Tasarım

Bu programlar TYT puan türüyle listelenmiştir. Yerleşke olarak Balgat Yerleşkesi gösterilir.

Kaynak notu: Tanıtım broşürü MYO program listesi ve tablosu.

---

## 44. myo_ucretler

Amaç: MYO ücret ve kontenjanlarını genel cevaplamak.

Kullanıcı örnekleri:
- Bilgisayar Programcılığı kaç para?
- Eczane Hizmetleri ücreti nedir?
- Elektrik programı kontenjanı kaç?
- Elektrik kaç para?
- Grafik Tasarım kaç TL?
- Grafik Tasarım kontenjanı kaç?
- MYO %50 indirimli ücretler ne kadar?

Instructed cevap:
2025 tanıtım broşürüne göre Meslek Yüksekokulu programlarında:

- Bilgisayar Programcılığı: ücretli 330.000 TL, %50 indirimli 165.000 TL; kontenjanlar ücretli 5, burslu 7, %50 indirimli 37.
- Eczane Hizmetleri: ücretli 330.000 TL, %50 indirimli 165.000 TL; kontenjanlar ücretli 2, burslu 7, %50 indirimli 40.
- Elektrik: ücretli 300.000 TL, %50 indirimli 150.000 TL; kontenjanlar ücretli 7, burslu 5, %50 indirimli 27.
- Grafik Tasarım: ücretli 300.000 TL, %50 indirimli 150.000 TL; kontenjanlar ücretli 7, burslu 5, %50 indirimli 27.

Kaynak notu: Tanıtım broşürü Meslek Yüksekokulu tablosu.

---

## 45. spor_antrenorluk_egitimi

Amaç: Spor Bilimleri Fakültesi/Antrenörlük Eğitimi sorularını cevaplamak.

Kullanıcı örnekleri:
- Spor Bilimleri Fakültesi var mı?
- Antrenörlük Eğitimi var mı?
- Antrenörlük kaç para?
- Spor Bilimleri kontenjanı kaç?
- Antrenörlük TYT mi?

Instructed cevap:
Tanıtım broşüründe Spor Bilimleri Fakültesi altında Antrenörlük Eğitimi programı yer alıyor ve TYT puan türüyle listeleniyor.

2025 broşür bilgisine göre:

- Antrenörlük Eğitimi (Ücretli): kontenjan 2, fiyat 380.000 TL
- Antrenörlük Eğitimi (Burslu): kontenjan 6, fiyat alanı `-`
- Antrenörlük Eğitimi (%50 İndirimli): kontenjan 32, fiyat 190.000 TL

Yerleşke olarak Balgat Yerleşkesi gösteriliyor.

Kaynak notu: Tanıtım broşürü Spor Bilimleri Fakültesi tablosu.

---

## 46. yks_ustun_basari_bursu

Amaç: YKS üstün başarı bursu tutarlarını cevaplamak.

Kullanıcı örnekleri:
- YKS başarı bursu var mı?
- İlk 100'e burs veriyor musunuz?
- Üstün başarı bursu ne kadar?
- Sıralamaya göre burs alabilir miyim?
- İlk 1000 bursu kaç TL?

Instructed cevap:
2025-2026 broşüründeki YKS Üstün Başarı Bursu bilgisine göre akademik yıllar süresince her sene 8 ay karşılıksız burs imkanı sağlanır. Tutarlar şöyle:

- İlk 100: 30.000 TL
- İlk 101-500: 10.000 TL
- İlk 501-1000: 7.000 TL
- İlk 1001-10000: 5.000 TL

Burs koşulları ilgili akademik yıl için geçerlidir; güncel koşullar üniversite duyurularından teyit edilmelidir.

Kaynak notu: Tanıtım broşürü Burs İmkanları.

---

## 47. tercih_bursu

Amaç: Tercih sırasına bağlı indirimleri cevaplamak.

Kullanıcı örnekleri:
- Tercih bursu var mı?
- 1. tercih indirimi ne kadar?
- İlk sıraya yazarsam indirim oluyor mu?
- 2. tercih bursu kaç?
- 3. tercihte indirim var mı?

Instructed cevap:
Evet, broşürde tercih bursu bilgisi yer alıyor. Yüksek İhtisas Üniversitesi'ne YKS sonuçlarına göre:

- 1. sırada tercih ederek yerleşen öğrencilere yıllık eğitim öğretim ücretinden %10 indirim
- 2. sırada tercih ederek yerleşen öğrencilere %7 indirim
- 3. sırada tercih ederek yerleşen öğrencilere %5 indirim

uygulanacağı belirtiliyor.

Bu bilgiler 2025-2026 broşür koşullarıdır; güncel yıl için üniversite duyuruları kontrol edilmelidir.

Kaynak notu: Tanıtım broşürü Burs İmkanları.

---

## 48. akademik_basari_bursu

Amaç: Akademik başarı bursu koşullarını açıklamak.

Kullanıcı örnekleri:
- Akademik başarı bursu var mı?
- Not ortalaması yüksek olursa indirim olur mu?
- Tıp için akademik başarı bursu kaç GANO?
- Başarı bursunda yüzde kaç indirim var?
- Akademik başarı bursu şartları neler?

Instructed cevap:
Broşürde akademik başarı bursu, ÖSYM kılavuzunda ücretli öğrenci alınacağı belirtilen programlara yerleşen öğrenciler için açıklanıyor.

Koşullar özetle şöyledir:

- Akademik yıl içinde bütün zorunlu ve seçmeli derslerden başarılı olmak gerekir.
- Yıl sonu GANO eşiği Tıp Fakültesi için 3,50 ve üzeri; diğer fakülte ve yüksekokullar için 3,85 ve üzeridir.
- En yüksek yıl sonu GANO'ya sahip her sınıftan 2 öğrenciye, izleyen akademik yıl ile sınırlı olarak eğitim öğretim ücretinde %75 indirim uygulanır.
- GANO eşit olursa öğrencinin üniversiteye giriş sıralaması dikkate alınır.

Kaynak notu: Tanıtım broşürü Burs İmkanları.

---

## 49. burs_ve_indirimler_genel

Amaç: Kullanıcı genel olarak burs/indirim seçeneklerini sorarsa tüm ana burs başlıklarını karıştırmadan özetlemek.

Kullanıcı örnekleri:
- Burs seçenekleri neler?
- Hangi burslar var?
- İndirim imkanları nelerdir?
- Kardeş indirimi var mı?
- Şehit gazi çocuğu bursu var mı?
- Sporcu bursu veriyor musunuz?

Instructed cevap:
2025-2026 tanıtım broşüründe şu burs ve indirim başlıkları yer alıyor:

- YKS Üstün Başarı Bursu: ilk 100, 101-500, 501-1000 ve 1001-10000 başarı aralıkları için 8 ay karşılıksız burs tutarları belirtilmiş.
- Tercih Bursu: 1. tercih için %10, 2. tercih için %7, 3. tercih için %5 eğitim ücreti indirimi belirtilmiş.
- Akademik Başarı Bursu: ücretli programlara yerleşen öğrenciler için GANO ve başarı koşullarına bağlı %75 indirim başlığı yer alıyor.
- Şehit ve Gazi Çocukları Bursu: eğitim öğretim ücretine %25 indirim.
- Kardeş Bursu: üniversitede öğrenim gören kardeş öğrencilerin her biri için %5 indirim.
- Spor Başarı Bursu ve Sosyal Destek Bursu: koşulları ve tutarları Mütevelli Heyet tarafından belirlenen burs başlıkları olarak açıklanıyor.

Broşürde burs koşullarının 2025-2026 Akademik Yılı için geçerli olduğu ve sonraki yıllarda değişebileceği notu vardır. Kesin bilgi için güncel burs/ücret duyurusunu kontrol etmek gerekir.

Kaynak notu: Tanıtım broşürü Burs İmkanları bölümü.

---

## 50. onlisans_cift_anadal

Amaç: Ön lisans çift anadal sorularını cevaplamak.

Kullanıcı örnekleri:
- Çift anadal var mı?
- Ön lisans öğrencisi çift anadal yapabilir mi?
- Anestezi ile Ameliyathane çift anadal olur mu?
- Tıbbi Laboratuvar öğrencisi başka programla ÇAP yapabilir mi?
- Hangi 2 yıllık bölümlerde çift anadal var?

Instructed cevap:
Tanıtım broşüründe ön lisans programlarında çift anadal programı olduğu ve öğrencilerin YKS ile yerleştikleri program dışında ikinci bir dalda ön lisans diploması alma fırsatı bulabileceği belirtiliyor.

Broşürde çift anadal için listelenen programlar:

- Ameliyathane Hizmetleri
- Anestezi
- Tıbbi Dokümantasyon ve Sekreterlik
- Tıbbi Tanıtım ve Pazarlama
- Tıbbi Laboratuvar Teknikleri
- Eczane Hizmetleri

Başvuru şartları, GANO eşiği, kontenjan ve dönem koşulları için ilgili çift anadal/yandal yönergesi ve güncel duyurular kontrol edilmelidir.

Kaynak notu: Tanıtım broşürü Çift Anadal Programı, Yatay Geçiş/Çift Anadal/Yandal yönergesi.

---

## 51. tip_sinav_gecme_final_butunleme

Amaç: Tıp sınıf geçme, kurul/final not hesabı, final muafiyeti ve bütünleme sorularını aynı sınav politikası altında cevaplamak.

Kullanıcı örnekleri:
- Tıp Fakültesinde sınıf geçme notu nasıl hesaplanıyor?
- Tıpta kurul notu nasıl hesaplanır?
- Tıpta finale girmeden geçebilir miyim?
- Final sınavına girmeden sınıf geçmek mümkün mü?
- Bütünleme final yerine geçer mi?
- Tıp Fakültesinde bütünleme hakkı var mı?

Instructed cevap:
Tıp Fakültesi yönerge kaynaklarına göre Dönem I, II ve III'te dönem sonu başarı notu genel olarak dönem içi kurul notunun %60'ı ile final veya bütünleme notunun %40'ının toplanmasıyla hesaplanır.

Yönerge çıktılarında dönem içi kurul notu yüksek olan öğrencilerin bazı koşullarla final sınavına girmeksizin başarılı sayılabileceği bilgisi de yer alır. Final sınavına girmesi gerektiği halde girmeyen veya final sınav puanı yeterli olmayan öğrenciler için bütünleme sınavı hakkı bulunur; bütünleme notu final notu yerine geçer.

Bu kurallar dönem, kurul, devam ve baraj koşullarına göre değişebileceği için kesin durumunu öğrenci işleri veya ilgili Tıp Fakültesi yönergesi üzerinden kontrol etmek gerekir.

Kaynak notu: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi.

---

## 54. tip_mazeret_sinavi_saglik_raporu

Amaç: Sağlık raporu, mazeret sınavı ve başvuru süreci sorularını cevaplamak.

Kullanıcı örnekleri:
- Sağlık raporum varsa mazeret sınavına girebilir miyim?
- Rapor almadan mazeret sınavı olur mu?
- Mazeret sınavı için ne yapmam lazım?
- Tıpta sınava giremedim, ne olacak?
- Sağlık raporu sınav için geçerli mi?

Instructed cevap:
Tıp Fakültesi ve genel sınav yönerge kaynaklarında sağlık mazeretinin sağlık raporu ile belgelendirilmesi gerektiği; rapor veya mazeret ilgili yönetim kurulu tarafından kabul edilirse mazeret sınavı açılabileceği belirtilir.

Raporlu olduğu halde sınava girme veya rapor teslim süresi gibi ayrıntılar öğrencinin birimine ve güncel yönergeye bağlıdır. Bu nedenle rapor, dilekçe ve başvuru süresini geciktirmeden öğrenci işleri/fakülte sekreterliği ile teyit etmek gerekir.

Kaynak notu: Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği, Tıp Fakültesi sınav yönergeleri.

---

## 55. tip_intornluk

Amaç: Dönem VI/intörn hekimlik sorularını cevaplamak.

Kullanıcı örnekleri:
- İntörnlük nasıl oluyor?
- Tıp son sınıfta staj var mı?
- Dönem VI ne demek?
- İntörn hekimler hangi stajları yapıyor?
- İntörnlükte devam zorunlu mu?

Instructed cevap:
Tıp Fakültesinde Dönem VI, intörnlük eğitimi dönemidir. Kaynaklarda intörn hekimlik eğitiminin sağlık hizmeti sunum alanlarında uygulama yapabilme, hastayı değerlendirme, gerektiğinde uzmana yönlendirme ve izlem yapabilme gibi mesleki yeterlikleri geliştirmeyi hedeflediği görülür.

İntörnlükte zorunlu stajlara devam esastır; kabul edilen mazeretler ve telafi süreçleri Fakülte Yönetim Kurulu ve ilgili yönergeler kapsamında değerlendirilir.

Kaynak notu: Tıp Fakültesi Dönem VI İntörn Hekimlik Eğitimi Yönergesi.

---

## 56. tip_secmeli_dersler

Amaç: Tıp Fakültesi seçmeli ders sorularını cevaplamak.

Kullanıcı örnekleri:
- Tıpta seçmeli ders var mı?
- Seçmeli dersleri ne zamana kadar geçmem gerekiyor?
- Tıp Fakültesinde seçmeli ders zorunlu mu?
- Seçmeli ders kurulu ne yapıyor?
- Mezun olmak için seçmeli ders almak gerekiyor mu?

Instructed cevap:
Tıp Fakültesi seçmeli ders yönergesi, Dönem I, II ve III öğretim programlarındaki seçmeli derslerin planlanması ve yürütülmesine ilişkin esasları düzenler.

Kaynaklarda Tıp Fakültesi müfredatında yer alan seçmeli derslerden Dönem VI sonuna kadar başarılı olunması gerektiği yönünde bilgi bulunur. Hangi seçmeli derslerin açılacağı, dönem planı ve başarı koşulları için güncel ders programı ve ilgili fakülte duyuruları kontrol edilmelidir.

Kaynak notu: Tıp Fakültesi Seçmeli Ders Kurulu Yönergesi, Tıp Eğitim-Öğretim ve Sınav Yönergesi.

---

## 57. erasmus_hazirlik_ogrencisi

Amaç: Hazırlık öğrencisinin Erasmus'tan yararlanıp yararlanamayacağı.

Kullanıcı örnekleri:
- Hazırlık sınıfındayım Erasmus'a başvurabilir miyim?
- İngilizce hazırlık öğrencisi Erasmus yapabilir mi?
- Hazırlıktayken Erasmus olur mu?
- Erasmus için bir yıl okumuş olmak gerekiyor mu?
- Hazırlık öğrencileri değişim programından yararlanabilir mi?

Instructed cevap:
Erasmus+ yönerge değerlendirme çıktılarında İngilizce Hazırlık Programı öğrencilerinin Erasmus+ Programı'ndan yararlanamayacağı bilgisi yer alıyor. Ayrıca Erasmus başvurusu için öğrencinin kayıtlı olduğu programa en az bir yıl devam etmiş olması koşulu da kaynaklarda geçiyor.

Bu nedenle hazırlık sınıfındayken Erasmus başvurusu uygun görünmüyor. Güncel başvuru şartları için Erasmus Koordinatörlüğü duyuruları kontrol edilmelidir.

Kaynak notu: Erasmus+ Programı Yönergesi, Erasmus öğrenci hareketliliği sayfası.

---

## 58. muafiyet_intibak

Amaç: Daha önce alınmış derslerden muafiyet/intibak sorularını cevaplamak.

Kullanıcı örnekleri:
- Daha önce aldığım derslerden muaf olabilir miyim?
- Muafiyet başvurusu nasıl oluyor?
- Yatay geçişte ders saydırma var mı?
- DGS ile gelenler muafiyet alabilir mi?
- İntibak işlemleri ne demek?

Instructed cevap:
Muafiyet ve İntibak İşlemleri Yönergesi'nin amacı, Yüksek İhtisas Üniversitesi'ne yeni kayıt yaptıran öğrencilerin daha önce Yüksek İhtisas Üniversitesi dahil herhangi bir yükseköğretim kurumunda alıp başarılı oldukları derslerden muafiyet ve yarıyıl/yıl intibak esaslarını belirlemektir.

Yatay geçiş, DGS, af kanunu, yeniden kayıt gibi durumlarda daha önce alınan ve başarılan dersler için muafiyet/intibak süreci olabilir. Başvuru süresi, belge ve karar koşulları için güncel duyuru ve öğrenci işleri yönlendirmesi takip edilmelidir.

Kaynak notu: Muafiyet ve İntibak İşlemleri Yönergesi, kayıt duyuruları.

---

## 59. yaz_ogretimi_ders_sayisi

Amaç: Yaz öğretimi ve ders sayısı sorularını cevaplamak.

Kullanıcı örnekleri:
- Yaz okulunda kaç ders alabilirim?
- Yaz öğretimi var mı?
- Yaz okulunda üstten ders alınır mı?
- Yaz öğretiminde 4 ders alabilir miyim?
- Başarısız olduğum dersi yaz okulunda alabilir miyim?

Instructed cevap:
Yaz Öğretimi Yönergesi değerlendirme çıktılarında öğrencilerin her yaz öğretimi döneminde en fazla 3 ders alabileceği bilgisi yer alıyor. Ayrıca öğrenciler daha önce başarısız oldukları veya kredisi yetmediği için alamadıkları dersleri yaz öğretiminde alabilir.

Genel ağırlıklı not ortalaması en az 3.00 olan ve alt yarıyıllardan başarısız dersi bulunmayan öğrencilerin üst yarıyıllardan açılan dersleri alabilmesine ilişkin bilgi de kaynaklarda geçer. Güncel ders açılma durumu ve başvuru takvimi için ilgili yılın yaz öğretimi duyurusu kontrol edilmelidir.

Kaynak notu: Yaz Öğretimi Yönergesi değerlendirme çıktıları.

---

## 60. mevzuat_yonerge_nerede

Amaç: Mevzuat/yönerge kaynaklarını bulma sorularını cevaplamak.

Kullanıcı örnekleri:
- Üniversite yönergelerine nereden bakabilirim?
- Tıp Fakültesi yönergeleri nerede?
- Mevzuat sayfanız var mı?
- Eğitim öğretim ve sınav yönergesini nerede bulurum?
- Çift anadal yönergesi nerede?

Instructed cevap:
Üniversitenin kurumsal mevzuat sayfasında yönetmelikler ve yönergeler listeleniyor. Tıp Fakültesi için ayrıca Tıp Fakültesi yönergeleri sayfasında Eğitim-Öğretim ve Sınav Yönergesi, Dönem VI İntörn Hekimlik Eğitimi Yönergesi, Klinik Beceri Eğitimi Yönergesi, Kanıta Dayalı Tıp Kurulu Yönergesi, Ölçme ve Değerlendirme yönergeleri gibi belgeler yer alıyor.

Aradığın konu ders/sınav, intörnlük, Erasmus, muafiyet, çift anadal veya yaz öğretimi ise ilgili yönerge başlığına göre bakmak gerekir.

Kaynak notu: Kurumsal mevzuat sayfası, Tıp Fakültesi yönergeleri sayfası.

---

## 61. shmyo_diger_programlar_ucret_kontenjan

Amaç: SHMYO'da önceki pakette eksik kalan Biyomedikal, Elektronörofizyoloji, Optisyenlik, Tıbbi Dokümantasyon ve Fizyoterapi programlarının ücret/kontenjan/puan sorularını cevaplamak.

Kullanıcı örnekleri:
- Biyomedikal Cihaz Teknolojisi kaç para?
- Elektronörofizyoloji kontenjanı kaç?
- Optisyenlik ücreti nedir?
- Tıbbi Dokümantasyon ve Sekreterlik taban puanı kaç?
- SHMYO Fizyoterapi kaç para?
- Biyomedikal burslu var mı?

Instructed cevap:
2025 tanıtım broşüründeki SHMYO tablosunda bu programlar için öne çıkan bilgiler şöyle:

- Biyomedikal Cihaz Teknolojisi: ücretli kontenjan 5 ve fiyat 330.000 TL; burslu kontenjan 5; %50 indirimli kontenjan 30 ve fiyat 165.000 TL. 2024 ücretli taban puanı 234,426; başarı sırası 1.930.251.
- Elektronörofizyoloji: ücretli kontenjan 5 ve fiyat 330.000 TL; burslu kontenjan 7; %50 indirimli kontenjan 40 ve fiyat 165.000 TL. 2024 ücretli taban puanı 247,562; başarı sırası 1.695.282.
- Optisyenlik: ücretli kontenjan 5 ve fiyat 330.000 TL; burslu kontenjan 7; %50 indirimli kontenjan 40 ve fiyat 165.000 TL. 2024 ücretli taban puanı 256,948; başarı sırası 1.533.439.
- Tıbbi Dokümantasyon ve Sekreterlik: ücretli kontenjan 5 ve fiyat 330.000 TL; burslu kontenjan 8; %50 indirimli kontenjan 45 ve fiyat 165.000 TL. 2024 ücretli taban puanı 260,977; başarı sırası 1.465.575.
- SHMYO Fizyoterapi: ücretli kontenjan 4 ve fiyat 320.000 TL; burslu kontenjan 4; %50 indirimli kontenjan 21 ve fiyat 160.000 TL. Broşürde bu program için 2024 taban puanı ve başarı sırası alanları `-` olarak görünüyor.

Güncel tercih döneminde kontenjan, fiyat ve özel koşullar için ÖSYM kılavuzu ve üniversitenin güncel duyuruları esas alınmalıdır.

Kaynak notu: Tanıtım broşürü Sağlık Hizmetleri Meslek Yüksekokulu 2025 kontenjan ve fiyat tablosu.

---

## 62. fizyoterapi_lisans_onlisans_ayrimi

Amaç: Lisans Fizyoterapi ve Rehabilitasyon ile SHMYO ön lisans Fizyoterapi programını karıştırmadan açıklamak.

Kullanıcı örnekleri:
- Fizyoterapi kaç para?
- Fizyoterapi lisans mı ön lisans mı?
- Fizyoterapi ve Rehabilitasyon ile Fizyoterapi aynı mı?
- 2 yıllık fizyoterapi var mı?
- FTR ile SHMYO Fizyoterapi farkı nedir?
- Fizyoterapi hangi fakültede?

Instructed cevap:
Broşürde iki farklı fizyoterapi satırı vardır; karıştırmamak gerekir:

- Fizyoterapi ve Rehabilitasyon: Sağlık Bilimleri Fakültesi altında lisans programıdır. 2025 broşüründe ücretli fiyat 490.000 TL, %50 indirimli fiyat 245.000 TL olarak listelenir.
- Fizyoterapi: Sağlık Hizmetleri Meslek Yüksekokulu altında TYT puan türüyle listelenen ön lisans programıdır. 2025 broşüründe ücretli fiyat 320.000 TL, %50 indirimli fiyat 160.000 TL olarak listelenir.

Kullanıcının hangi programı kastettiği belirsizse lisans FTR mi yoksa 2 yıllık SHMYO Fizyoterapi mi diye netleştirmek gerekir.

Kaynak notu: Tanıtım broşürü Sağlık Bilimleri Fakültesi ve SHMYO 2025 tabloları.

---

## 63. diploma_diploma_eki_mavi_diploma

Amaç: Diploma, diploma eki ve mavi diploma gibi doğrulama isteyen mezuniyet belgesi sorularında güvenli sınır vermek.

Kullanıcı örnekleri:
- Mavi diploma veriyor musunuz?
- Diploma eki var mı?
- Mezun olunca hangi belge veriliyor?
- YİÜ diploması yurtdışında geçerli mi?
- Diploma ve mezuniyet belgeleri yönergesi var mı?
- Diplomamı nasıl alırım?

Instructed cevap:
Kurumsal mevzuat havuzunda `Diploma, Diploma Eki ve Diğer Mezuniyet Belgeleri Yönergesi` yer alıyor. Bu, diploma ve diploma eki gibi mezuniyet belgeleriyle ilgili bir üniversite yönergesi bulunduğunu gösterir.

Ancak kaynaklarda tek başına `mavi diploma` ifadesine veya her ülkede otomatik geçerlilik iddiasına dayanak olacak net bir ifade görmüyorsam bunu kesin şekilde söylememeliyim. Diploma eki, mezuniyet belgesi, yurtdışı kullanım veya belge alma süreci için güncel yönergeyi ve öğrenci işleri duyurularını kontrol etmek gerekir.

Kaynak notu: Kurumsal mevzuat sayfası, Diploma/Diploma Eki yönergesi başlığı.

---

## 64. kayit_islemleri_resmi_kontrol

Amaç: Kayıt, kesin kayıt, belge, ücret ödeme ve resmi kontrol sorularında güncel duyuru/ÖSYM sınırını korumak.

Kullanıcı örnekleri:
- Kayıt nasıl yapılır?
- Kesin kayıt için hangi belgeler gerekiyor?
- Kayıt tarihleri ne zaman?
- Ücreti ne zaman ödemem gerekiyor?
- Kayıttan sonra bölüm değiştirebilir miyim?
- ÖSYM kılavuzunda neye bakmalıyım?

Instructed cevap:
Kayıt, kesin kayıt belgesi, ödeme tarihi, özel koşullar ve bölüm/program değişikliği gibi konular tercih ve kayıt dönemine göre değişebilir. Bu yüzden kesin bilgi için ilgili yılın ÖSYM kılavuzu, üniversitenin güncel aday öğrenci/kayıt duyuruları ve öğrenci işleri açıklamaları esas alınmalıdır.

Genel olarak program adı, puan türü, kontenjan, burs/indirim türü, ücret, öğretim dili, hazırlık koşulu ve özel koşullar birlikte kontrol edilmelidir. İstersen düşündüğün programı yaz; broşürdeki kontenjan, ücret ve geçmiş yıl puan/sıra bilgisini ayrıca özetleyebilirim.

Kaynak notu: Ana web sitesi aday öğrenci ve ücret/kontenjan yönlendirmeleri, tanıtım broşürü, ÖSYM kılavuzu uyarıları.

---

## 65. akademik_takvim_sinav_duyurulari

Amaç: Akademik takvim, sınav tarihleri, duyuru ve dönem tarihleri gibi dinamik sorularda yanlış tarih üretmeden yönlendirmek.

Kullanıcı örnekleri:
- Akademik takvim nerede?
- Dersler ne zaman başlıyor?
- Sınav tarihleri belli mi?
- Final haftası ne zaman?
- Yaz okulu tarihleri nerede yayınlanıyor?
- Duyurulara nereden bakabilirim?

Instructed cevap:
Akademik takvim, ders başlangıcı, final/bütünleme haftası, yaz öğretimi tarihleri ve duyurular dönem içinde güncellenebilir. Bu nedenle kesin tarih vermek için üniversitenin güncel akademik takvim ve duyurular sayfası esas alınmalıdır.

Kaynaklarda yaz öğretimi ve sınav süreçlerine ilişkin yönergeler bulunuyor; fakat güncel tarih, başvuru aralığı ve sınav takvimi için ilgili yılın resmi akademik takvimi ve birim duyuruları kontrol edilmelidir.

Kaynak notu: Ana web sitesi duyuru/akademik takvim bağlantıları, Yaz Öğretimi Yönergesi, Tıp Fakültesi sınav yönergesi.

---

## 66. ogrenci_yasami_kutuphane_topluluk_yemekhane

Amaç: Kütüphane, öğrenci toplulukları, yemekhane ve kampüs yaşamı sorularında kaynakta olan yönerge/kapsamı söylemek; olmayan saat/ücret gibi detayları uydurmamak.

Kullanıcı örnekleri:
- Kütüphane var mı?
- Öğrenci toplulukları var mı?
- Yemekhane var mı?
- Kampüs yaşamı nasıl?
- Sosyal imkanlar neler?
- Kütüphane saatleri nedir?

Instructed cevap:
Kurumsal mevzuat havuzunda Kütüphane ve Dokümantasyon Daire Başkanlığı Yönergesi ile SKSDB Öğrenci Toplulukları Yönergesi yer alıyor. Bu, üniversitede kütüphane/dokümantasyon ve öğrenci topluluklarıyla ilgili resmi düzenlemeler bulunduğunu gösterir.

Ancak kütüphane çalışma saatleri, yemekhane menüsü/ücreti, belirli topluluk listesi veya kampüs etkinliği gibi güncel ve değişken detayları kaynakta doğrudan görmeden kesin söylememek gerekir. Bu başlıklar için güncel web duyurusu veya ilgili idari birim kontrol edilmelidir.

Kaynak notu: Kurumsal mevzuat sayfası, Kütüphane ve Dokümantasyon Daire Başkanlığı Yönergesi, SKSDB Öğrenci Toplulukları Yönergesi.
