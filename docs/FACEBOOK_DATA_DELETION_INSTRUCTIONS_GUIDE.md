# Facebook Data Deletion Instructions Guide

> Last Updated: 2026-02-18
> Target: Meta/Facebook App Review (`Data Deletion Instructions URL`)

## 1. Amaç

Bu doküman, landing repoda yayınlayacağın `Data Deletion Instructions` sayfasının Meta App Review beklentilerini karşılaması için hazırlanmıştır.

Bu sprintte önerilen kapsam:

- Self-service silme: **kişi (contact) bazlı veri silme**
- Organizasyon/account tam silme: zorunlu değil, opsiyonel (destek talebiyle yapılabilir)

## 2. Meta App Review icin minimum gereksinim

`Data Deletion Instructions URL` sayfasında net olarak:

1. Kullanıcının verisini nasil silecegini adim adim anlat
2. Hangi verilerin silinecegini yaz
3. Silme suresi/SLA belirt
4. Destek/iletisim adresi ver
5. Talep sonucu kullaniciya nasil donulecegini yaz

Not: `Data Deletion Callback URL` entegrasyonu zorunlu degildir; `Instructions URL` ile ilerlenebilir.

## 3. Onerilen silme kapsami (bu urun icin)

Silinecek (contact-level):

- O kisiye ait konusmalar
- Konusma mesajlari
- Konusmaya bagli lead/qualification kayitlari
- Konusma baglantili AI usage metadata kayitlari

Silinmeyecek (ilk surum):

- Tum organizasyon verisi (toplu tenant wipe)
- Faturalama/denetim gibi yasal saklama gerektirebilecek kayitlar

## 3.1 Uygulama ici self-servis akisi (bu repo)

Uygulama icinden silme akisi:

1. `Settings > Organization` sayfasina git
2. En alttaki `Data deletion / Veri silme` bolumunu ac
3. `Verileri sil / Delete data` aksiyonuna bas
4. Acilan modal icinde hesap sifresini gir
5. `Simdi sil / Delete now` ile islemi onayla

Silme sonucu:

- Organizasyon icindeki tum `conversations` satirlari silinir
- FK cascade ile ilgili `messages` ve `leads` satirlari silinir
- Konusma baglantili `organization_ai_usage` metadata satirlari temizlenir

## 4. Landing sayfasi icerik iskeleti (TR)

Asagidaki metni dogrudan sayfa icerigi olarak kullanabilirsin:

```md
# Veri Silme Talimatlari

Bu sayfa, Meta/Facebook uzerinden iletilen veri silme talepleri icin hazirlanmistir.

## Veri Silme Nasil Yapilir?

1. Hesabiniza giris yapin.
2. `Ayarlar > Organizasyon` altindaki `Veri Silme` bolumune gidin.
3. `Verileri sil` butonuna basin.
4. Acilan pencerede hesap sifrenizi girip islemi onaylayin.

## Hangi Veriler Silinir?

Organizasyon icindeki kisi bazli kayitlar:
- Konusmalar
- Mesajlar
- Lead/qualification kayitlari
- Konusma baglantili AI usage metadata kayitlari

## Islem Suresi

Silme talepleri en gec **30 gun** icinde tamamlanir.
Cogu talep anlik veya kisa sure icinde sonuclanir.

## Sonuc ve Onay

Islem tamamlandiginda sistem ici bildirim veya e-posta ile bilgilendirme yapilir.

## Destek

Veri silme konusunda destek icin: **support@askqualy.com**
```

## 5. Landing sayfasi icerik iskeleti (EN)

```md
# Data Deletion Instructions

This page describes how users can request data deletion for Meta/Facebook integrations.

## How to Request Deletion

1. Sign in to your account.
2. Go to `Settings > Organization` and open the `Data Deletion` section.
3. Click `Delete data`.
4. Enter your account password in the modal and confirm.

## What Will Be Deleted

Contact-level records inside the organization:
- Conversations
- Messages
- Lead/qualification records
- Conversation-linked AI usage metadata records

## Processing Time

Deletion requests are completed within **30 days**.
Most requests are completed much sooner.

## Confirmation

Once completed, the requester is notified via in-app confirmation or email.

## Support

For data deletion support: **support@askqualy.com**
```

## 6. App Dashboard checklist

Meta App Dashboard:

1. `App Settings` ekranina git
2. `Data Deletion Instructions URL` alanina landing URL'ini gir
3. URL'in public oldugunu ve login istemedigini kontrol et
4. Sayfada TR/EN ulasilabilir icerik oldugunu kontrol et

## 7. Review red-risk checklist

- "Delete your data" adimlari belirsiz olmamali
- "What is deleted" listesi net olmali
- Support email placeholder kalmamali
- Sayfa 404 veya auth redirect vermemeli
- Mevcutta olmayan bir ozelligi varmis gibi yazmamak gerekir (ornegin organizasyon tam silme)

## 8. Opsiyonel sonraki adim (Callback URL)

Ileride `Data Deletion Callback URL` eklenecekse, talep alindiginda:

- bir `confirmation_code` uret
- bir status URL don
- kullanicinin/sistemlerin talep durumunu bu URL'den takip etmesini sagla

Bu adim App Review icin simdilik zorunlu degildir.
