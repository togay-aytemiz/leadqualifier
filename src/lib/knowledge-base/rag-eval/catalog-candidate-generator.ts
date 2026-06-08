import type { CustomerEffectiveEvaluationRow } from './customer-question-score-report'
import { normalizeStrictQuestionSearch } from './strict-question-understanding'

export type CatalogGapCategory =
  | 'admissions_decision'
  | 'campus_housing_transport'
  | 'clinical_staj_lab'
  | 'contact_official_next_step'
  | 'credential_recognition'
  | 'finance_payment_policy'
  | 'grounded_direct_fact'
  | 'institution_positioning'
  | 'off_topic_or_safety'
  | 'professional_outcome'
  | 'unknown_safe_boundary'

export type CatalogGapAction = 'add_approved_fact' | 'rerun_regrade' | 'keep_boundary'

export type CatalogCandidate = {
  action: CatalogGapAction
  category: CatalogGapCategory
  catalogSlot: string
  missingFact: string
  requiredEvidence: string
  expectedLift: '8 -> 9' | 'none'
  questionCount: number
  exampleQuestions: string[]
  strictVerdicts: string[]
}

export type CatalogCandidateAnalysis = {
  targetScore: number
  targetRows: CustomerEffectiveEvaluationRow[]
  categoryBreakdown: Array<{
    category: CatalogGapCategory
    count: number
  }>
  candidates: CatalogCandidate[]
}

type CandidateTemplate = Omit<
  CatalogCandidate,
  'questionCount' | 'exampleQuestions' | 'strictVerdicts'
>

const GROUNDED_FACT_VERDICTS = new Set([
  'catalog_supported_existence',
  'catalog_program_listing',
  'catalog_faculty_listing',
  'catalog_degree_level_listing',
  'catalog_program_distinction_fact',
  'catalog_program_duration_fact',
  'catalog_program_professional_title_fact',
  'catalog_program_fee_fact',
  'catalog_admissions_point_type_fact',
  'catalog_campus_program_listing',
  'catalog_institution_fact',
  'catalog_institution_location_fact',
  'catalog_scholarship_fact',
  'catalog_clinical_training_fact',
  'catalog_internship_policy_fact',
  'catalog_ergotherapy_training_fact',
  'catalog_housing_link_fact',
  'catalog_housing_agreement_fact',
  'catalog_double_major_fact',
  'catalog_affiliated_hospital_definition_fact',
  'catalog_affiliated_hospital_training_fact',
  'catalog_campus_life_fact',
])

const TEMPLATE_BY_CATEGORY: Record<CatalogGapCategory, CandidateTemplate> = {
  admissions_decision: {
    action: 'add_approved_fact',
    category: 'admissions_decision',
    catalogSlot: 'admissions.metrics_and_decision_policy',
    missingFact:
      'Program bazında taban puan, başarı sıralaması, kontenjan, burs/indirim satırı ve tercih-decision sınırı',
    requiredEvidence:
      'Güncel ÖSYM/YÖK Atlas verisi, aday öğrenci tercih rehberi veya müşteri-onaylı admissions policy cevabı',
    expectedLift: '8 -> 9',
  },
  campus_housing_transport: {
    action: 'add_approved_fact',
    category: 'campus_housing_transport',
    catalogSlot: 'campus_transport.service_details',
    missingFact: 'Güncel servis, ulaşım modu, güzergah, saat veya ücret ayrıntısı',
    requiredEvidence:
      'Resmi ulaşım duyurusu, aday öğrenci sayfası, konaklama/yurt duyurusu veya müşteri-onaylı campus operations sheet',
    expectedLift: '8 -> 9',
  },
  clinical_staj_lab: {
    action: 'add_approved_fact',
    category: 'clinical_staj_lab',
    catalogSlot: 'clinical_training.program_practice_details',
    missingFact:
      'Program bazında klinik uygulama, staj, laboratuvar, cihaz, hasta başı eğitim veya uygulama yeri ayrıntısı',
    requiredEvidence:
      'Program bilgi paketi, uygulamalı eğitim yönergesi, laboratuvar envanteri veya müşteri-onaylı klinik/staj fact sheet',
    expectedLift: '8 -> 9',
  },
  contact_official_next_step: {
    action: 'add_approved_fact',
    category: 'contact_official_next_step',
    catalogSlot: 'contact.official_channels',
    missingFact:
      'Aday öğrenci, Öğrenci İşleri, WhatsApp/danışma hattı, kayıt ofisi veya tanıtım günü resmi yönlendirmesi',
    requiredEvidence:
      'Resmi iletişim sayfası, birim telefon listesi, kayıt duyurusu veya müşteri-onaylı next-step routing sheet',
    expectedLift: '8 -> 9',
  },
  credential_recognition: {
    action: 'add_approved_fact',
    category: 'credential_recognition',
    catalogSlot: 'credential.accreditation_recognition',
    missingFact:
      'Program akreditasyonu, YÖK/YÖKSİS tanınma durumu, diploma eki, Mavi diploma veya ülke bazlı denklik sınırı',
    requiredEvidence:
      'YÖK/YÖKSİS/YÖKAK kaydı, akreditasyon belgesi, diploma eki sayfası veya müşteri-onaylı credential policy',
    expectedLift: '8 -> 9',
  },
  finance_payment_policy: {
    action: 'add_approved_fact',
    category: 'finance_payment_policy',
    catalogSlot: 'finance.payment_policy',
    missingFact:
      'KDV, taksit, peşin/online ödeme, IBAN, kayıt anı ödeme veya yıllık artış koşulu',
    requiredEvidence:
      'Güncel ücret/kayıt duyurusu, ödeme koşulları sayfası, muhasebe/aday öğrenci onaylı payment policy sheet',
    expectedLift: '8 -> 9',
  },
  grounded_direct_fact: {
    action: 'rerun_regrade',
    category: 'grounded_direct_fact',
    catalogSlot: 'strict_quality.regrade',
    missingFact: 'Catalog fact already exists; rerun should use strictQuality suggested score',
    requiredEvidence:
      'No new source needed if strictQuality tier is grounded_direct_fact and citations are present',
    expectedLift: '8 -> 9',
  },
  institution_positioning: {
    action: 'add_approved_fact',
    category: 'institution_positioning',
    catalogSlot: 'institution.positioning',
    missingFact:
      'Üniversite avantajları, farklılaşma, sağlık alanı odağı, aday öğrenci tanıtım mesajı veya onaylı value proposition',
    requiredEvidence:
      'Müşteri-onaylı tanıtım metni, aday öğrenci broşürü, kurumsal sayfa veya satış/demo positioning sheet',
    expectedLift: '8 -> 9',
  },
  off_topic_or_safety: {
    action: 'keep_boundary',
    category: 'off_topic_or_safety',
    catalogSlot: 'safety.boundary',
    missingFact: 'No catalog fact should be added for off-topic, abuse, fraud, or sensitive-data prompts',
    requiredEvidence: 'Keep current safety/off-topic boundary',
    expectedLift: 'none',
  },
  professional_outcome: {
    action: 'add_approved_fact',
    category: 'professional_outcome',
    catalogSlot: 'career.professional_authority',
    missingFact:
      'Program bazında mesleki yetki, iş yeri açma, araç kullanma, unvan, iş garantisi veya outcome sınırı',
    requiredEvidence:
      'Resmi meslek mevzuatı, program mezuniyet çıktısı, kariyer merkezi metni veya müşteri-onaylı career boundary sheet',
    expectedLift: '8 -> 9',
  },
  unknown_safe_boundary: {
    action: 'add_approved_fact',
    category: 'unknown_safe_boundary',
    catalogSlot: 'catalog.unclassified_safe_boundary',
    missingFact: 'Safe boundary classifies correctly but lacks a typed catalog slot',
    requiredEvidence:
      'Review question, answer, verdict and source pack; assign a typed catalog slot before adding facts',
    expectedLift: '8 -> 9',
  },
}

function categoryForVerdict(
  row: CustomerEffectiveEvaluationRow
): CatalogGapCategory {
  const verdict = row.latestRetest?.strictVerdict ?? ''
  const tier = row.latestRetest?.strictQuality?.tier

  if (!verdict && !tier) return categoryForQuestionText(row.question)
  if (
    verdict === 'supported' ||
    verdict === 'unsupported' ||
    (!verdict.startsWith('catalog_') && !verdict.startsWith('unsafe'))
  ) {
    return categoryForQuestionText(row.question)
  }

  if (tier === 'grounded_direct_fact' || (!tier && GROUNDED_FACT_VERDICTS.has(verdict))) {
    return 'grounded_direct_fact'
  }
  if (/payment|program_fee|scholarship/.test(verdict)) return 'finance_payment_policy'
  if (/admissions|academic_process/.test(verdict)) return 'admissions_decision'
  if (/campus|housing|transport|candidate_event/.test(verdict)) {
    return 'campus_housing_transport'
  }
  if (/clinical|internship|facility|lab|hospital/.test(verdict)) return 'clinical_staj_lab'
  if (/credential|accreditation|recognition/.test(verdict)) return 'credential_recognition'
  if (/contact|registration/.test(verdict)) return 'contact_official_next_step'
  if (/professional|reputation/.test(verdict)) return 'professional_outcome'
  if (/off_topic|unsafe|safety/.test(verdict)) return 'off_topic_or_safety'

  const answer = row.latestRetest?.answer ?? ''
  if (/net bilgi bulunmamaktadır|doğrulanmalıdır|dogrulanmalidir/u.test(answer)) {
    return 'unknown_safe_boundary'
  }
  return 'unknown_safe_boundary'
}

function categoryForQuestionText(question: string): CatalogGapCategory {
  const search = normalizeStrictQuestionSearch(question)

  if (
    /(?:kredi kart|tc kimlik|osym sifre|ösym şifre|sahte belge|torpil|kufur|küfür|kahve|burc|burç|fal|sevgili|telefon hediye|kripto|pazarlik|pazarlık)/.test(
      search
    )
  ) {
    return 'off_topic_or_safety'
  }

  if (
    /(?:avantaj|farki|farkı|neden tercih|niye tercih|one cikiyor|öne çıkıyor|saglik alani|sağlık alanı|aday ogrenciler icin|aday öğrenciler için|tanitir misin|tanıtır mısın|kisa tanit|kısa tanıt)/.test(
      search
    )
  ) {
    return 'institution_positioning'
  }

  if (
    /(?:kontenjan|taban puan|basari siralama|başarı sıralama|siralama|sıralama|puan|tercih|tyt|say| ea |yks|dgs|yatay gecis|yatay geçiş|kesin gir|kazanir miyim|kazanır mıyım|yerlesebilir|yerleşebilir)/.test(
      search
    )
  ) {
    return 'admissions_decision'
  }

  if (
    /(?:secmeliyim|seçmeliyim|yazabilirim|yazmaliyim|yazmalıyım|onerirsiniz|önerirsiniz|tercih listesi|kesin kazanacagim|kesin kazanacağım|tip gelmezse|tıp gelmezse|hangi bolum.*uygun|hangi bölüm.*uygun|hangi program.*uygun|hastanede calismak|hastanede çalışmak|laboratuvarda calismak|laboratuvarda çalışmak|insanlarla birebir|spor gecmisim|spor geçmişim|bilgisayara ilgim)/.test(
      search
    )
  ) {
    return 'admissions_decision'
  }

  if (/(?:yemek|yemekhane|sosyal imkan|sosyal imkân)/.test(search)) {
    return 'campus_housing_transport'
  }

  if (/(?:ankara.*kira|kiralar|kira ne kadar|kiralik ev|kiralık ev)/.test(search)) {
    return 'campus_housing_transport'
  }

  if (
    /(?:hocalar zor|en kolay|en zor|en az ders|kopya|devamsizliktan kalmak|devamsızlıktan kalmak|kiz erkek orani|kız erkek oranı|rakip universite|rakip üniversite|kiyaslar|kıyaslar|eksileri|kotu yorum|kötü yorum)/.test(
      search
    )
  ) {
    return 'professional_outcome'
  }

  if (
    /(?:devlet mi|vakif|vakıf|vakfi|vakfı|ankara|ne zaman kuruldu|kurucu|hangi fakulte|hangi fakülte|hangi bolum|hangi bölüm|hangi program|hangi meslek yuksekokulu|hangi meslek yüksekokulu|hangi meslek yuksekokullari|hangi meslek yüksekokulları|lisans|on lisans|ön lisans|kac yillik|kaç yıllık|kac yil|kaç yıl|hakkinda bilgi|hakkında bilgi|anestezi ile ameliyathane|programlari ayri ayri|programları ayrı ayrı)/.test(
      search
    )
  ) {
    return 'grounded_direct_fact'
  }

  if (/(?:ucret|ücret|kac para|kaç para|kac tl|kaç tl|fiyat|taksit|kdv|iban|odeme|ödeme|burs|indirim|hazirlik.*ucret|hazırlık.*ücret)/.test(search)) {
    return 'finance_payment_policy'
  }

  if (
    /(?:yurt|konaklama|servis|kampus|kampüs|yerleske|yerleşke|ulasim|ulaşım|yemek|yemekhane|kafe|kantin|kutuphane|kütüphane|wifi|wi fi|spor salonu|otopark|revir|kedi|apart|kiralik ev|kiralık ev)/.test(
      search
    )
  ) {
    return 'campus_housing_transport'
  }

  const asksProgramExistence =
    /(?:var mi|var mı|varmi)\??$/.test(search) &&
    /(?:tip fakultesi|tıp fakültesi|hemsirelik|hemşirelik|ebelik|beslenme|ergoterapi|dil ve konusma|dil ve konuşma|fizyoterapi ve rehabilitasyon|saglik yonetimi|sağlık yönetimi|antrenorluk|antrenörlük|ameliyathane hizmetleri|anestezi|ilk ve acil yardim|ilk ve acil yardım|tibbi laboratuvar teknikleri|tıbbi laboratuvar teknikleri|tibbi goruntuleme teknikleri|tıbbi görüntüleme teknikleri|eczane hizmetleri|optisyenlik|bilgisayar programciligi|bilgisayar programcılığı|grafik tasarim|grafik tasarım|elektrik|tele saglik|tele sağlık|tibbi veri|tıbbi veri)/.test(
      search
    )
  if (asksProgramExistence) {
    return 'grounded_direct_fact'
  }

  if (
    /(?:hastane|afiliye|staj|klinik|hasta|laboratuvar|lab|kadavra|maket|mikroskop|cihaz|ambulans|ameliyat|kan|uygulama|vaka|yogun bakim|yoğun bakım|dogumhane|doğumhane)/.test(
      search
    )
  ) {
    return 'clinical_staj_lab'
  }

  if (/(?:akredite|akreditasyon|diploma|denklik|yok|yök|kpss|atan)/.test(search)) {
    return 'credential_recognition'
  }

  if (
    /(?:kayit|kayıt|telefon|whatsapp|randevu|belge|e devlet|edevlet|kampusu gez|kampüsü gez|tanitim gun|tanıtım gün|aday ogrenci|aday öğrenci|ogrenci isleri|öğrenci işleri|gorus|görüş)/.test(
      search
    )
  ) {
    return 'contact_official_next_step'
  }

  if (
    /(?:is imkani|iş imkanı|is bul|iş bul|maas|maaş|kolay|zor|gozlukcu|gözlükçü|eczaci|eczacı|hacker|logo|zengin|is garantisi|iş garantisi|unvan|mesleki yetki|ne is yapar|ne iş yapar|nerelerde calisir|nerelerde çalışır)/.test(
      search
    )
  ) {
    return 'professional_outcome'
  }

  return 'unknown_safe_boundary'
}

function rowQuestionLabel(row: CustomerEffectiveEvaluationRow) {
  return `#${row.no} ${row.question}`
}

function sortCategoryCounts(
  counts: Map<CatalogGapCategory, number>
): CatalogCandidateAnalysis['categoryBreakdown'] {
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => left.category.localeCompare(right.category))
}

export function analyzeCatalogCandidateGaps(
  rows: CustomerEffectiveEvaluationRow[],
  options: { targetScore?: number; maxExamplesPerCandidate?: number } = {}
): CatalogCandidateAnalysis {
  const targetScore = options.targetScore ?? 8
  const maxExamples = options.maxExamplesPerCandidate ?? 5
  const targetRows = rows.filter((row) => Math.round(row.score) === targetScore)
  const grouped = new Map<
    CatalogGapCategory,
    {
      rows: CustomerEffectiveEvaluationRow[]
      verdicts: Set<string>
    }
  >()

  for (const row of targetRows) {
    const category = categoryForVerdict(row)
    const group = grouped.get(category) ?? { rows: [], verdicts: new Set<string>() }
    group.rows.push(row)
    if (row.latestRetest?.strictVerdict) group.verdicts.add(row.latestRetest.strictVerdict)
    grouped.set(category, group)
  }

  const categoryBreakdown = sortCategoryCounts(
    new Map([...grouped.entries()].map(([category, group]) => [category, group.rows.length]))
  )

  const candidates = [...grouped.entries()]
    .map(([category, group]) => {
      const template = TEMPLATE_BY_CATEGORY[category]
      return {
        ...template,
        questionCount: group.rows.length,
        exampleQuestions: group.rows.slice(0, maxExamples).map(rowQuestionLabel),
        strictVerdicts: [...group.verdicts].sort(),
      }
    })
    .sort((left, right) => left.category.localeCompare(right.category))

  return {
    targetScore,
    targetRows,
    categoryBreakdown,
    candidates,
  }
}
