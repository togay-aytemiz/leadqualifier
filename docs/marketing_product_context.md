# Qualy AI - Ürün Bağlamı ve Pazarlama Dokümanı

## 1. Qualy AI Nedir?
Qualy AI, Türkiye'deki KOBİ'ler (güzellik merkezleri, fotoğrafçılar, klinikler vb.) için geliştirilmiş; **WhatsApp, Instagram DM ve Telegram** üzerinden gelen müşteri mesajlarını otomatize eden, yapay zeka destekli bir akıllı asistandır.

**Temel Amacı:** İşletmelerin gün boyu süren tekrarlayıcı mesajlaşma yükünü sıfırlarken, konuşmaları analiz ederek sadece gerçekten satın almaya hazır, "nitelikli" müşterileri (lead) filtreleyip insan temsilciye aktarmaktır.

## 2. Hedef Kitle (Kimler İçin?)
* **Güzellik Merkezleri & Kuaförler**
* **Stüdyo ve Yenidoğan Fotoğrafçıları**
* **Klinikler (Diş, Estetik, Diyetisyen vb.)**
* **Ortak Özellikleri:** Teknik uzmanlığı olmayan, 1-3 kişilik küçük ekiplerden oluşan, iş trafiğinin büyük kısmını WhatsApp ve Instagram üzerinden yürüten işletmeler.

## 3. Temel Problemler ve Qualy'nin Çözümleri
* **Problem:** Sürekli aynı sorulara cevap vermek (Fiyat nedir? Neredesiniz? Çalışma saatleriniz neler?).
  * **Çözüm:** Qualy AI, işletmenin "Bilgi Bankası"nı (Knowledge Base) okur ve belgelere %100 sadık kalarak, halüsinasyon görmeden, doğal bir dille anında cevap verir.
* **Problem:** Kararsız ve satın alma niyeti düşük kitlelerle vakit kaybetmek.
  * **Çözüm:** Özelleştirilmiş skorlama algoritması ile müşterinin satın alma niyetini anlık ölçer (0-10 arası) ve sadece "Sıcak (Hot)" müşterileri öne çıkarır.
* **Problem:** Uygulama karmaşası ve mesajların takipsizliği.
  * **Çözüm:** Tüm WhatsApp ve Instagram mesajları tek bir "Akıllı Gelen Kutusu" (Inbox) üzerinde toplanır.

## 4. Temel Özellikler (Pazarlama İçin Öne Çıkarılacak Fonksiyonlar)
1. **Çoklu Kanal (Omnichannel) Desteği:** WhatsApp ve Instagram DM aynı panelden yönetilir. Sadece metin değil, fotoğraf ve belge alıp gönderebilir.
2. **"Bilgi Bankası" ile Güvenli Yanıtlar:** İşletmeler SSS (Sıkça Sorulan Sorular), hizmet paketleri, fiyatlar ve iptal politikalarını sisteme yükler. Yapay zeka soruları sadece bu metinlere dayanarak yanıtlar.
3. **Senaryo ve Yetenek (Skill) Altyapısı:** İşletmeler özel durumlara özel komutlar tanımlayabilir. Örneğin "Şikayet" kelimesi geçtiğinde veya "Adres" sorulduğunda standart bir adres bağlantısı iletilmesi sağlanabilir.
4. **Müşteri (Lead) Analizi ve Skorlama:** Yapay zeka her konuşmadan şu bilgileri gizlice çeker ve özetler:
   * **İstenen Hizmet** (örn: Yenidoğan Çekimi)
   * **Tarih Beklentisi** (örn: Ekim ortası)
   * **Bütçe Sinyalleri**
   * **Skor:** 10 üzerinden puanlama (Hot, Warm, Cold).
5. **Akıllı Takvim ve Booking:** İşletme sadece çalışma saatlerini ve hizmet sürelerini girer. Yapay zeka müşteriye uygun boş vakitleri sunar, müşteriyle saat teyidi yapar ve takvime (Google Calendar senkronizasyonlu) ekler.
6. **Eksik Bilgi Tamamlama:** İşletme için "Telefon Numarası" veya "İlçe" gibi bilgiler zorunluysa, yapay zeka bu bilgileri konuşmanın akışını bozmadan, darlamadan, doğal bir sohbet içinde sorup formu doldurur.
7. **İnsana Kusursuz Devir (Human Takeover):** Şikayet anında, karmaşık durumlarda, müşteri insan talep ettiğinde veya işletme sahibi Inbox'tan cevap yazdığında yapay zeka anında susar ve kontrolü tamamen insana bırakır.

## 5. Örnek Kullanım Senaryoları (Use Cases)

**Senaryo 1: Güzellik Merkezi (7/24 Randevu ve Bilgi)**
* *Müşteri:* (Gece 02:00) Lazer epilasyon fiyatlarınız nedir? Cumartesi boş yeriniz var mı?
* *Qualy AI:* Merhaba! Lazer paketlerimiz X TL'den başlamaktadır. Bu cumartesi için saat 14:00 ve 16:30'da uygunluğumuz var. Hangisini sizin adınıza rezerve edeyim?
* *Güç:* İşletmeci uyurken müşteriyle ilgilenilir, randevu takvime yazılır.

**Senaryo 2: Stüdyo Fotoğrafçısı (Zaman Tasarrufu & Skorlama)**
* *Müşteri A:* Fiyat alabilir miyim? (Sonrasında cevap yok) -> *Skor: Cold.* İşletme rahatsız edilmez.
* *Müşteri B:* Merhaba, eşim hamile. Ekim'in 2. haftası için dış çekim istiyoruz. Kadıköy tarafındayız, bütçemiz 15.000 TL civarı.
* *Qualy AI:* İstenen paketleri ve uygun takvimi iletip konuşmayı sürdürür. Eş zamanlı arka planda *Skor: 9/10 - Hot* hesaplar ve işletme sahibine kırmızı bildirim/etiket ile haber verir.
* *Güç:* Sadece ciro getirecek gerçek alıcılarla direkt temasa geçilir.

**Senaryo 3: Klinik (Risk Yönetimi - İnsana Devir)**
* *Müşteri:* Bugün yapılan tedaviden sonra biraz ağrım oldu, bu normal mi?
* *Qualy AI:* (Şikayet/Aciliyet senaryosunu fark eder) Önceliğimiz sağlığınız. Sizi hemen doktor asistanımıza bağlıyorum, lütfen bekleyin. (AI devreden çıkar, operatör ekranına düşer.)
* *Güç:* Hassas medikal veya kriz durumlarında yapay zeka risk almaz, anında insan kontrolüne geçer.

## 6. Ajans İçin Blog Yazısı Konu ve Tema Önerileri
1. **Tema: Otomasyon ve Zaman:** *"WhatsApp'ta Zaman Kaybetmeyi Bırakın: KOBİ'ler İçin Yapay Zeka Dönemi"*
2. **Tema: Lead Kalifikasyonu:** *"Satışları Artırmanın Sırrı: Sadece Satın Almaya Hazır Müşterilerle Konuşun"*
3. **Tema: Operasyonel Rahatlık:** *"Küçük İşletmeler İçin 7/24 Açık Dijital Asistan: Uyurken Bile Randevu Alın"*
4. **Tema: Müşteri Deneyimi:** *"Robotlaşmadan Otomasyon: Gerçek İnsan Gibi Yanıt Veren Yapay Zeka Deneyimi"*
5. **Tema: Sorun Çözümü:** *"Tekrarlayan 'Fiyat Nedir?' Sorularına Son Verin: Akıllı Bilgi Bankası Nasıl Çalışır?"*
