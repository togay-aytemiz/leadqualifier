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
Yüksek İhtisas Üniversitesi, Ankara'da bulunan bir vakıf üniversitesidir. Sağlık alanındaki birikimini tıp, sağlık bilimleri, spor bilimleri ve meslek yüksekokulu programlarıyla eğitim ve araştırmaya taşır.

Aday öğrenciler için öne çıkan tarafı sağlık ağırlıklı program yapısı, Tıp Fakültesi, uygulamalı sağlık eğitimi ve Ankara'daki yerleşkeleridir.

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
Yüksek İhtisas Üniversitesinde öne çıkan akademik birimler şunlardır:

- Tıp Fakültesi
- Sağlık Bilimleri Fakültesi
- Spor Bilimleri Fakültesi
- Sağlık Hizmetleri Meslek Yüksekokulu
- Meslek Yüksekokulu
- Lisansüstü Eğitim Enstitüsü
- Yabancı Diller Yüksekokulu

Hangi programı düşündüğünü söylersen ücret, kontenjan, yerleşke veya eğitim süresi bilgisini ayrıca paylaşabilirim.

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
- kampüs nerde
- kampüs nerede acaba
- yerleşke adresleri

Instructed cevap:
Yüksek İhtisas Üniversitesinin Ankara'da birden fazla yerleşkesi bulunur:

- 100. Yıl / İşçi Blokları Yerleşkesi: İşçi Blokları Mahallesi 1505. Sokak / Cadde No:18/A, Çankaya, Ankara
- Balgat Yerleşkesi: Oğuzlar Mahallesi 1375. Sokak No:8, Balgat, Ankara
- Bağlum Yerleşkesi: Karakaya Mahallesi Bağlum Bulvarı No:1, Keçiören, Ankara
- Bağlıca Yerleşkesi: Bağlıca Mahallesi, Höyük Caddesi No:1, Bağlıca, Ankara

Program adını yazarsan hangi yerleşkede olduğunu da net söyleyebilirim.

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
Tıp Fakültesi 100. Yıl / İşçi Blokları Yerleşkesindedir.

Adres: İşçi Blokları Mahallesi 1505. Sokak No:18/A, Çankaya / Ankara.

Türkçe Tıp ve İngilizce Tıp için yerleşke bilgisi aynı adreste verilir.

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
Sağlık Bilimleri Fakültesi programları için Bağlıca Yerleşkesi kullanılır.

Adres: Bağlıca Mahallesi, Höyük Caddesi No:1, Bağlıca / Ankara.

Bu fakültede Hemşirelik, Beslenme ve Diyetetik, Dil ve Konuşma Terapisi, Fizyoterapi ve Rehabilitasyon, Ergoterapi, Ebelik ve Sağlık Yönetimi gibi lisans programları bulunur.

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
- shmyo nerde
- shmyo bölümleri hangi kampüste?
- tlt hangi kampüste?

Instructed cevap:
Sağlık Hizmetleri Meslek Yüksekokulu programları iki yerleşkeye dağılır:

Bağlıca Yerleşkesi:
- Anestezi
- Ameliyathane Hizmetleri
- Fizyoterapi
- Tıbbi Laboratuvar Teknikleri

Bağlum Yerleşkesi:
- İlk ve Acil Yardım
- Tıbbi Görüntüleme Teknikleri
- Biyomedikal Cihaz Teknolojisi
- Optisyenlik
- Tıbbi Dokümantasyon ve Sekreterlik
- Tıbbi Tanıtım ve Pazarlama
- Tele-Sağlık Teknikerliği
- Tıbbi Veri İşleme Teknikerliği

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
- myo nerde
- myo kampüsü neresi?
- grafik tasarım nerede?

Instructed cevap:
Meslek Yüksekokulu ve Spor Bilimleri Fakültesi Balgat Yerleşkesindedir.

Adres: Oğuzlar Mahallesi 1375. Sokak No:8, Balgat / Ankara.

Bu yerleşke; Meslek Yüksekokulu programları ile Spor Bilimleri Fakültesi Antrenörlük Eğitimi programı için kullanılır.

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
Genel iletişim için ana telefon numarası 0 (312) 329 10 10'dur.

Bağlum Yerleşkesi için ayrıca 0 (312) 329 74 25 numarası kullanılır.

Belirli bir program, kayıt, ücret ya da öğrenci işleri konusu için hangi birime yönlenmek istediğini yazarsan daha uygun iletişim bilgisini paylaşabilirim.

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
Üniversitenin aday öğrenci yönlendirmelerinde konaklama/yurt başlığı bulunur; ancak net yurt adı, garanti edilen kontenjan veya güncel ücret bilgisi için kesin bir sayı vermem doğru olmaz.

Konaklama planı yaparken yurt seçeneklerini, ücretleri, kontenjanı ve ulaşım mesafesini güncel dönem için ayrıca sormak en sağlıklı yol olur.

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
Yerleşke adreslerini net olarak paylaşabilirim; ancak servis/ring güzergahı, saatleri veya servis varlığı için kesin bilgi vermem doğru olmaz.

Hangi yerleşkeye gideceğini yazarsan adresini tekrar netleştirebilirim. Servis ve ulaşım saatleri gibi değişken bilgiler için güncel dönem duyurusu esas alınmalıdır.

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
Yüksek İhtisas Üniversitesi Tıp Fakültesi; entegre teorik ve pratik eğitim, Probleme Dayalı Öğrenim, Klinik Beceri Eğitimi, İletişim Becerileri Eğitimi, Kanıta Dayalı Tıp Eğitimi, modern laboratuvarlar, kadavra diseksiyonu ve multidisipliner laboratuvar uygulamalarıyla tanıtılır.

Tıp uzun ve yoğun bir eğitimdir. Tercih yaparken puan ve ücretin yanında eğitim modeli, klinik eğitim süreci, uygulama imkanları ve mesleğe kişisel uygunluk birlikte değerlendirilmelidir.

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
Yüksek İhtisas Üniversitesinde Tıp Fakültesi için Türkçe ve İngilizce program seçenekleri bulunur.

Tercih döneminde program adını, öğretim dilini, kontenjanı, burs/indirim türünü ve özel koşulları ilgili yılın ÖSYM kılavuzundan birlikte kontrol etmek gerekir.

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
Tıp Fakültesi eğitimi hazırlık sınıfı hariç 6 yıldır.

Dönem I, II ve III preklinik eğitim; Dönem IV ve V klinik stajlar; Dönem VI ise intörnlük dönemidir. İngilizce programda hazırlık koşulu ayrıca değerlendirilir.

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
Tıp eğitiminde ilk üç yıl preklinik dönemdir; Dönem I, II ve III'te ders kurulları ağırlıklı harmanlanmış/hibrit yapı bulunur.

Dönem IV ve V klinik stajlardan oluşur. Dönem VI ise intörn hekimlik dönemidir. Eğitim modeli teorik bilgi, uygulama, klinik beceri, iletişim becerileri ve kanıta dayalı tıp yaklaşımını birlikte ele alır.

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
- kadavra varmı
- anatomi lab var mı?
- maket varmı?

Instructed cevap:
Evet, Tıp Fakültesinde anatomi laboratuvarı, kadavra diseksiyonu imkanı ve maketlerle uygulama başlıkları bulunur.

Bu imkanlar anatomi eğitimini sadece teorik anlatımla sınırlı bırakmadan uygulamalı öğrenmeyi desteklemek için kullanılır.

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
Evet, Tıp Fakültesinde Klinik Beceri Eğitimi ayrı bir başlıktır.

Bu eğitim, öğrencilerin hekimlik uygulamalarına hazırlanmasına yardımcı olur; klinik süreçlere geçmeden önce temel becerileri daha kontrollü ve yapılandırılmış biçimde öğrenmelerini destekler.

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
Evet, Tıp Fakültesinde Kanıta Dayalı Tıp Eğitimi bulunur.

Bu başlık öğrencilerin bilimsel kanıtı değerlendirme, araştırma mantığıyla düşünme ve tıbbi kararları kanıta dayandırma becerisini geliştirmeyi hedefler.

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
Evet, Tıp Fakültesinde İletişim Becerileri Eğitimi bulunur.

Bu eğitim, öğrencilerin hasta, hasta yakını ve sağlık ekibiyle doğru, açık ve mesleki iletişim kurma becerisini destekler.

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
2025 Tıp Fakültesi ücretleri şöyledir:

- Tıp Fakültesi (Ücretli): 720.000 TL
- Tıp Fakültesi (%50 İndirimli): 360.000 TL
- Tıp Fakültesi (Burslu): ayrıca ücret tutarı verilmez
- Tıp Fakültesi İngilizce (Ücretli): 720.000 TL
- Tıp Fakültesi İngilizce (%50 İndirimli): 360.000 TL
- Tıp Fakültesi İngilizce (Burslu): ayrıca ücret tutarı verilmez

Tıp hazırlık ücreti 410.000 TL olarak verilir. Güncel kayıt yılında ücretler değişebileceği için son karar öncesi güncel ücret duyurusu ve ÖSYM bilgileri esas alınmalıdır.

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
2025 Tıp Fakültesi kontenjanları şöyledir:

Türkçe Tıp:
- Ücretli: 75
- Burslu: 13
- %50 İndirimli: 10

İngilizce Tıp:
- Ücretli: 41
- Burslu: 7
- %50 İndirimli: 6

Kontenjanlar tercih döneminde ÖSYM kılavuzu ile kesinleşir.

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
2024 yerleşme verilerine göre Tıp Fakültesi taban puanı ve başarı sırası şöyledir:

- Tıp Fakültesi (Ücretli): taban puanı 453,467; başarı sırası 36.073
- Tıp Fakültesi (Burslu): taban puanı 497,406; başarı sırası 11.519
- Tıp Fakültesi (%50 İndirimli): taban puanı 483,077; başarı sırası 18.145
- Tıp Fakültesi İngilizce (Ücretli): taban puanı 448,213; başarı sırası 39.907
- Tıp Fakültesi İngilizce (Burslu): taban puanı 496,513; başarı sırası 11.890
- Tıp Fakültesi İngilizce (%50 İndirimli): taban puanı 479,259; başarı sırası 20.117

Bunlar geçmiş yıl verileridir; güncel yılda yerleşme garantisi anlamına gelmez.

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
- hazırlık varmı
- tıp ing hazırlık var mı?
- hazırlık sınıfı var mı?

Instructed cevap:
Tıp Fakültesi için 2025 hazırlık ücreti 410.000 TL olarak verilir.

Hazırlık koşulu programın öğretim dili ve muafiyet durumuna göre değişebilir. İngilizce Tıp düşünüyorsan hazırlık/muafiyet şartlarını kayıt öncesi ayrıca kontrol etmek gerekir.

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
Sağlık Bilimleri Fakültesinde şu lisans programları bulunur:

- Hemşirelik
- Beslenme ve Diyetetik
- Dil ve Konuşma Terapisi
- Fizyoterapi ve Rehabilitasyon
- Ergoterapi
- Ebelik
- Sağlık Yönetimi

Hemşirelik, Beslenme ve Diyetetik, Dil ve Konuşma Terapisi, Fizyoterapi ve Rehabilitasyon, Ergoterapi ve Ebelik SAY puan türüyle; Sağlık Yönetimi EA puan türüyle listelenir. Yerleşke Bağlıca'dır.

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
2025 Sağlık Bilimleri Fakültesi ücretleri program ve burs/indirim türüne göre değişir.

Öne çıkan ücretli program tutarları:
- Hemşirelik: 520.000 TL
- Dil ve Konuşma Terapisi: 490.000 TL
- Fizyoterapi ve Rehabilitasyon: 490.000 TL
- Beslenme ve Diyetetik: 490.000 TL
- Ergoterapi: 460.000 TL
- Ebelik: 460.000 TL
- Sağlık Yönetimi: 460.000 TL

%50 indirimli satırlarda bu tutarların yarısı uygulanır. Burslu satırlarda ayrıca ücret tutarı verilmez.

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
2025 Hemşirelik bilgileri şöyledir:

- Hemşirelik (Ücretli): kontenjan 2, ücret 520.000 TL, 2024 taban puanı 294,272, başarı sırası 284.992
- Hemşirelik (Burslu): kontenjan 12, ücret tutarı verilmez, 2024 taban puanı 391,497, başarı sırası 94.181
- Hemşirelik (%50 İndirimli): kontenjan 66, ücret 260.000 TL, 2024 taban puanı 308,724, başarı sırası 235.073

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
2025 Dil ve Konuşma Terapisi bilgileri şöyledir:

- Dil ve Konuşma Terapisi (Ücretli): kontenjan 2, ücret 490.000 TL, 2024 taban puanı 288,301, başarı sırası 307.129
- Dil ve Konuşma Terapisi (Burslu): kontenjan 7, ücret tutarı verilmez, 2024 taban puanı 406,296, başarı sırası 76.136
- Dil ve Konuşma Terapisi (%50 İndirimli): kontenjan 40, ücret 245.000 TL, 2024 taban puanı 296,474, başarı sırası 277.071

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
2025 Fizyoterapi ve Rehabilitasyon lisans bilgileri şöyledir:

- Fizyoterapi ve Rehabilitasyon (Ücretli): kontenjan 2, ücret 490.000 TL, 2024 taban puanı 241,862, başarı sırası 589.959
- Fizyoterapi ve Rehabilitasyon (Burslu): kontenjan 7, ücret tutarı verilmez, 2024 taban puanı 367,860, başarı sırası 124.515
- Fizyoterapi ve Rehabilitasyon (%50 İndirimli): kontenjan 40, ücret 245.000 TL, 2024 taban puanı 245,987, başarı sırası 558.678

Bu program Sağlık Bilimleri Fakültesindeki 4 yıllık lisans programıdır. 2 yıllık Fizyoterapi programı SHMYO altındadır.

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
2025 Beslenme ve Diyetetik bilgileri şöyledir:

- Beslenme ve Diyetetik (Ücretli): kontenjan 2, ücret 490.000 TL, 2024 taban puanı 259,245, başarı sırası 458.987
- Beslenme ve Diyetetik (Burslu): kontenjan 7, ücret tutarı verilmez, 2024 taban puanı 335,804, başarı sırası 173.823
- Beslenme ve Diyetetik (%50 İndirimli): kontenjan 40, ücret 245.000 TL, 2024 taban puanı 261,341, başarı sırası 444.798

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
2025 Ergoterapi ve Ebelik bilgileri şöyledir:

Ergoterapi:
- Ücretli: kontenjan 2, ücret 460.000 TL, 2024 taban puanı 231,930, başarı sırası 668.437
- Burslu: kontenjan 5, ücret tutarı verilmez, 2024 taban puanı 315,043, başarı sırası 215.235
- %50 İndirimli: kontenjan 31, ücret 230.000 TL, 2024 taban puanı 230,811, başarı sırası 677.165

Ebelik:
- Ücretli: kontenjan 2, ücret 460.000 TL, 2024 taban puanı 251,608, başarı sırası 513.803
- Burslu: kontenjan 5, ücret tutarı verilmez, 2024 taban puanı 373,234, başarı sırası 116.906
- %50 İndirimli: kontenjan 31, ücret 230.000 TL, 2024 taban puanı 266,516, başarı sırası 411.293

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
Sağlık Bilimleri Fakültesinde EA puan türüyle listelenen program Sağlık Yönetimi'dir.

2025 Sağlık Yönetimi bilgileri:
- Sağlık Yönetimi (Ücretli): kontenjan 2, ücret 460.000 TL, 2024 taban puanı 211,394, başarı sırası 1.366.894
- Sağlık Yönetimi (Burslu): kontenjan 7, ücret tutarı verilmez, 2024 taban puanı 297,876, başarı sırası 364.146
- Sağlık Yönetimi (%50 İndirimli): kontenjan 40, ücret 230.000 TL, 2024 taban puanı 226,124, başarı sırası 1.159.672

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
Sağlık Hizmetleri Meslek Yüksekokulunda şu ön lisans programları bulunur:

- Anestezi
- İlk ve Acil Yardım
- Ameliyathane Hizmetleri
- Tıbbi Laboratuvar Teknikleri
- Tıbbi Görüntüleme Teknikleri
- Fizyoterapi
- Biyomedikal Cihaz Teknolojisi
- Optisyenlik
- Tıbbi Dokümantasyon ve Sekreterlik
- Tıbbi Tanıtım ve Pazarlama
- Tele-Sağlık Teknikerliği
- Tıbbi Veri İşleme Teknikerliği

Bu programlar 2 yıllık ön lisans programlarıdır.

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
2025 Sağlık Hizmetleri Meslek Yüksekokulu ücretleri programlara göre değişir.

Sık sorulan ücretli program tutarları:
- Anestezi: 330.000 TL
- İlk ve Acil Yardım: 330.000 TL
- Tıbbi Laboratuvar Teknikleri: 330.000 TL
- Ameliyathane Hizmetleri: 330.000 TL
- Tıbbi Görüntüleme Teknikleri: 320.000 TL
- Fizyoterapi: 320.000 TL
- Biyomedikal Cihaz Teknolojisi: 285.000 TL
- Optisyenlik: 285.000 TL
- Tıbbi Dokümantasyon ve Sekreterlik: 285.000 TL
- Tele-Sağlık Teknikerliği: 285.000 TL
- Tıbbi Veri İşleme Teknikerliği: 285.000 TL

%50 indirimli satırlarda ilgili ücretin yarısı uygulanır.

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
2025 Anestezi bilgileri şöyledir:

- Anestezi (Ücretli): kontenjan 5, ücret 330.000 TL, 2024 taban puanı 267,851, başarı sırası 1.353.668
- Anestezi (Burslu): kontenjan 9, ücret tutarı verilmez, 2024 taban puanı 347,781, başarı sırası 407.337
- Anestezi (%50 İndirimli): kontenjan 55, ücret 165.000 TL, 2024 taban puanı 283,333, başarı sırası 1.116.166

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
2025 İlk ve Acil Yardım bilgileri şöyledir:

- İlk ve Acil Yardım (Ücretli): kontenjan 5, ücret 330.000 TL
- İlk ve Acil Yardım (Burslu): kontenjan 5, ücret tutarı verilmez
- İlk ve Acil Yardım (%50 İndirimli): kontenjan 29, ücret 165.000 TL

Bu program için 2024 taban puanı ve başarı sırası bilgisi verilmemiştir.

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
2025 Tıbbi Laboratuvar Teknikleri bilgileri şöyledir:

- Tıbbi Laboratuvar Teknikleri (Ücretli): kontenjan 10, ücret 330.000 TL, 2024 taban puanı 263,122, başarı sırası 1.429.838
- Tıbbi Laboratuvar Teknikleri (Burslu): kontenjan 9, ücret tutarı verilmez, 2024 taban puanı 334,689, başarı sırası 521.304
- Tıbbi Laboratuvar Teknikleri (%50 İndirimli): kontenjan 55, ücret 165.000 TL, 2024 taban puanı 287,670, başarı sırası 1.050.102

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
2025 Ameliyathane Hizmetleri bilgileri şöyledir:

- Ameliyathane Hizmetleri (Ücretli): kontenjan 5, ücret 330.000 TL, 2024 taban puanı 253,483, başarı sırası 1.593.853
- Ameliyathane Hizmetleri (Burslu): kontenjan 7, ücret tutarı verilmez, 2024 taban puanı 325,122, başarı sırası 618.751
- Ameliyathane Hizmetleri (%50 İndirimli): kontenjan 40, ücret 165.000 TL, 2024 taban puanı 257,173, başarı sırası 1.533.977

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
2025 Tıbbi Tanıtım ve Pazarlama bilgilerinde dikkat edilmesi gereken bir tutarsızlık var.

- Tıbbi Tanıtım ve Pazarlama (Ücretli): kontenjan 5, ücret 330.000 TL, 2024 taban puanı 208,489, başarı sırası 2.109.484
- Tıbbi Tanıtım ve Pazarlama (Burslu): kontenjan 4, 2024 taban puanı 309,532, başarı sırası 767.115

Burslu satırdaki ücret bilgisi diğer burslu satırlardan farklı göründüğü için bu programda burslu ücret konusunda kesin tutar söylemek doğru olmaz. Ücretli satır için 330.000 TL bilgisi kullanılabilir.

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
2025 Tele-Sağlık Teknikerliği ve Tıbbi Veri İşleme Teknikerliği için kontenjan ve ücret yapısı aynıdır:

- Ücretli: kontenjan 8, ücret 285.000 TL
- Burslu: kontenjan 5, ücret tutarı verilmez
- %50 İndirimli: kontenjan 26, ücret 142.500 TL

Bu programlar için 2024 taban puanı ve başarı sırası bilgisi verilmemiştir.

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
Meslek Yüksekokulunda şu ön lisans programları bulunur:

- Bilgisayar Programcılığı
- Grafik Tasarım
- İç Mekan Tasarımı
- Ağız ve Diş Sağlığı
- Çocuk Gelişimi
- Eczane Hizmetleri

Meslek Yüksekokulu Balgat Yerleşkesindedir.

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
- grafik tasarım kaç para
- grafik tasarım kaç tl
- bilgisayar programcılığı var mı
- myo ücretleri

Instructed cevap:
2025 Meslek Yüksekokulu ücretleri şöyledir:

- Bilgisayar Programcılığı (Ücretli): 250.000 TL
- Bilgisayar Programcılığı (%50 İndirimli): 125.000 TL
- Grafik Tasarım (Ücretli): 250.000 TL
- Grafik Tasarım (%50 İndirimli): 125.000 TL
- İç Mekan Tasarımı (Ücretli): 250.000 TL
- İç Mekan Tasarımı (%50 İndirimli): 125.000 TL
- Ağız ve Diş Sağlığı (Ücretli): 320.000 TL
- Ağız ve Diş Sağlığı (%50 İndirimli): 160.000 TL
- Çocuk Gelişimi (Ücretli): 285.000 TL
- Çocuk Gelişimi (%50 İndirimli): 142.500 TL
- Eczane Hizmetleri (Ücretli): 285.000 TL
- Eczane Hizmetleri (%50 İndirimli): 142.500 TL

Burslu satırlarda ayrıca ücret tutarı verilmez.

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
Spor Bilimleri Fakültesinde Antrenörlük Eğitimi programı bulunur ve TYT puan türüyle listelenir.

2025 Antrenörlük Eğitimi bilgileri:
- Ücretli: kontenjan 2, ücret 380.000 TL
- Burslu: kontenjan 6, ücret tutarı verilmez
- %50 İndirimli: kontenjan 32, ücret 190.000 TL

Program Balgat Yerleşkesindedir.

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
- yks bursu kaç
- sıralama bursu kaç
- ilk bine burs var mı?

Instructed cevap:
YKS Üstün Başarı Bursu başarı sırasına göre 8 ay karşılıksız burs imkanı sağlar.

2025-2026 tutarları:
- İlk 100: 30.000 TL
- 101-500: 25.000 TL
- 501-1000: 20.000 TL
- 1001-10000: 15.000 TL

Bu burs eğitim ücretinden bağımsız nakdi destek niteliğindedir. Güncel yıl koşulları ayrıca değişebilir.

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
Evet, tercih bursu bulunur.

YKS sonuçlarına göre Yüksek İhtisas Üniversitesine:
- 1. tercihten yerleşenlere %10
- 2. tercihten yerleşenlere %7
- 3. tercihten yerleşenlere %5

eğitim ücreti indirimi uygulanır. Güncel yıl koşulları tercih döneminde ayrıca kontrol edilmelidir.

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
Akademik başarı bursu, ücretli programlara yerleşen öğrenciler için başarı durumuna bağlı indirim sağlar.

Genel ağırlıklı not ortalaması en az 3,50 olan, başarısız dersi bulunmayan ve bölüm/program başarı sıralamasında ilk %10'a giren öğrencilere bir sonraki eğitim-öğretim yılı ücretinden %75 indirim uygulanır.

Hazırlık sınıfı ve kayıt dondurulan süreler bu değerlendirmeye dahil edilmez.

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
- kardeş bursu var mı?
- burslar neler?
- indirim var mı?

Instructed cevap:
Yüksek İhtisas Üniversitesinde 2025-2026 için öne çıkan burs ve indirim başlıkları şunlardır:

- YKS Üstün Başarı Bursu: ilk 100, 101-500, 501-1000 ve 1001-10000 başarı aralıkları için 8 ay nakdi burs
- Tercih Bursu: 1. tercih %10, 2. tercih %7, 3. tercih %5 eğitim ücreti indirimi
- Akademik Başarı Bursu: ücretli programlarda başarı koşullarını sağlayan öğrencilere sonraki yıl için %75 indirim

Kardeş indirimi, şehit/gazi yakını indirimi veya sporcu bursu için net bir tutar ya da garanti bilgi veremem.

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
- çap var mı?
- cap yapabiliyor muyum?
- 2 yıllık çap var mı?

Instructed cevap:
Ön lisans programlarında çift anadal imkanı bulunur.

Öğrenciler, yerleştikleri program dışında ikinci bir ön lisans dalında diploma alma fırsatı yakalayabilir. Çift anadal için başarı koşulu, kontenjan, başvuru zamanı ve program eşleşmeleri ayrıca değerlendirilir.

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
Tıp Fakültesinde ders kurulu, genel sınav ve bütünleme sınavı süreçleri ayrı değerlendirilir.

Kısa özetle: dönem içi kurul sınavları ve yıl sonu sınavları birlikte başarı notunu oluşturur. Bütünleme hakkı, ilgili dönem ve sınav türüne göre uygulanır. Net geçme koşulu için dönem, ders/staj ve sınav türü birlikte değerlendirilmelidir.

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
Sağlık mazereti için sağlık raporuyla belgelendirme gerekir.

Rapor veya mazeret ilgili yönetim kurulu tarafından kabul edilirse mazeret sınavı açılabilir. Her rapor otomatik sınav hakkı anlamına gelmez; karar ilgili kurul değerlendirmesine bağlıdır.

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
Tıp Fakültesinde 6. sınıf intörnlük dönemidir.

İntörnlük, öğrencinin hekimlik uygulamalarına daha aktif katıldığı ve mezuniyet öncesi klinik deneyimini güçlendirdiği dönemdir. Staj/rotasyon ayrıntıları ilgili akademik yıl programına göre yürütülür.

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
Tıp Fakültesinde seçmeli dersler bulunur.

Öğrencilerin Dönem VI sonuna kadar müfredattaki seçmeli derslerden başarılı olması gerekir. Hangi seçmeli derslerin açılacağı ve dönem planı akademik yıla göre değişebilir.

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
İngilizce Hazırlık Programı öğrencileri Erasmus+ programından yararlanamaz.

Erasmus başvurusu için öğrencinin kayıtlı olduğu programa en az bir yıl devam etmiş olması gerekir. Başvuru koşulları ve kontenjanlar her çağrı döneminde ayrıca duyurulur.

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
Daha önce alınan ve başarılan dersler için muafiyet ve intibak süreci olabilir.

Bu süreç yatay geçiş, DGS, af kanunu, yeniden kayıt veya başka bir yükseköğretim kurumundan alınmış dersler gibi durumlarda gündeme gelir. Başvuru süresi, belge koşulları ve karar ilgili birim değerlendirmesine bağlıdır.

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
Yaz öğretiminde bir öğrenci en fazla 3 ders alabilir.

Öğrenciler daha önce başarısız oldukları veya kredisi yetmediği için alamadıkları dersleri yaz öğretiminde alabilir. Genel not ortalaması en az 3.00 olan ve alt yarıyıllardan başarısız dersi bulunmayan öğrenciler üst yarıyıllardan açılan dersleri de alabilir.

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
Üniversitenin mevzuat ve yönergeleri kurumsal mevzuat sayfasında yayımlanır.

Tıp Fakültesi için ayrıca Eğitim-Öğretim ve Sınav Yönergesi, Dönem VI İntörn Hekimlik Eğitimi Yönergesi, Klinik Beceri Eğitimi Yönergesi, Kanıta Dayalı Tıp Kurulu Yönergesi ve ölçme-değerlendirme yönergeleri gibi fakülteye özel belgeler bulunur.

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
2025 SHMYO diğer program bilgileri şöyledir:

- Tıbbi Görüntüleme Teknikleri: ücretli kontenjan 4 ve ücret 320.000 TL; burslu kontenjan 4; %50 indirimli kontenjan 21 ve ücret 160.000 TL
- Fizyoterapi: ücretli kontenjan 4 ve ücret 320.000 TL; burslu kontenjan 4; %50 indirimli kontenjan 21 ve ücret 160.000 TL
- Biyomedikal Cihaz Teknolojisi: ücretli kontenjan 8 ve ücret 285.000 TL; burslu kontenjan 5; %50 indirimli kontenjan 26 ve ücret 142.500 TL
- Optisyenlik: ücretli kontenjan 8 ve ücret 285.000 TL; burslu kontenjan 5; %50 indirimli kontenjan 26 ve ücret 142.500 TL
- Tıbbi Dokümantasyon ve Sekreterlik: ücretli kontenjan 8 ve ücret 285.000 TL; burslu kontenjan 5; %50 indirimli kontenjan 26 ve ücret 142.500 TL

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
Yüksek İhtisas Üniversitesinde iki farklı fizyoterapi programı vardır:

- Fizyoterapi ve Rehabilitasyon: Sağlık Bilimleri Fakültesi altında 4 yıllık lisans programıdır.
- Fizyoterapi: Sağlık Hizmetleri Meslek Yüksekokulu altında 2 yıllık ön lisans programıdır.

Ücret, kontenjan, puan türü ve mezuniyet düzeyi bu iki programda farklıdır.

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
- diploma eki veriyor musunuz?
- diploma eki veriyor musunuz
- diplomam avrupada geçerli mi?

Instructed cevap:
Üniversitede diploma, diploma eki ve diğer mezuniyet belgeleriyle ilgili bir süreç bulunur.

Ancak “mavi diploma her ülkede otomatik geçerlidir” gibi kesin bir garanti vermem doğru olmaz. Diploma eki, mezuniyet belgesi ve yurtdışı kullanım konularında süreç öğrenci işleri ve ilgili mevzuata göre yürütülür.

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
Kayıt ve tercih sürecinde program adı, puan türü, kontenjan, burs/indirim türü, ücret, öğretim dili, hazırlık koşulu ve özel koşullar birlikte değerlendirilmelidir.

Düşündüğün programı yazarsan kontenjan, ücret ve geçmiş yıl puan/sıra bilgisini birlikte özetleyebilirim. Son ve bağlayıcı bilgi tercih yılında yayımlanan ÖSYM kılavuzu ve üniversitenin güncel kayıt duyurularıdır.

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
Akademik takvim, sınav tarihleri, yaz öğretimi başvuruları ve benzeri güncel tarihler dönemsel olarak değişir.

Bu nedenle kesin tarih vermek için ilgili yılın akademik takvimi ve birim duyuruları esas alınmalıdır. İstersen hangi tarih/süreçle ilgilendiğini yaz; hangi başlığa bakman gerektiğini söyleyebilirim.

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
- kampüs yaşamı hakkında bilgi
- kantin var mı?
- kulüpler var mı?

Instructed cevap:
Üniversitede kütüphane/dokümantasyon ve öğrenci topluluklarıyla ilgili düzenlenmiş süreçler bulunur.

Kütüphane saatleri, yemekhane menüsü/ücreti, aktif topluluk listesi ve kampüs etkinlikleri gibi bilgiler dönemsel değişebilir. Bu yüzden bu tür güncel detaylarda kesin saat, fiyat veya liste vermek yerine ilgili dönem duyurusu esas alınmalıdır.

Kaynak notu: Kurumsal mevzuat sayfası, Kütüphane ve Dokümantasyon Daire Başkanlığı Yönergesi, SKSDB Öğrenci Toplulukları Yönergesi.
