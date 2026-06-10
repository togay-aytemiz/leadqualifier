# YIU Clarification Follow-up Scenario Eval - 2026-06-10

Bu rapor, belirsiz bir ilk kullanıcı sorusundan sonra botun clarification sorup sormadığını, ardından kullanıcının sadece clarification cevabını verdiği ikinci turda geçmiş bağlamı doğru çözüp çözmediğini ölçer.

- Baseline run id: `2026-06-10T16-47-15-437Z`
- Baseline çıktı: `tmp/customer-question-batches/yiu-clarification-followup-eval-2026-06-10T16-47-15-437Z.md`
- Güncel run id: `2026-06-10T19-16-08-278Z`
- Güncel çıktı: `tmp/customer-question-batches/yiu-clarification-followup-eval-2026-06-10T19-16-08-278Z.md`
- Senaryo sayısı: `10`
- Otomatik strict pass: `2/10` -> `10/10`
- Codex kalite ortalaması: `5.7/10` -> `8.6/10`

## Puan Rubriği

- `9-10`: Clarification doğru, follow-up geçmiş bağlama bağlanıyor, final cevap net/kanıtlı/toplantıda gösterilebilir.
- `7-8`: Final cevap kullanışlı; fakat clarification, history sinyali veya üslup tarafında kalite borcu var.
- `5-6`: Kısmi fayda var ama akış veya odak ciddi zayıf.
- `1-4`: Yanlış, ilgisiz, yanıltıcı veya kullanıcıyı ilerletmeyen cevap.

## Güncel Senaryo Sonuçları

| # | Senaryo | İlk belirsiz soru | Kullanıcı follow-up cevabı | Strict sinyal | Codex puanı | Değerlendirme |
|---:|---|---|---|---|---:|---|
| 1 | Program listesi kapsam seçimi | `hangi bölümlere kayıt olabilirim` | `tümü` | `clarification_ok, history_resolved, final_ok` | 9 | Clarification doğru; ikinci tur tüm program listesine bağlanıyor ve lisans/ön lisans programları fakülte/yüksekokul başlıklarıyla veriliyor. |
| 2 | Ücret için program netleştirme | `kaç para` | `Dil ve Konuşma Terapisi` | `clarification_ok, history_resolved, final_ok` | 9 | Programı soruyor, ikinci turu ücret metriğiyle birleştiriyor ve broşür fiyatını net veriyor. |
| 3 | Kontenjan için program satırı | `kontenjan kaç` | `İngilizce Tıp` | `clarification_ok, history_resolved, final_ok` | 8 | Programı soruyor ve İngilizce Tıp kontenjan satırlarına gidiyor. Cevap tablo ağırlıklı olduğu için biraz yoğun ama doğru. |
| 4 | Yerleşke için program netleştirme | `nerede` | `Tıp Fakültesi` | `clarification_ok, history_resolved, final_ok` | 8 | Yerleşke/adres doğru. Minor kalite borcu: adres verilmişken ek follow-up biraz gereksiz. |
| 5 | Süre için program netleştirme | `kaç yıl` | `Anestezi` | `clarification_ok, history_resolved, final_ok` | 9 | Program soruluyor ve ikinci tur süre metriği korunarak 2 yıllık ön lisans cevabı veriliyor. |
| 6 | Staj için program netleştirme | `staj kaç gün` | `Anestezi` | `clarification_ok, history_resolved, final_ok` | 8 | Staj metriği korunuyor; program özel kesin gün uydurmadan yönerge sınırı doğru veriliyor. |
| 7 | Taban puan için satır netleştirme | `taban puanlar nedir` | `Tıp İngilizce ücretli` | `clarification_ok, history_resolved, final_ok` | 9 | `ücretli` kelimesi fiyat metriğine sapmıyor; taban puan metriği korunup doğru tablo satırı cevaplanıyor. |
| 8 | Başarı sırası için satır netleştirme | `başarı sıralaması nedir` | `Hemşirelik burslu` | `clarification_ok, history_resolved, final_ok` | 9 | Başarı sırası metriği korunuyor ve Hemşirelik burslu satırı doğru cevaplanıyor. |
| 9 | Burs türü netleştirme | `burs kaç` | `YKS üstün başarı bursu` | `clarification_ok, history_resolved, final_ok` | 9 | İlk tur burs türünü soruyor, ikinci tur YKS üstün başarı bursu tutarlarını doğru veriyor. |
| 10 | Hazırlık için program netleştirme | `hazırlık var mı` | `İngilizce Tıp` | `clarification_ok, history_resolved, final_ok` | 8 | Hazırlık metriği korunuyor; kaynakta görülen hazırlık satırı ve resmi yönerge sınırı güvenli şekilde veriliyor. |

## Güncel Kırılım

| Bant | Senaryo sayısı | Oran |
|---|---:|---:|
| 1-4 | 0 | 0.0% |
| 5-6 | 0 | 0.0% |
| 7-9 | 10 | 100.0% |
| 10 | 0 | 0.0% |

## Baseline Senaryo Sonuçları

| # | Senaryo | İlk belirsiz soru | Kullanıcı follow-up cevabı | Strict sinyal | Codex puanı | Değerlendirme |
|---:|---|---|---|---|---:|---|
| 1 | Program listesi kapsam seçimi | `hangi bölümlere kayıt olabilirim` | `tümü` | `clarification_ok, history_not_resolved, final_ok` | 5 | İlk tur clarification yerine no-info sınırına kayıyor. Final cevap bazı birimleri listelese de history çözümü net değil ve cevap fazla genel. |
| 2 | Ücret için program netleştirme | `kaç para` | `Dil ve Konuşma Terapisi` | `clarification_ok, history_resolved, final_ok` | 9 | Beklenen davranışa çok yakın: programı soruyor, ikinci turu ücret niyetine bağlıyor ve broşür fiyatlarını veriyor. |
| 3 | Kontenjan için program satırı | `kontenjan kaç` | `İngilizce Tıp` | `clarification_failed, history_not_resolved, final_ok` | 7 | Final cevap doğru ve işe yarıyor; fakat ilk turda tüm kontenjan listesini dökmüş, ikinci turu da standalone gibi ele almış. |
| 4 | Yerleşke için program netleştirme | `nerede` | `Tıp Fakültesi` | `clarification_ok, history_resolved, final_ok` | 8 | Akış doğru. Minor sorun: cevapta adres verildikten sonra tekrar adres paylaşma follow-up'ı soruyor. |
| 5 | Süre için program netleştirme | `kaç yıl` | `Anestezi` | `clarification_failed, history_resolved, final_ok` | 7 | Final cevap doğru; ilk tur clarification çok jenerik ve bağlama özel değil. |
| 6 | Staj için program netleştirme | `staj kaç gün` | `Anestezi` | `clarification_failed, history_not_resolved, final_failed` | 3 | İlk tur genel yönerge cevabına kayıyor; ikinci turda `Anestezi` cevabını staj süresi bağlamına bağlamıyor, program tanıtımına sapıyor. |
| 7 | Taban puan için satır netleştirme | `taban puanlar nedir` | `Tıp İngilizce ücretli` | `clarification_ok, history_resolved, final_failed` | 4 | Clarification ve history iyi; fakat final taban puanı yerine ücreti cevaplıyor. Intent/facet korunamıyor. |
| 8 | Başarı sırası için satır netleştirme | `başarı sıralaması nedir` | `Hemşirelik burslu` | `clarification_ok, history_resolved, final_failed` | 4 | Clarification iyi; final cevap kullanıcı satırı vermiş olmasına rağmen aynı clarification metnini tekrar ediyor. |
| 9 | Burs türü netleştirme | `burs kaç` | `YKS üstün başarı bursu` | `clarification_failed, history_not_resolved, final_ok` | 8 | Strict akışa göre clarification yok; ama pratikte ilk cevap genel bursları, ikinci cevap YKS bursunu doğru veriyor. Kullanıcı açısından faydalı. |
| 10 | Hazırlık için program netleştirme | `hazırlık var mı` | `İngilizce Tıp` | `clarification_failed, history_not_resolved, final_failed` | 2 | İlk cevap yanlış/ilgisiz hazırlık bağlamına kayıyor; ikinci tur İngilizce Tıp hazırlığı yerine burs cevabı üretiyor. |

## Baseline Kırılım

| Bant | Senaryo sayısı | Oran |
|---|---:|---:|
| 1-4 | 4 | 40.0% |
| 5-6 | 1 | 10.0% |
| 7-9 | 5 | 50.0% |
| 10 | 0 | 0.0% |

## Uygulanan Fixler

1. `requested_metric` / metric carryover eklendi: clarification answer ikinci turunda önceki sorunun metriği korunuyor.
2. `ücretli` kelimesi tek başına fiyat metriği sayılmıyor; table row varyantı olarak kalıyor.
3. Exact non-price brochure table soruları, direct fee catalog'a sapmadan tablo resolver'a gidiyor.
4. Soru işareti olmayan ama “hangi programı belirtmeniz gerekir” gibi güçlü clarification cevapları da history resolution için kullanılabiliyor.
5. Belirsiz quota/duration/staj/hazırlık/burs tutarı/program-list sorularına retrieval öncesi clarification eklendi.
6. Program listesi direct catalog cevabı fakülte/yüksekokul başlıklarıyla gruplandı.
7. Hazırlık follow-up'ı için güvenli direct boundary eklendi: kesin zorunluluk uydurmadan hazırlık satırı ve resmi yönerge doğrulama sınırı veriliyor.

## Ana Bulgular

1. Bu sınıfta en büyük kalite farkını LLM modelinden çok state/metric taşıma yarattı.
2. Clarification cevabında kullanıcının söylediği şey çoğunlukla entity/scope; metric önceki kullanıcı sorusundan gelmeli.
3. Direct catalog, “tüm programlar” gibi sabit listelerde retrieval drift'ini sıfırlıyor ve maliyeti düşürüyor.
4. Hazırlık/staj gibi policy başlıklarında “kesin var/yok” uydurmak yerine kaynakta görülen fact + resmi doğrulama boundary daha güvenli ve toplantı odasında daha savunulabilir.

## Önerilen Sonraki Fixler

1. Aynı 10-case harness'i daha büyük bir belirsiz-followup setine genişlet.
2. Assistant follow-up kalitesini ayrıca sıkılaştır: cevap içinde zaten verilen bilgiyi tekrar sorma.
3. Direct catalog olmayan sektörlerde aynı metric/entity carryover mantığını Supabase RAG path'ine de taşı.
