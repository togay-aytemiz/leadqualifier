export type StrictQuestionIntent =
  | 'price'
  | 'quota'
  | 'existence'
  | 'listing'
  | 'location'
  | 'transport'
  | 'payment'
  | 'scholarship'
  | 'safety'
  | 'off_topic'
  | 'unknown'

export type StrictQuestionSafety =
  | 'none'
  | 'sensitive_personal_data'
  | 'payment_card'
  | 'credential_request'
  | 'fraud_or_bypass'
  | 'abusive'

export type StrictEntityKind = 'program' | 'faculty' | 'school' | 'service'

export type StrictQuestionEntity = {
  kind: StrictEntityKind
  canonicalName: string
  matchedAlias: string
}

export type StrictQuestionUnderstanding = {
  originalQuestion: string
  normalizedQuestion: string
  normalizedSearch: string
  intents: StrictQuestionIntent[]
  entities: StrictQuestionEntity[]
  safety: StrictQuestionSafety
}

type EntityAlias = {
  kind: StrictEntityKind
  canonicalName: string
  aliases: string[]
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

const ENTITY_ALIASES: EntityAlias[] = [
  {
    kind: 'program',
    canonicalName: 'Dil ve Konuşma Terapisi',
    aliases: ['dkt', 'dil konusma terapisi', 'dil ve konusma terapisi'],
  },
  {
    kind: 'program',
    canonicalName: 'Fizyoterapi ve Rehabilitasyon',
    aliases: ['ftr', 'fizyoterapi', 'fizyoterapi ve rehabilitasyon'],
  },
  {
    kind: 'program',
    canonicalName: 'Beslenme ve Diyetetik',
    aliases: ['beslenme', 'beslenme ve diyetetik'],
  },
  {
    kind: 'program',
    canonicalName: 'Ergoterapi',
    aliases: ['ergoterapi'],
  },
  {
    kind: 'program',
    canonicalName: 'Sağlık Yönetimi',
    aliases: ['saglik yonetimi'],
  },
  {
    kind: 'program',
    canonicalName: 'İlk ve Acil Yardım',
    aliases: ['ilkyardim', 'ilk yardim', 'ilk ve acil yardim'],
  },
  {
    kind: 'program',
    canonicalName: 'Tıp Fakültesi',
    aliases: ['tip', 'tip fakultesi', 'turkce tip', 'ingilizce tip'],
  },
  {
    kind: 'program',
    canonicalName: 'Hemşirelik',
    aliases: ['hemsirelik'],
  },
  {
    kind: 'program',
    canonicalName: 'Ebelik',
    aliases: ['ebelik'],
  },
  {
    kind: 'program',
    canonicalName: 'Anestezi',
    aliases: ['anestezi'],
  },
  {
    kind: 'program',
    canonicalName: 'Ameliyathane Hizmetleri',
    aliases: ['ameliyathane hizmetleri'],
  },
  {
    kind: 'program',
    canonicalName: 'Bilgisayar Programcılığı',
    aliases: ['bilgisayar programciligi'],
  },
  {
    kind: 'program',
    canonicalName: 'Grafik Tasarım',
    aliases: ['grafik tasarim', 'grafik tasarimi'],
  },
  {
    kind: 'program',
    canonicalName: 'Optisyenlik',
    aliases: ['optisyenlik'],
  },
  {
    kind: 'program',
    canonicalName: 'Eczane Hizmetleri',
    aliases: ['eczane hizmetleri'],
  },
  {
    kind: 'program',
    canonicalName: 'Tıbbi Laboratuvar Teknikleri',
    aliases: ['tibbi laboratuvar', 'tibbi laboratuvar teknikleri'],
  },
  {
    kind: 'program',
    canonicalName: 'Tıbbi Görüntüleme Teknikleri',
    aliases: ['tibbi goruntuleme', 'tibbi goruntuleme teknikleri'],
  },
  {
    kind: 'program',
    canonicalName: 'Tıbbi Dokümantasyon ve Sekreterlik',
    aliases: ['tibbi dokumantasyon', 'tibbi dokumantasyon ve sekreterlik'],
  },
  {
    kind: 'program',
    canonicalName: 'Tele-Sağlık Teknikerliği',
    aliases: ['tele saglik', 'tele saglik teknikerligi'],
  },
  {
    kind: 'program',
    canonicalName: 'Tıbbi Veri İşleme Teknikerliği',
    aliases: ['tibbi veri isleme', 'tibbi veri isleme teknikerligi'],
  },
  {
    kind: 'program',
    canonicalName: 'Elektronörofizyoloji',
    aliases: ['elektronorofizyoloji'],
  },
  {
    kind: 'program',
    canonicalName: 'Biyomedikal Cihaz Teknolojisi',
    aliases: ['biyomedikal cihaz teknolojisi'],
  },
  {
    kind: 'school',
    canonicalName: 'Sağlık Hizmetleri Meslek Yüksekokulu',
    aliases: ['shmyo', 'saglik hizmetleri meslek yuksekokulu'],
  },
  {
    kind: 'school',
    canonicalName: 'Meslek Yüksekokulu',
    aliases: ['myo', 'meslek yuksekokulu'],
  },
  {
    kind: 'faculty',
    canonicalName: 'Sağlık Bilimleri Fakültesi',
    aliases: ['saglik bilimleri fakultesi'],
  },
  {
    kind: 'faculty',
    canonicalName: 'Spor Bilimleri Fakültesi',
    aliases: ['spor bilimleri fakultesi'],
  },
  {
    kind: 'service',
    canonicalName: 'ulaşım servisi',
    aliases: ['servis', 'ulasim servisi', 'kampus servisi', 'hastane servisi'],
  },
]

function normalize(value: string) {
  return value
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/['’`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeLoose(value: string) {
  return normalize(value)
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function phrasePattern(alias: string) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, String.raw`\s+`)
  return new RegExp(String.raw`(?<![\p{L}\p{N}_])${escaped}(?![\p{L}\p{N}_])`, 'u')
}

function compactNormalized(value: string) {
  return normalize(value).replace(/[^\p{L}\p{N}%]+/gu, '')
}

function findEntities(search: string) {
  const compactSearch = compactNormalized(search)
  const entities: StrictQuestionEntity[] = []
  const seen = new Set<string>()

  for (const entity of ENTITY_ALIASES) {
    const matchedAlias = entity.aliases.find((alias) => {
      const normalizedAlias = normalizeLoose(alias)
      if (phrasePattern(normalizedAlias).test(search)) return true
      const compactAlias = compactNormalized(alias)
      return compactAlias.length >= 4 && compactSearch.includes(compactAlias)
    })
    if (!matchedAlias || seen.has(entity.canonicalName)) continue
    seen.add(entity.canonicalName)
    entities.push({
      kind: entity.kind,
      canonicalName: entity.canonicalName,
      matchedAlias,
    })
  }

  return entities
}

function detectSafety(originalQuestion: string, search: string): StrictQuestionSafety {
  if (
    /(?:kart bilg|cvv|cvc|kart numara)/.test(search) ||
    /kredi kart.{0,50}(?:yaz|paylas|gonder|ver|bilgi|numara|odeme al|buraya)/.test(search) ||
    /(?:yazsam|paylassam|versem).{0,50}kredi kart/.test(search)
  ) {
    return 'payment_card'
  }
  if (/(?:osym sifre|e devlet sifre|sifremi|parolami|password|login)/.test(search)) {
    return 'credential_request'
  }
  if (/(?:tc kimlik|tc kimlig|tckn|kimlik numaram|pasaport numaram)/.test(search)) {
    return 'sensitive_personal_data'
  }
  if (
    /(?:sahte belge|torpil|tanidik|kopya cek|hile|kontenjan dolsa da beni al)/.test(search) ||
    /(?:kayit|ucret|odeme).{0,60}pazarlik|pazarlik.{0,60}(?:kayit|ucret|odeme)/.test(search)
  ) {
    return 'fraud_or_bypass'
  }
  if (/(?:kufur|küfür)/i.test(originalQuestion)) return 'abusive'
  return 'none'
}

function pushIntent(intents: StrictQuestionIntent[], intent: StrictQuestionIntent) {
  if (!intents.includes(intent)) intents.push(intent)
}

function detectIntents(search: string, safety: StrictQuestionSafety) {
  const intents: StrictQuestionIntent[] = []

  if (
    /(?:kac para|kac tl|ne kadar|ucret(?:i|ler|leri)?\b|fiyat(?:i|lar|lari)?\b|maliyet|tutar)/.test(
      search
    )
  ) {
    pushIntent(intents, 'price')
  }
  if (/(?:kontenjan|kac kisi|kac ogrenci)/.test(search)) pushIntent(intents, 'quota')
  if (/(?:servis|ulasim servisi|kampus servisi|hastane servisi)/.test(search)) {
    pushIntent(intents, 'transport')
  }
  if (
    /(?:var mi|varmi|var m[ıi]|mevcut mu|bulunuyor mu)/.test(search) ||
    /(?:hangi\s+(?:fakulte|fakulteler|bolum|bolumler|program|programlar).{0,50}\bvar\b)/.test(
      search
    )
  ) {
    pushIntent(intents, 'existence')
  }
  if (
    /(?:hangi fakulte|hangi fakulteler|fakulteler|hangi bolum|hangi bolumler|hangi program|hangi programlar|bolumleri|programlari|bolumlere kayit|programlara kayit|kayit olabilecegim bolum|kayit olabilecegim program|listeler|listele|neler var)/.test(
      search
    )
  ) {
    pushIntent(intents, 'listing')
  }
  if (/(?:nerede|nerde|adres|kampus|kampusu|yerleske|ulasim|nasil gid)/.test(search)) {
    pushIntent(intents, 'location')
  }
  if (/(?:odeme|pesin|taksit|kredi kart|iban|online ode|kripto|pazarlik)/.test(search)) {
    pushIntent(intents, 'payment')
  }
  if (/(?:burs|indirim|tercih bursu|kardes indirimi|yks ustun basari)/.test(search)) {
    pushIntent(intents, 'scholarship')
  }
  if (safety !== 'none') pushIntent(intents, 'safety')
  if (
    /(?:bugun hava|\bhava nasil|\btarif(?:i|ler)?\b|\bnasil yapilir\b|\bmenemen\b|\bmakarna\b|\bkahve\b|\bdiyet listesi\b|\bvergi nasil|\bvergi odeme|\bdolar\b|\beuro\b|\bkripto\b|ankara.*kira fiyat|kira fiyatlari|kiralar ne kadar|burcuma gore|fali|sevgilimden ayrildim|sevgili|tyt matematik|matematik calistir|ders calistir|soru coz|konu anlatim|test coz|chatgpt|gercek insan|ogrenci misin|sen kimsin|yapay zeka misin|ai misin|asistan misin)/.test(
      search
    )
  ) {
    pushIntent(intents, 'off_topic')
  }

  return intents.length > 0 ? intents : (['unknown'] satisfies StrictQuestionIntent[])
}

function hasTerminalPunctuation(value: string) {
  return /[?!.]$/.test(value.trim())
}

function withQuestionMark(value: string) {
  return hasTerminalPunctuation(value) ? value.trim() : `${value.trim()}?`
}

function normalizeQuestionText(question: string, entities: StrictQuestionEntity[], search: string) {
  const entity = entities[0]
  const asksPrice =
    /(?:kac para|kac tl|ne kadar|ucret(?:i|ler|leri)?\b|fiyat(?:i|lar|lari)?\b|maliyet|tutar)/.test(
      search
    )
  const asksExistence = /(?:var mi|varmi|var m[ıi]|mevcut mu|bulunuyor mu)/.test(search)
  const asksListing =
    /(?:bolumleri|programlari|fakulteler|hangi fakulte|hangi bolum|hangi program|listeler|listele)/.test(
      search
    )
  const asksDiscountedVariant = /(?:% ?50|yuzde ?50|indirimli)/.test(search)

  if (entity) {
    if (asksPrice) {
      if (entity.canonicalName === 'Tıp Fakültesi' && /(?:ingilizce|english)/.test(search)) {
        return 'İngilizce Tıp ücreti ne kadar?'
      }
      if (entity.canonicalName === 'Tıp Fakültesi' && /(?:turkce|türkçe|turkish)/.test(search)) {
        return 'Türkçe Tıp ücreti ne kadar?'
      }
      return `${entity.canonicalName} ücreti ne kadar?`
    }
    if (asksExistence && asksDiscountedVariant) {
      return `${entity.canonicalName} %50 indirimli program var mı?`
    }
    if (asksExistence) return `${entity.canonicalName} var mı?`
    if (asksListing) return `${entity.canonicalName} bölümleri`
  }

  if (/(?:servis)/.test(search) && asksExistence) return 'ulaşım servisi var mı?'

  return withQuestionMark(
    question
      .replace(/\bvarm[ıi]\b/giu, 'var mı')
      .replace(/\bkac\s*tl\b/giu, 'ücreti ne kadar')
      .replace(/\bkaç\s*tl\b/giu, 'ücreti ne kadar')
      .replace(/\s+/g, ' ')
  )
}

export function normalizeStrictQuestionSearch(value: string) {
  return normalizeLoose(value)
    .replace(/\bvarmi\b/g, 'var mi')
    .replace(/\bkactl\b/g, 'kac tl')
}

export function understandStrictQuestion(question: string): StrictQuestionUnderstanding {
  const normalizedSearch = normalizeStrictQuestionSearch(question)
  const entities = findEntities(normalizedSearch)
  const safety = detectSafety(question, normalizedSearch)
  const intents = detectIntents(normalizedSearch, safety)

  return {
    originalQuestion: question,
    normalizedQuestion: normalizeQuestionText(question, entities, normalizedSearch),
    normalizedSearch,
    intents,
    entities,
    safety,
  }
}
