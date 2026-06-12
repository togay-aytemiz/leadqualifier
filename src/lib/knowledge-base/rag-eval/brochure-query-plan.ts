import {
  buildPriceClarificationQuestion,
  shouldAskPriceClarification,
} from '@/lib/knowledge-base/rag-clarification'

export type BrochureQueryIntent =
  | 'brochure_table_fact'
  | 'brochure_scholarship'
  | 'brochure_campus_contact'
  | 'brochure_overview'
  | 'document_router'
  | 'unsupported_guardrail'
  | 'website_admissions'
  | 'website_contact'
  | 'general_approved_corpus'

export type BrochureGuardrailReason = 'guarantee' | 'future_information'
export type BrochureClarificationReason = 'missing_price_subject' | 'missing_admissions_profile'

export type BrochureTableField =
  | 'price'
  | 'quota'
  | 'success_rank'
  | 'base_score'
  | 'point_type'
  | 'program_code'

export type BrochureQueryPlan = {
  intent: BrochureQueryIntent
  program?: string
  variant?: string
  programs: string[]
  variants: string[]
  requestedFields: BrochureTableField[]
  sourceGroups: string[]
  retryQuery: string
  guardrailReason?: BrochureGuardrailReason
  clarification?: {
    reason: BrochureClarificationReason
    question: string
  }
}

const TURKISH_CHAR_MAP: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  ğ: 'g',
  Ğ: 'g',
  ü: 'u',
  Ü: 'u',
  ş: 's',
  Ş: 's',
  ö: 'o',
  Ö: 'o',
  ç: 'c',
  Ç: 'c',
}

const PROGRAM_GROUPS: Array<{ program: string; aliases: string[]; sourceGroup: string }> = [
  {
    program: 'Tıp Fakültesi',
    aliases: ['tip fakultesi', 'ingilizce tip', 'turkce tip', 'tip'],
    sourceGroup: 'brochure-program-fee-tip',
  },
  {
    program: 'Beslenme ve Diyetetik',
    aliases: ['beslenme ve diyetetik'],
    sourceGroup: 'brochure-program-fee-saglik-bilimleri',
  },
  {
    program: 'Dil ve Konuşma Terapisi',
    aliases: ['dil ve konusma terapisi'],
    sourceGroup: 'brochure-program-fee-saglik-bilimleri',
  },
  {
    program: 'Fizyoterapi ve Rehabilitasyon',
    aliases: ['fizyoterapi ve rehabilitasyon'],
    sourceGroup: 'brochure-program-fee-saglik-bilimleri',
  },
  {
    program: 'Hemşirelik',
    aliases: ['hemsirelik'],
    sourceGroup: 'brochure-program-fee-saglik-bilimleri',
  },
  {
    program: 'Sağlık Yönetimi',
    aliases: ['saglik yonetimi'],
    sourceGroup: 'brochure-program-fee-saglik-bilimleri',
  },
  {
    program: 'Ergoterapi',
    aliases: ['ergoterapi'],
    sourceGroup: 'brochure-program-fee-saglik-bilimleri',
  },
  {
    program: 'Ebelik',
    aliases: ['ebelik'],
    sourceGroup: 'brochure-program-fee-saglik-bilimleri',
  },
  {
    program: 'Antrenörlük Eğitimi',
    aliases: ['antrenorluk egitimi'],
    sourceGroup: 'brochure-program-fee-spor',
  },
  {
    program: 'Ameliyathane Hizmetleri',
    aliases: ['ameliyathane hizmetleri'],
    sourceGroup: 'brochure-program-fee-shmyo',
  },
  {
    program: 'Anestezi',
    aliases: ['anestezi'],
    sourceGroup: 'brochure-program-fee-shmyo',
  },
  {
    program: 'Biyomedikal Cihaz Teknolojisi',
    aliases: ['biyomedikal cihaz teknolojisi'],
    sourceGroup: 'brochure-program-fee-shmyo',
  },
  {
    program: 'Elektronörofizyoloji',
    aliases: ['elektronorofizyoloji'],
    sourceGroup: 'brochure-program-fee-shmyo',
  },
  {
    program: 'Optisyenlik',
    aliases: ['optisyenlik'],
    sourceGroup: 'brochure-program-fee-shmyo',
  },
  {
    program: 'Tıbbi Dokümantasyon ve Sekreterlik',
    aliases: ['tibbi dokumantasyon ve sekreterlik', 't.dokumantasyon ve sekreterlik'],
    sourceGroup: 'brochure-program-fee-shmyo',
  },
  {
    program: 'Tıbbi Laboratuvar Teknikleri',
    aliases: ['tibbi laboratuvar teknikleri'],
    sourceGroup: 'brochure-program-fee-shmyo',
  },
  {
    program: 'Tıbbi Tanıtım ve Pazarlama',
    aliases: ['tibbi tanitim ve pazarlama', 'tibbi tanitim pazarlama'],
    sourceGroup: 'brochure-program-fee-shmyo',
  },
  {
    program: 'İlk ve Acil Yardım',
    aliases: ['ilk ve acil yardim'],
    sourceGroup: 'brochure-program-fee-shmyo',
  },
  {
    program: 'Tele-Sağlık Teknikerliği',
    aliases: ['tele-saglik teknikerligi', 'tele saglik teknikerligi'],
    sourceGroup: 'brochure-program-fee-shmyo',
  },
  {
    program: 'Tıbbi Veri İşleme Teknikerliği',
    aliases: ['tibbi veri isleme teknikerligi'],
    sourceGroup: 'brochure-program-fee-shmyo',
  },
  {
    program: 'Bilgisayar Programcılığı',
    aliases: ['bilgisayar programciligi'],
    sourceGroup: 'brochure-program-fee-myo',
  },
  {
    program: 'Eczane Hizmetleri',
    aliases: ['eczane hizmetleri'],
    sourceGroup: 'brochure-program-fee-myo',
  },
  {
    program: 'Elektrik',
    aliases: ['elektrik'],
    sourceGroup: 'brochure-program-fee-myo',
  },
  {
    program: 'Grafik Tasarım',
    aliases: ['grafik tasarim', 'grafik tasarimi'],
    sourceGroup: 'brochure-program-fee-myo',
  },
]

const ALL_PROGRAM_FEE_SOURCE_GROUPS = Array.from(
  new Set(PROGRAM_GROUPS.map((group) => group.sourceGroup))
)

export const BROCHURE_SOURCE_PRIORITY_GROUPS = Array.from(
  new Set([
    ...ALL_PROGRAM_FEE_SOURCE_GROUPS,
    'brochure-overview-contact',
    'brochure-scholarship-double-major',
    'brochure-campus-program-map',
  ])
)

const FIELD_PATTERNS: Array<{
  field: BrochureTableField
  label: string
  patterns: RegExp[]
}> = [
  {
    field: 'price',
    label: '2025 Fiyat',
    patterns: [
      /\bfiyat/,
      /\bucret(?:i|ler|leri)?\b/,
      /\bkac\s+para\b/,
      /\bkaca\b/,
      /\bkac\s*tl\b/,
      /\bne\s+kadar\b/,
      /\bne\s+kadar\s+tutar\b/,
      /\bmaliyet/,
    ],
  },
  {
    field: 'quota',
    label: '2025 Kontenjanı',
    patterns: [/\bkontenjan/, /\bkac kisi/, /\bkac ogrenci/, /\bkac aday/, /\bkisi aliniyor/],
  },
  {
    field: 'success_rank',
    label: '2024 Başarı Sırası',
    patterns: [/\bbasari sirasi/, /\bsiralama/],
  },
  { field: 'base_score', label: '2024 Taban Puanı', patterns: [/\btaban puan/] },
  {
    field: 'point_type',
    label: 'Puan Türü',
    patterns: [/\bpuan turu/, /\bsayisal/, /\besit agirlik/, /\btyt\b/, /\bsay ile/, /\bea ile/],
  },
  { field: 'program_code', label: 'Puan Kodu', patterns: [/\bpuan kodu/, /\bprogram kodu/] },
]

const FULL_ROW_FIELDS: BrochureTableField[] = [
  'point_type',
  'quota',
  'success_rank',
  'base_score',
  'price',
]

const WEBSITE_ADMISSIONS_RETRY_QUERY = [
  'Aday öğrenci',
  'Fakülte ve Bölümler',
  'Fakülte ve Bölümlere Göz Atın',
  'Tıp Fakültesi',
  'Sağlık Bilimleri Fakültesi',
  'Sağlık Hizmetleri Meslek Yüksekokulu',
  'Meslek Yüksekokulu',
  'Spor Bilimleri Fakültesi',
].join(' | ')

function normalize(value: string) {
  return value
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function hasEnglishVariantSignal(normalized: string) {
  return (
    normalized.includes('ingilizce') ||
    normalized.includes('english') ||
    /(?:^|[^a-z0-9])ing(?:[^a-z0-9]|$)/.test(normalized)
  )
}

function detectRequestedFields(question: string): BrochureTableField[] {
  const normalized = normalize(question)
  if (/\bsatir/.test(normalized) && /(?:acikla|ozetle|temkinli)/.test(normalized)) {
    return FULL_ROW_FIELDS
  }
  const requestedFields = FIELD_PATTERNS.flatMap(({ field, patterns }) => {
    const positions = patterns
      .map((pattern) => normalized.search(pattern))
      .filter((position) => position >= 0)
    return positions.length > 0 ? [{ field, position: Math.min(...positions) }] : []
  })
    .sort((a, b) => a.position - b.position)
    .map(({ field }) => field)
  if (
    requestedFields.length === 0 &&
    /(?:% ?50|\byuzde ?50\b|\bindirimli\s+program\b|\bburslu\s+program\b|\bucretli\s+program\b)/.test(
      normalized
    ) &&
    /(?:var mi|varmi|mevcut mu|bulunuyor mu)/.test(normalized)
  ) {
    return ['price' satisfies BrochureTableField]
  }
  return requestedFields
}

function detectPrograms(question: string) {
  const normalized = normalize(question).replace(/[^\p{L}\p{N}%]+/gu, ' ')
  return PROGRAM_GROUPS.filter(({ aliases }) =>
    aliases.some((alias) => ` ${normalized} `.includes(` ${alias} `))
  )
}

function detectVariants(question: string) {
  const normalized = normalize(question)
  if (normalized.includes('hazirlik')) return ['Hazırlık']

  const english = hasEnglishVariantSignal(normalized)
  const discounted = /% ?50|yuzde ?50/.test(normalized)
  const burslu = normalized.includes('burslu')
  const paid = normalized.includes('ucretli')

  if (english && discounted) return ['İngilizce %50 İnd.']
  if (english && burslu) return ['İngilizce Burslu']
  if (english && paid) return ['İngilizce Ücretli']
  if (english) return ['İngilizce']

  return [
    ...(paid ? ['Ücretli'] : []),
    ...(burslu ? ['Burslu'] : []),
    ...(discounted ? ['%50 İnd.'] : []),
  ]
}

function isScholarshipQuestion(question: string) {
  return /(?:burs|çift anadal|cift anadal)/i.test(question)
}

function isCampusQuestion(question: string) {
  return /(?:yerleşke|yerleske|kampüs|kampus|adres|\bnerede\b)/i.test(question)
}

function isContactQuestion(question: string) {
  const normalized = normalize(question)
  return /(?:telefon|iletisim|e-?posta|email|ulasim|konaklama|(?:^|\s)yurt(?:lar|lari|larin|u|un|larda|lardan)?(?:\s|$))/i.test(
    normalized
  )
}

function isDocumentRouterQuestion(question: string) {
  return /(?:yönerge|yonerge|yönetmelik|yonetmelik|mevzuat|doküman|dokuman|hangi dosyada|hangi belgede|hangi kaynak|nereden öğrenebilirim|nereden ogrenebilirim)/i.test(
    question
  )
}

function isWebsiteAdmissionsQuestion(question: string) {
  const normalized = normalize(question)
  return (
    /aday ogrenci sayfasi/.test(normalized) ||
    (/web sitesi/.test(normalized) &&
      !isContactQuestion(question) &&
      /(?:fakulte ve bolumler|fakulte ve bolumlere goz atin|aday ogrenci)/.test(normalized))
  )
}

function isWebsiteContactQuestion(question: string) {
  const normalized = normalize(question)
  return (
    /(?:web sitesi|web sitesinde)/.test(normalized) &&
    /(?:telefon|iletisim|e-posta|eposta|email)/.test(normalized)
  )
}

function isWebsiteAcademicQuestion(question: string) {
  const normalized = normalize(question)
  return (
    /(?:web sitesi|web sitesindeki|bilgi paketi)/.test(normalized) &&
    /bilgi paketi/.test(normalized) &&
    /(?:program|fakulte|yuksekokul|bolum)/.test(normalized)
  )
}

function isBrochureOverviewQuestion(question: string) {
  const normalized = normalize(question)
  return /(?:kurucu vak|saglik alanindaki gecmis|kalp nakli|karaciger nakli)/.test(normalized)
}

function detectGuardrailReason(question: string): BrochureGuardrailReason | undefined {
  const normalized = normalize(question)
  if (
    /(?:\bkesin\b|\bgaranti\b).{0,80}(?:kontenjan|kabul|kazan|yerles|ayir)/.test(normalized) ||
    /(?:kontenjan|kabul|kazan|yerles|ayir).{0,80}(?:\bkesin\b|\bgaranti\b)/.test(normalized)
  ) {
    return 'guarantee'
  }
  if (/\b20(?:2[6-9]|[3-9]\d)(?:\s*[-/]\s*20\d{2})?\b/.test(normalized)) {
    return 'future_information'
  }
  return undefined
}

function admissionChanceClarification(
  question: string,
  programs: string[]
): BrochureQueryPlan['clarification'] {
  const normalized = normalize(question)
  const asksAdmissionChance =
    /(?:puan|siralama|siralamam|puanim|bu siralamayla|bu puanla).{0,80}(?:kazan|yerles|girer miyim|gelir mi)/.test(
      normalized
    )
  const hasConcreteScoreOrRank = /\b\d{2,}(?:[.,]\d+)*\b/.test(normalized)
  if (!asksAdmissionChance || (programs.length > 0 && hasConcreteScoreOrRank)) return undefined

  return {
    reason: 'missing_admissions_profile',
    question:
      'Hangi program için değerlendirme yapmak istiyorsunuz? Puanınızı veya başarı sıralamanızı da yazarsanız broşürdeki taban puan ve başarı sırası bilgileriyle karşılaştırabilirim.',
  }
}

function buildRetryQuery(input: {
  question: string
  programs: string[]
  variants: string[]
  requestedFields: BrochureTableField[]
}) {
  if (input.requestedFields.length === 0) return input.question
  const fieldLabels = input.requestedFields.map(
    (field) => FIELD_PATTERNS.find((candidate) => candidate.field === field)?.label ?? field
  )
  if (input.programs.length === 0) {
    return [...fieldLabels, 'tüm programlar', 'doğrulanmış tanıtım broşürü tablo satırı']
      .filter(Boolean)
      .join(' | ')
  }
  return [
    ...input.programs,
    ...input.variants,
    ...fieldLabels,
    'doğrulanmış tanıtım broşürü tablo satırı',
  ]
    .filter(Boolean)
    .join(' | ')
}

export function planBrochureQuery(question: string): BrochureQueryPlan {
  const requestedFields = detectRequestedFields(question)
  const programMatches = detectPrograms(question)
  const programs = programMatches.map((match) => match.program)
  const variants = detectVariants(question)
  const guardrailReason = detectGuardrailReason(question)
  const clarification =
    admissionChanceClarification(question, programs) ??
    (requestedFields.includes('price') &&
    programs.length === 0 &&
    shouldAskPriceClarification(question)
      ? {
          reason: 'missing_price_subject' as const,
          question: buildPriceClarificationQuestion('tr', 'education'),
        }
      : undefined)

  let intent: BrochureQueryIntent = 'general_approved_corpus'
  let sourceGroups: string[] = []
  const broadTableQuestion =
    programs.length === 0 &&
    requestedFields.some((field) => field === 'base_score' || field === 'success_rank')

  if (guardrailReason) {
    intent = 'unsupported_guardrail'
  } else if (clarification) {
    intent = 'general_approved_corpus'
  } else if (broadTableQuestion) {
    intent = 'brochure_table_fact'
    sourceGroups = ALL_PROGRAM_FEE_SOURCE_GROUPS
  } else if (requestedFields.length > 0 && programMatches.length > 0) {
    intent = 'brochure_table_fact'
    sourceGroups = Array.from(new Set(programMatches.map((match) => match.sourceGroup)))
  } else if (isWebsiteContactQuestion(question)) {
    intent = 'website_contact'
    sourceGroups = ['contact-admin']
  } else if (isWebsiteAcademicQuestion(question)) {
    intent = 'general_approved_corpus'
    sourceGroups = ['general']
  } else if (isWebsiteAdmissionsQuestion(question)) {
    intent = 'website_admissions'
    sourceGroups = ['admissions']
  } else if (isBrochureOverviewQuestion(question)) {
    intent = 'brochure_overview'
    sourceGroups = ['brochure-overview-contact']
  } else if (isDocumentRouterQuestion(question)) {
    intent = 'document_router'
  } else if (isScholarshipQuestion(question)) {
    intent = 'brochure_scholarship'
    sourceGroups = ['brochure-scholarship-double-major']
  } else if (isCampusQuestion(question)) {
    intent = 'brochure_campus_contact'
    sourceGroups = [
      'brochure-campus-program-map',
      ...(isContactQuestion(question) ? ['brochure-overview-contact'] : []),
    ]
  } else if (isContactQuestion(question)) {
    intent = 'brochure_campus_contact'
    sourceGroups = ['brochure-overview-contact']
  }

  return {
    intent,
    program: programs[0],
    variant: variants.length === 1 ? variants[0] : undefined,
    programs,
    variants,
    requestedFields,
    sourceGroups,
    guardrailReason,
    clarification,
    retryQuery:
      intent === 'website_admissions'
        ? WEBSITE_ADMISSIONS_RETRY_QUERY
        : buildRetryQuery({
            question,
            programs,
            variants,
            requestedFields,
          }),
  }
}
