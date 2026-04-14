# Qualy AI - Ürün Bağlamı ve Pazarlama Dokümanı

> **Not:** Marketing skill stack için kanonik bağlam artık `.agents/product-marketing-context.md` dosyasında tutulur. Bu doküman daha okunabilir Türkçe çalışma notu olarak korunur.

## 1. Qualy AI Nedir?
Qualy AI, Türkiye'deki KOBİ'ler (güzellik merkezleri, fotoğrafçılar, klinikler vb.) için geliştirilmiş; **WhatsApp, Instagram DM, Telegram ve Messenger** üzerinden gelen müşteri mesajlarını tek gelen kutusunda düzenleyen yapay zeka destekli bir müşteri konuşma asistanıdır.

**Temel Amacı:** İşletmelerin gün boyu süren tekrarlayıcı mesajlaşma yükünü azaltırken, Qualy AI ile talepleri özetlemek, müşteri niyetini görünür kılmak ve özel ilgi gerektiren konuşmaları insan temsilciye hazır hale getirmektir.

## 2. Hedef Kitle (Kimler İçin?)
* **Güzellik Merkezleri & Kuaförler**
* **Stüdyo ve Yenidoğan Fotoğrafçıları**
* **Klinikler (Diş, Estetik, Diyetisyen vb.)**
* **Ortak Özellikleri:** Teknik uzmanlığı olmayan, 1-3 kişilik küçük ekiplerden oluşan, iş trafiğinin büyük kısmını WhatsApp, Instagram, Telegram veya Messenger üzerinden yürüten işletmeler.

## 3. Temel Problemler ve Qualy'nin Çözümleri
* **Problem:** Sürekli aynı sorulara cevap vermek (Fiyat nedir? Neredesiniz? Çalışma saatleriniz neler?).
  * **Çözüm:** Qualy AI, işletmenin "Bilgi Bankası"nı (Knowledge Base) okur ve belgelere %100 sadık kalarak, halüsinasyon görmeden, doğal bir dille anında cevap verir.
* **Problem:** Kararsız ve satın alma niyeti düşük kitlelerle vakit kaybetmek.
  * **Çözüm:** Yapay zeka konuşmadaki talep ve niyet sinyallerini analiz eder, konuşmaları "Sıcak / Ilık / Soğuk" gibi takip önceliklerine ayırır ve operatöre daha net bir özet sunar.
* **Problem:** Uygulama karmaşası ve mesajların takipsizliği.
  * **Çözüm:** WhatsApp, Instagram, Telegram ve Messenger mesajları tek bir "Akıllı Gelen Kutusu" üzerinde toplanır; Qualy AI talep özetini ve takip durumunu görünür hale getirir.

## 4. Temel Özellikler (Pazarlama İçin Öne Çıkarılacak Fonksiyonlar)
1. **Çoklu Kanal Desteği:** WhatsApp, Instagram DM, Telegram ve Messenger aynı panelden yönetilir. Kanal logoları pazarlama görsellerinde ikincil kanıt unsuru olarak kullanılabilir; ana mesaj Qualy AI destekli tek gelen kutusu olmalıdır.
2. **"Bilgi Bankası" ile Güvenli Yanıtlar:** İşletmeler SSS (Sıkça Sorulan Sorular), hizmet paketleri, fiyatlar ve iptal politikalarını sisteme yükler. Yapay zeka soruları sadece bu metinlere dayanarak yanıtlar.
3. **Senaryo ve Yetenek (Skill) Altyapısı:** İşletmeler özel durumlara özel komutlar tanımlayabilir. Örneğin "Şikayet" kelimesi geçtiğinde veya "Adres" sorulduğunda standart bir adres bağlantısı iletilmesi sağlanabilir.
4. **Müşteri Talebi Analizi ve Skorlama:** Yapay zeka her konuşmadan şu bilgileri çıkarır ve özetler:
   * **İstenen Hizmet** (örn: Yenidoğan Çekimi)
   * **Tarih Beklentisi** (örn: Ekim ortası)
   * **Bütçe Sinyalleri**
   * **Takip Önceliği:** Sıcak / Ilık / Soğuk gibi operatörün aksiyon almasını kolaylaştıran durum bilgisi.
5. **Akıllı Takvim ve Booking:** İşletme sadece çalışma saatlerini ve hizmet sürelerini girer. Yapay zeka müşteriye uygun boş vakitleri sunar, müşteriyle saat teyidi yapar ve takvime (Google Calendar senkronizasyonlu) ekler.
6. **Eksik Bilgi Tamamlama:** İşletme için "Telefon Numarası" veya "İlçe" gibi bilgiler zorunluysa, yapay zeka bu bilgileri konuşmanın akışını bozmadan, darlamadan, doğal bir sohbet içinde sorup formu doldurur.
7. **İnsana Kusursuz Devir (Human Takeover):** Şikayet anında, karmaşık durumlarda, müşteri insan talep ettiğinde veya işletme sahibi Inbox'tan cevap yazdığında yapay zeka anında susar ve kontrolü tamamen insana bırakır.

## 5. Örnek Kullanım Senaryoları (Use Cases)

**Senaryo 1: Hizmet İşletmesi (Randevu ve Bilgi)**
* *Müşteri:* Merhaba, hizmetleriniz ve uygun saatler hakkında bilgi alabilir miyim?
* *Qualy AI:* Merhaba, yardımcı olayım. Hangi hizmetle ilgilendiğinizi paylaşır mısınız?
* *Güç:* İlk müşteri talebi hızlıca karşılanır, Qualy AI konuşmanın bağlamını netleştirir ve operatör için takip edilebilir hale getirir.

**Senaryo 2: Stüdyo Fotoğrafçısı (Zaman Tasarrufu & Skorlama)**
* *Müşteri A:* Fiyat alabilir miyim? (Sonrasında cevap yok) -> *Takip önceliği: Soğuk.* İşletme gereksiz yere bölünmez.
* *Müşteri B:* Merhaba, eşim hamile. Ekim'in 2. haftası için dış çekim istiyoruz. Kadıköy tarafındayız, bütçemiz 15.000 TL civarı.
* *Qualy AI:* İstenen paketleri ve uygun takvimi iletip konuşmayı sürdürür. Eş zamanlı arka planda konuşmayı *Sıcak* takip önceliğine taşır ve operatör için görünür hale getirir.
* *Güç:* Sadece ciro getirecek gerçek alıcılarla direkt temasa geçilir.

**Senaryo 3: Klinik (Risk Yönetimi - İnsana Devir)**
* *Müşteri:* Bugün yapılan tedaviden sonra biraz ağrım oldu, bu normal mi?
* *Qualy AI:* (Şikayet/Aciliyet senaryosunu fark eder) Önceliğimiz sağlığınız. Sizi hemen doktor asistanımıza bağlıyorum, lütfen bekleyin. (AI devreden çıkar, operatör ekranına düşer.)
* *Güç:* Hassas medikal veya kriz durumlarında yapay zeka risk almaz, anında insan kontrolüne geçer.

## 6. Sosyal Görsel Üretim Kuralları

* İlk launch postlarında ana mesaj "tek gelen kutusu"ndan daha net olmalı: **Qualy AI destekli tek gelen kutusu**.
* Görselde Qualy logosu veya "Qualy" wordmark mutlaka görünmeli.
* Yapay zeka aktörü "asistan" veya "Assistant" diye tek başına etiketlenmemeli; **Qualy AI** veya **AI talep özeti** gibi ifadeler kullanılmalı.
* AI aktörü insan avatarıyla temsil edilmemeli; Qualy logosu, AI rozeti veya nötr bir AI işareti kullanılmalı.
* Kanal kapsamı anlatılacaksa yalnızca **WhatsApp, Instagram, Telegram ve Messenger** gösterilmeli. Threads, X/Twitter, e-posta veya rastgele chat ikonları eklenmemeli.
* Kanal logoları ana mesajı domine etmemeli; dört kanaldan gelen taleplerin Qualy AI gelen kutusunda birleştiği anlatılmalı.

## 7. Ajans İçin Blog Yazısı Konu ve Tema Önerileri
1. **Tema: Otomasyon ve Zaman:** *"WhatsApp'ta Zaman Kaybetmeyi Bırakın: KOBİ'ler İçin Yapay Zeka Dönemi"*
2. **Tema: Talep Önceliklendirme:** *"Satışa Daha Yakın Müşterileri Daha Hızlı Fark Etmenin Yolu"*
3. **Tema: Operasyonel Rahatlık:** *"Küçük İşletmeler İçin 7/24 Açık Dijital Asistan: Uyurken Bile Randevu Alın"*
4. **Tema: Müşteri Deneyimi:** *"Robotlaşmadan Otomasyon: Gerçek İnsan Gibi Yanıt Veren Yapay Zeka Deneyimi"*
5. **Tema: Sorun Çözümü:** *"Tekrarlayan 'Fiyat Nedir?' Sorularına Son Verin: Akıllı Bilgi Bankası Nasıl Çalışır?"*
