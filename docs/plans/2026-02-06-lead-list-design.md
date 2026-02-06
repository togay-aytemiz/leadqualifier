# Lead List Sayfası - Tasarım

> **Tarih:** 2026-02-06

## Özet

CRM-style lead listesi sayfası. Tüm leadleri tablo formatında gösterir, sıralama ve pagination destekler.

## Sayfa Bilgileri

| Özellik | Değer |
|---------|-------|
| Route | `/[locale]/leads` |
| Sidebar konumu | Inbox altında |
| TR etiketi | "Kişiler" |
| EN etiketi | "Leads" |
| Icon (pasif) | `FaRegUser` |
| Icon (aktif) | `FaUser` |

## Tablo Sütunları

| # | Sütun | Kaynak | Sıralanabilir |
|---|-------|--------|---------------|
| 1 | Platform | `conversation.platform` (icon) | ✅ |
| 2 | Kişi Adı | `conversation.contact_name` | ✅ |
| 3 | Durum | `lead.status` (badge) | ✅ |
| 4 | Skor | `lead.total_score` | ✅ |
| 5 | Hizmet | `lead.service_type` | ✅ |
| 6 | Son Aktivite | `lead.updated_at` | ✅ |
| 7+ | **Gerekli Alanlar** | `lead.extracted_fields` + org config | ❌ |
| Son | Özet | `lead.summary` (truncated) | ❌ |

## Davranış

- **Satıra tıkla** → Inbox'a yönlendir, conversation aç
- **Server-side pagination** → 20 lead per page
- **Sıralama** → Sütun başlığına tıkla (asc/desc toggle)
- **Filtreleme** → Şimdilik yok (gelecekte eklenebilir)

## Tasarım Kararları

1. **Gerekli alanlar dinamik sütun** - Her org farklı alanlar tanımlayabilir
2. **Duplicate yok** - Lead detayları için Inbox kullanılır, ayrı detail sayfası yok
3. **YAGNI** - Filtreleme, export, bulk actions gibi özellikler MVP'de yok
