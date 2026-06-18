# YİÜ Program Skill Paketi - Codex Doğruluk Kontrolü

Tarih: 18 Haziran 2026

## Kontrol Kapsamı

- Orijinal PDF: `/Users/togay/Downloads/son-brosurrrrr-2.pdf`
- Doğrulanmış veri: `src/lib/knowledge-base/provider-data/yiu-2025-brochure-verified.md`
- Üretilen paket: `docs/evaluations/yiu-program-fact-skill-pack-2026-06-18.md`
- PDF sayfa 2 ve 3: ücret, kontenjan, puan türü, 2024 taban puanı ve başarı sırası
- PDF sayfa 5: akademik birim ve yerleşke eşleşmeleri

## Sonuç

| Kontrol | Sonuç |
|---|---:|
| Canonical program | 26 / 26 doğru |
| Ücret/kontenjan seçenek satırı | 77 / 77 doğru |
| Akademik birim ve yerleşke | 26 / 26 doğru |
| Tıp İngilizce hazırlık ücreti | 410.000 TL, doğru |
| Yıl ayrımı | Ücret/kontenjan 2025; puan/sıra 2024, doğru |
| Exact trigger çakışması | 0 |
| Kullanıcı cevabında kaynak-memuru dili | 0 |
| Otomatik fact mismatch | 0 |

## Program Bazlı Kontrol

| Birim | Program | Seçenek | Yerleşke | Durum |
|---|---|---:|---|---|
| Tıp Fakültesi | Tıp Fakültesi (Türkçe) | 3 | 100. Yıl | Doğru |
| Tıp Fakültesi | Tıp Fakültesi (İngilizce) | 3 + hazırlık | 100. Yıl | Doğru |
| Sağlık Bilimleri Fakültesi | Beslenme ve Diyetetik | 3 | Bağlıca | Doğru |
| Sağlık Bilimleri Fakültesi | Dil ve Konuşma Terapisi | 3 | Bağlıca | Doğru |
| Sağlık Bilimleri Fakültesi | Fizyoterapi ve Rehabilitasyon | 3 | Bağlıca | Doğru |
| Sağlık Bilimleri Fakültesi | Hemşirelik | 3 | Bağlıca | Doğru |
| Sağlık Bilimleri Fakültesi | Sağlık Yönetimi | 3 | Bağlıca | Doğru |
| Sağlık Bilimleri Fakültesi | Ergoterapi | 3 | Bağlıca | Doğru |
| Sağlık Bilimleri Fakültesi | Ebelik | 3 | Bağlıca | Doğru |
| Spor Bilimleri Fakültesi | Antrenörlük Eğitimi | 3 | Balgat | Doğru |
| SHMYO | Ameliyathane Hizmetleri | 3 | Bağlum | Doğru |
| SHMYO | Anestezi | 3 | Bağlum | Doğru |
| SHMYO | Biyomedikal Cihaz Teknolojisi | 3 | Balgat | Doğru |
| SHMYO | Elektronörofizyoloji | 3 | Balgat | Doğru |
| SHMYO | Optisyenlik | 3 | Bağlum | Doğru |
| SHMYO | Tıbbi Dokümantasyon ve Sekreterlik | 3 | Bağlum | Doğru |
| SHMYO | Tıbbi Laboratuvar Teknikleri | 3 | Balgat | Doğru |
| SHMYO | Tıbbi Tanıtım ve Pazarlama | 2 | Bağlum | Doğru, etiket düzeltmeli |
| SHMYO | Fizyoterapi | 3 | Balgat | Doğru |
| SHMYO | İlk ve Acil Yardım | 3 | Bağlum | Doğru |
| SHMYO | Tele-Sağlık Teknikerliği | 3 | Bağlum | Doğru |
| SHMYO | Tıbbi Veri İşleme Teknikerliği | 3 | Balgat | Doğru |
| MYO | Bilgisayar Programcılığı | 3 | Balgat | Doğru |
| MYO | Eczane Hizmetleri | 3 | Balgat | Doğru |
| MYO | Elektrik | 3 | Balgat | Doğru |
| MYO | Grafik Tasarım | 3 | Balgat | Doğru |

## Açıklama

PDF'de Tıbbi Tanıtım ve Pazarlama'nın `4` kontenjan ve `330.000 TL` olan satırı `Burslu` etiketlidir. İşletme doğrulamasına göre bu etiket `Ücretli` olmalıdır; canonical veri ve Skill cevabı bu doğrulanan düzeltmeyi kullanır. Program için ayrıca bir Burslu kontenjan üretilmemiştir.

Program Skill'leri yalnızca doğrulanan program, birim, yerleşke, puan türü, ücret, kontenjan, taban puan ve başarı sırası bilgilerini verir. Müfredat, iş garantisi, meslek yetkisi veya doğrulanmamış güncel dönem verisi eklenmemiştir.
