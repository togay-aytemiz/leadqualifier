import { findUnsupportedCatalogUnit, resolveStrictCatalogAnswer } from './strict-fact-catalog'
import { buildStrictAnswerContract } from './strict-answer-contract'
import { buildStrictClaimLedger, type StrictClaimLedger } from './strict-claim-ledger'
import type {
  StrictQuestionSafety,
  StrictQuestionUnderstanding,
} from './strict-question-understanding'
import { normalizeStrictQuestionSearch } from './strict-question-understanding'
import type { RagProviderCitation } from './types'

export type StrictAnswerCriticAction = 'pass' | 'repair' | 'clarify' | 'refuse'

export type StrictAnswerCriticReason =
  | 'supported'
  | 'unsafe_sensitive_data'
  | 'catalog_contradiction'
  | 'missed_catalog_fact'
  | 'unsupported_positive_claim'
  | 'unsupported_institutional_claim'
  | 'facet_mismatch'
  | 'insufficient_answer'
  | 'actionable_no_info'
  | 'contextual_no_info'

export type StrictAnswerCriticVerdict = {
  action: StrictAnswerCriticAction
  reason: StrictAnswerCriticReason
  repairedAnswer?: string
  repairedCitations?: RagProviderCitation[]
  refusal?: boolean
}

const SAFE_SENSITIVE_DATA_ANSWER =
  'Buraya TC kimlik numarası, şifre, kredi kartı veya benzeri hassas kişisel/ödeme bilgisi yazmayın. Kayıt ve ödeme işlemleri için üniversitenin resmi başvuru ve ödeme kanallarını kullanın.'

const SAFE_FRAUD_OR_BYPASS_ANSWER =
  'Sahte belge, torpil, kopya veya başka bir usulsüz işlem konusunda yardımcı olamam. Başvuru, kayıt ve ödeme süreçleri için yalnızca üniversitenin resmi kayıt kurallarını ve yetkili kanallarını takip edin.'

const SAFE_ABUSIVE_ANSWER =
  'Bu şekilde yanıt veremem. Üniversite, başvuru, program, ücret, burs veya kayıt süreçleriyle ilgili bir sorunuz varsa yardımcı olabilirim.'

const GENERIC_CONTEXTUAL_NO_INFO_FOLLOWUP =
  'Belgelerde yer alan program, ücret, burs, kontenjan, kampüs veya kayıt başlıklarıyla ilgili daha net bir soru sorarsanız kontrol edebilirim.'

const DIRECT_EVIDENCE_INTENTS = new Set<string>([
  'price',
  'quota',
  'existence',
  'listing',
  'location',
  'transport',
  'payment',
  'scholarship',
] as const)

const DIRECT_EVIDENCE_TOPIC_PATTERN =
  /(?:akredit|basvuru|başvuru|belge|burs|cift anadal|çift anadal|cihaz|devamsizlik|devamsızlık|dgs|diploma|e devlet|e-devlet|etkinlik|hazirlik|hazırlık|hastane|iban|kafe|kampus|kampüs|kantin|kayit|kayıt|klinik|konaklama|kontenjan|kredi kart|kutuphane|kütüphane|laboratuvar|mikroskop|odeme|ödeme|online|otopark|puan|siralama|sıralama|servis|spor salonu|staj|taksit|tarih|ucret|ücret|ulasim|ulaşım|uygulama|wifi|wi fi|yatay gecis|yatay geçiş|yemek|yemekhane|yerleske|yerleşke|yurt)/u

const ASSERTIVE_INSTITUTIONAL_CLAIM_PATTERN =
  /(?:\b(?:evet|var|vardir|vardır|bulunur|bulunuyor|bulunmaktadir|bulunmaktadır|mevcut|mevcuttur|saglanir|sağlanır|saglanmaktadir|sağlanmaktadır|verilir|verilmektedir|yapilir|yapılır|yapiliyor|yapılıyor|yapilmaktadir|yapılmaktadır|basvurulur|başvurulur|basvuru yapilir|başvuru yapılır|zorunlu|ucretli|ücretli|ucretsiz|ücretsiz|gecerlidir|geçerlidir|gecer|geçer|dahil|dahildir|kesilir|kesilmez|online|e-devlet|web sitesi|ayarlanir|ayarlanır|universite ayarlar|üniversite ayarlar)\b)/u

const SPECULATIVE_INSTITUTIONAL_LANGUAGE_PATTERN =
  /(?:\b(?:genellikle|muhtemelen|tahminen|olabilir|olasi|olasilikla|belki|tipik olarak)\b)/u

const DIRECT_EVIDENCE_CLAIM_TERMS: Array<{ pattern: RegExp; terms: string[] }> = [
  { pattern: /\bkdv\b/u, terms: ['kdv'] },
  { pattern: /\bdahil(?:dir)?\b/u, terms: ['dahil'] },
  { pattern: /\bharic(?:tir)?\b/u, terms: ['haric'] },
  { pattern: /\btaksit\b/u, terms: ['taksit'] },
  { pattern: /\bpesin\b/u, terms: ['pesin'] },
  { pattern: /\bkripto\b/u, terms: ['kripto'] },
  { pattern: /\biban\b/u, terms: ['iban'] },
  { pattern: /\bkredi kart\b/u, terms: ['kredi', 'kart'] },
  { pattern: /\bonline\b/u, terms: ['online'] },
  { pattern: /\be[-\s]?devlet\b/u, terms: ['devlet'] },
  { pattern: /\bkesilir\b/u, terms: ['kesilir'] },
  { pattern: /\bkesilmez\b/u, terms: ['kesilmez'] },
  { pattern: /\bgaranti\b/u, terms: ['garanti'] },
  { pattern: /\biade(?:si)?\b/u, terms: ['iade'] },
  { pattern: /\bzorunlu\b/u, terms: ['zorunlu'] },
  { pattern: /\bucretli\b/u, terms: ['ucretli'] },
  { pattern: /\bucretsiz\b/u, terms: ['ucretsiz'] },
  { pattern: /\bmavi diploma\b/u, terms: ['mavi', 'diploma'] },
]

const DIRECT_EVIDENCE_STOPWORDS = new Set([
  'acaba',
  'aday',
  'alan',
  'alabilir',
  'almak',
  'bana',
  'belgelerde',
  'bilgi',
  'bilgisi',
  'bir',
  'bunu',
  'cevap',
  'daha',
  'degil',
  'diye',
  'edinmek',
  'evet',
  'gibi',
  'hakkinda',
  'hangi',
  'icin',
  'ilgili',
  'istiyorum',
  'kadar',
  'konuda',
  'konusunda',
  'miyim',
  'misiniz',
  'mumkun',
  'nasil',
  'nedir',
  'nerede',
  'olabilir',
  'olarak',
  'olur',
  'onayli',
  'program',
  'programi',
  'resmi',
  'soru',
  'universite',
  'universitenin',
  'universitenizde',
  'var',
  'vardir',
  'verebilir',
  'yapiliyor',
])

function citationText(citations: RagProviderCitation[]) {
  return citations
    .map((citation) => [citation.title, citation.url, citation.quote].filter(Boolean).join('\n'))
    .join('\n\n')
}

function containsAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle))
}

function answerLooksLikeNoInfo(answer: string) {
  const normalized = normalizeStrictQuestionSearch(answer)
  return /(?:net|acik|dogrudan).{0,80}(?:bilgi|veri|kaynak).{0,80}(?:bulunmamakta|yok|yer almamakta|belirtilmemis)/.test(
    normalized
  )
}

function humanizeTopic(question: string) {
  return question
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\p{Ll}/u, (match) => match.toLocaleUpperCase('tr-TR'))
}

function contextualNoInfoAnswer(question: string, understanding: StrictQuestionUnderstanding) {
  const search = understanding.normalizedSearch
  const topic = humanizeTopic(question)

  if (/(?:ogrenci isleri|telefon|whatsapp|iletisim|aday ogrenci birimi|kayit ofisi)/.test(search)) {
    return `${topic} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Bu bilgi değişebileceği için üniversitenin resmi iletişim kanallarını veya ilgili birimini kontrol etmek en güvenli yoldur. Özellikle hangi birim, telefon veya başvuru dönemi için bilgi istediğiniz netleşirse resmi kaynakta tekrar kontrol edilmelidir.`
  }

  if (/kripto/.test(search)) {
    return `${topic} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Kripto para ile ödeme kabul edildiğine dair doğrulanmış bilgi yoktur; ödeme için yalnızca üniversitenin resmi ödeme ve kayıt kanalları kontrol edilmelidir. Geçerli ödeme yöntemi, kayıt dönemi ve resmi ödeme ekranında ayrıca doğrulanmalıdır.`
  }

  if (/(?:iban|odeme|taksit|kredi kart|online ode)/.test(search)) {
    return `${topic} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Ödeme ve kayıt işlemleri için yalnızca üniversitenin resmi ödeme ve kayıt kanallarını kullanın; kart veya kişisel bilgilerinizi bu sohbet içinde paylaşmayın. Geçerli yöntem, taksit/IBAN bilgisi ve ödeme takvimi resmi kayıt ekranı veya kayıt birimi tarafından doğrulanmalıdır.`
  }

  if (
    /(?:burs|indirim|tercih burs|basari burs|kardes indirimi|sporcu burs|sosyal destek)/.test(
      search
    )
  ) {
    return `${topic} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Burs ve indirim koşulları dönemsel değişebileceği için üniversitenin resmi burs/kayıt duyuruları veya ilgili birimi kontrol edilmelidir. Karar için burs türü, yerleşme sırası, program türü ve ilgili akademik yıl birlikte doğrulanmalıdır.`
  }

  if (/(?:ucret|fiyat|kac para|kac tl|kdv|pesin)/.test(search)) {
    return `${topic} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Ücret ve ödeme koşulları dönemsel değişebileceği için üniversitenin resmi ücret/kayıt duyuruları veya ilgili birimi kontrol edilmelidir. Karar için akademik yıl, program, burs/indirim durumu ve KDV/ödeme koşulu aynı resmi kaynakta birlikte doğrulanmalıdır.`
  }

  if (/(?:rakip|kotu yorum|eksileri|en kotu|kiyas)/.test(search)) {
    return `${topic} hakkında onaylı kaynaklarda net ve doğrulanmış bilgi bulunmamaktadır. Yanıltıcı kıyaslama veya doğrulanmamış yorum aktarmak yerine, Yüksek İhtisas Üniversitesi'nin onaylı program, ücret, burs, kontenjan ve kampüs bilgileri üzerinden yardımcı olabilirim.`
  }

  if (
    understanding.intents.includes('off_topic') ||
    /(?:chatgpt|gercek insan|ogrenci misin|sevgili|burc|fal|kahve|hava)/.test(search)
  ) {
    return `${topic} konusunda yardımcı olamam. Yüksek İhtisas Üniversitesi'nin programları, ücretleri, bursları, kontenjanları, kampüsleri veya kayıt süreciyle ilgili sorularınızı yanıtlayabilirim. Örneğin belirli bir program, ücret, kontenjan, kampüs ya da kayıt adımı sorabilirsiniz.`
  }

  if (
    /(?:servis|ulasim|kampus|yerleske|yemek|kantin|kafe|wifi|wi fi|otopark|kutuphane|laboratuvar|mikroskop|kadavra|maket)/.test(
      search
    )
  ) {
    return `${topic} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Bu tür kampüs, ulaşım ve imkan bilgileri değişebileceği için üniversitenin güncel resmi duyuruları veya ilgili birimi kontrol edilmelidir. Karar için ilgili yerleşke, dönem ve hizmetin güncel saat/kapasite/başvuru koşulu birlikte doğrulanmalıdır.`
  }

  if (
    /(?:staj|uygulama|hastane|afiliye|klinik|hasta basi|muayene|vaka|servis|ameliyathane|dogumhane|yogun bakim)/.test(
      search
    )
  ) {
    return `${topic} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Klinik uygulama ve staj ayrıntıları bölüm ve dönem bazında değişebileceği için ilgili programın akademik birimi veya resmi duyuruları kontrol edilmelidir. Karar için hangi sınıf/dönem, hangi program ve uygulamanın hastane, laboratuvar ya da saha uygulaması olup olmadığı birlikte doğrulanmalıdır.`
  }

  if (/(?:kayit|belge|e devlet|e-devlet|randevu|basvuru|tarih|saat)/.test(search)) {
    return `${topic} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Kayıt ve başvuru ayrıntıları dönemsel değişebileceği için üniversitenin resmi kayıt duyuruları veya kayıt birimi kontrol edilmelidir. Karar için aday türü, kayıt dönemi, istenen belge ve başvuru kanalı birlikte doğrulanmalıdır.`
  }

  if (/(?:akredit|diploma|denklik|yok|yurtdisi|kpss|atan|is bul|is garantisi)/.test(search)) {
    return `${topic} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Akreditasyon, denklik, atama veya mesleki sonuçlar ülke, kurum ve ilgili mevzuata bağlıdır; akreditasyon bulunmaması tek başına diplomanın geçersiz olduğu anlamına gelmez. Karar için YÖK, ilgili meslek otoritesi ve güncel program duyuruları birlikte kontrol edilmelidir.`
  }

  return `${topic} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. ${GENERIC_CONTEXTUAL_NO_INFO_FOLLOWUP}`
}

function actionableNoInfoReason(answer: string) {
  const normalized = normalizeStrictQuestionSearch(answer)
  return /(?:karar icin|birlikte dogrulanmalidir|resmi kayit duyurulari|resmi odeme|resmi ucret|resmi burs|resmi iletisim|akademik birimi|ilgili birimi|yok|meslek otoritesi)/.test(
    normalized
  )
    ? 'actionable_no_info'
    : 'contextual_no_info'
}

function answerLooksPositive(answer: string) {
  const normalized = normalizeStrictQuestionSearch(answer)
  if (
    /(?:yoktur|yok|bulunmamaktadir|listelenmemektedir|yer almamaktadir|belirtilmemistir)/.test(
      normalized
    )
  ) {
    return false
  }
  return /(?:^|\s)(?:evet|var|vardir|bulunmaktadir|mevcuttur|listelenmektedir)(?:\s|[.!?]|$)/.test(
    normalized
  )
}

function answerLooksUnsafeForSensitiveData(answer: string) {
  const normalized = normalizeStrictQuestionSearch(answer)
  if (
    containsAny(normalized, [
      'yazmayin',
      'paylasmayin',
      'gondermeyin',
      'resmi kanal',
      'resmi basvuru',
      'resmi odeme',
      'hassas',
    ])
  ) {
    return false
  }
  return containsAny(normalized, [
    'buraya yazabilirsiniz',
    'buraya yaz',
    'paylasabilirsiniz',
    'gonderebilirsiniz',
    'sifrenizi yaz',
    'kart bilgilerinizi yaz',
    'tc kimlik numaranizi yaz',
  ])
}

function supportedByCitation(question: string, answer: string, citations: RagProviderCitation[]) {
  if (citations.length === 0) return false
  const support = normalizeStrictQuestionSearch(citationText(citations))
  const normalizedQuestion = normalizeStrictQuestionSearch(question)
  const normalizedAnswer = normalizeStrictQuestionSearch(answer)

  const questionTerms = normalizedQuestion
    .split(/\s+/)
    .filter(
      (term) => term.length >= 4 && !['fakulteniz', 'bolumunuz', 'programiniz'].includes(term)
    )
  const answerTerms = normalizedAnswer
    .split(/\s+/)
    .filter(
      (term) => term.length >= 4 && !['vardir', 'bulunmaktadir', 'listelenmektedir'].includes(term)
    )
  const importantTerms = Array.from(new Set([...questionTerms, ...answerTerms])).slice(0, 8)
  if (importantTerms.length === 0) return true

  return importantTerms.some((term) => support.includes(term))
}

function tokenizeForDirectEvidence(value: string) {
  return (
    normalizeStrictQuestionSearch(value)
      .match(/[\p{L}\p{N}%]+/gu)
      ?.filter((term) => term.length >= 4 && !DIRECT_EVIDENCE_STOPWORDS.has(term)) ?? []
  )
}

function termLooksSupported(term: string, support: string) {
  if (support.includes(term)) return true
  if (term.length < 6) return false
  const stem = term.slice(0, 6)
  return support.includes(stem)
}

function hasAnySupportedTerm(terms: string[], support: string) {
  return terms.length === 0 || terms.some((term) => termLooksSupported(term, support))
}

function extractRequiredClaimTerms(question: string, answer: string) {
  const combined = normalizeStrictQuestionSearch(`${question}\n${answer}`)
  const terms = DIRECT_EVIDENCE_CLAIM_TERMS.flatMap((claim) =>
    claim.pattern.test(combined) ? claim.terms : []
  )
  return Array.from(new Set(terms))
}

function answerAssertsInstitutionalClaim(answer: string) {
  const normalized = normalizeStrictQuestionSearch(answer)
  if (answerLooksLikeNoInfo(answer)) return false
  if (
    /(?:kontrol edin|kontrol edilmelidir|resmi kanallar|ilgili birim|net bilgi bulunmamaktadir|belirtilmemistir|yer almamaktadir)/.test(
      normalized
    )
  ) {
    return false
  }
  return ASSERTIVE_INSTITUTIONAL_CLAIM_PATTERN.test(normalized)
}

function answerHasSpeculativeInstitutionalLanguage(answer: string) {
  return SPECULATIVE_INSTITUTIONAL_LANGUAGE_PATTERN.test(normalizeStrictQuestionSearch(answer))
}

function questionRequiresDirectEvidence(understanding: StrictQuestionUnderstanding) {
  if (understanding.intents.some((intent) => DIRECT_EVIDENCE_INTENTS.has(intent))) return true
  return DIRECT_EVIDENCE_TOPIC_PATTERN.test(understanding.normalizedSearch)
}

function directEvidenceSupportsInstitutionalClaim(input: {
  question: string
  answer: string
  citations: RagProviderCitation[]
}) {
  if (input.citations.length === 0) return false
  const support = normalizeStrictQuestionSearch(citationText(input.citations))
  const questionTerms = tokenizeForDirectEvidence(input.question)
  const answerTerms = tokenizeForDirectEvidence(input.answer)
  const requiredClaimTerms = extractRequiredClaimTerms(input.question, input.answer)

  if (
    requiredClaimTerms.length > 0 &&
    !requiredClaimTerms.every((term) => termLooksSupported(term, support))
  ) {
    return false
  }

  return hasAnySupportedTerm(questionTerms, support) && hasAnySupportedTerm(answerTerms, support)
}

export function evaluateStrictAnswer(input: {
  question: string
  understanding: StrictQuestionUnderstanding
  answer: string
  citations: RagProviderCitation[]
  claimLedger?: StrictClaimLedger
}): StrictAnswerCriticVerdict {
  if (
    input.understanding.safety !== 'none' &&
    (answerLooksUnsafeForSensitiveData(input.answer) ||
      input.understanding.intents.includes('safety'))
  ) {
    return {
      action: 'repair',
      reason: 'unsafe_sensitive_data',
      repairedAnswer: strictSafetyAnswer(input.understanding.safety),
      repairedCitations: [],
      refusal: true,
    }
  }

  const catalogAnswer = resolveStrictCatalogAnswer({
    question: input.question,
    understanding: input.understanding,
  })
  if (catalogAnswer) {
    if (
      catalogAnswer.reason === 'catalog_unsupported_existence' &&
      answerLooksPositive(input.answer)
    ) {
      return {
        action: 'repair',
        reason: 'catalog_contradiction',
        repairedAnswer: catalogAnswer.answer,
        repairedCitations: catalogAnswer.citations,
        refusal: catalogAnswer.refusal,
      }
    }

    if (answerLooksLikeNoInfo(input.answer)) {
      return {
        action: 'repair',
        reason: catalogAnswer.refusal ? 'actionable_no_info' : 'missed_catalog_fact',
        repairedAnswer: catalogAnswer.answer,
        repairedCitations: catalogAnswer.citations,
        refusal: catalogAnswer.refusal,
      }
    }
  }

  const unsupportedUnit = findUnsupportedCatalogUnit(input.question)
  if (unsupportedUnit && answerLooksPositive(input.answer)) {
    const repaired = resolveStrictCatalogAnswer({
      question: input.question,
      understanding: input.understanding,
    })
    return {
      action: 'repair',
      reason: 'catalog_contradiction',
      repairedAnswer:
        repaired?.answer ??
        `Onaylı kaynaklarda ${unsupportedUnit.name} listelenmemektedir; bu konuda var bilgisi veremem.`,
      repairedCitations: repaired?.citations ?? [],
      refusal: true,
    }
  }

  if (
    input.understanding.intents.includes('existence') &&
    answerLooksPositive(input.answer) &&
    !supportedByCitation(input.question, input.answer, input.citations)
  ) {
    return {
      action: 'repair',
      reason: 'unsupported_positive_claim',
      repairedAnswer: contextualNoInfoAnswer(input.question, input.understanding),
      repairedCitations: [],
      refusal: true,
    }
  }

  const claimLedger =
    input.claimLedger ??
    buildStrictClaimLedger({
      question: input.question,
      understanding: input.understanding,
      answer: input.answer,
      citations: input.citations,
    })

  if (
    questionRequiresDirectEvidence(input.understanding) &&
    answerHasSpeculativeInstitutionalLanguage(input.answer)
  ) {
    return {
      action: 'repair',
      reason: 'unsupported_institutional_claim',
      repairedAnswer: contextualNoInfoAnswer(input.question, input.understanding),
      repairedCitations: [],
      refusal: true,
    }
  }

  if (
    questionRequiresDirectEvidence(input.understanding) &&
    answerAssertsInstitutionalClaim(input.answer) &&
    (claimLedger.unsupportedClaims.length > 0 ||
      !directEvidenceSupportsInstitutionalClaim({
        question: input.question,
        answer: input.answer,
        citations: input.citations,
      }))
  ) {
    return {
      action: 'repair',
      reason: 'unsupported_institutional_claim',
      repairedAnswer: contextualNoInfoAnswer(input.question, input.understanding),
      repairedCitations: [],
      refusal: true,
    }
  }

  const answerContract = buildStrictAnswerContract({
    question: input.question,
    understanding: input.understanding,
    answer: input.answer,
    citations: input.citations,
  })

  if (answerAssertsInstitutionalClaim(input.answer) && answerContract.mismatchedFacets.length > 0) {
    return {
      action: 'repair',
      reason: 'facet_mismatch',
      repairedAnswer: contextualNoInfoAnswer(input.question, input.understanding),
      repairedCitations: [],
      refusal: true,
    }
  }

  if (!input.answer.trim()) {
    return {
      action: 'refuse',
      reason: 'insufficient_answer',
      repairedAnswer: 'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.',
      repairedCitations: [],
      refusal: true,
    }
  }

  if (answerLooksLikeNoInfo(input.answer)) {
    const repairedAnswer = contextualNoInfoAnswer(input.question, input.understanding)
    return {
      action: 'repair',
      reason: actionableNoInfoReason(repairedAnswer),
      repairedAnswer,
      repairedCitations: [],
      refusal: true,
    }
  }

  return {
    action: 'pass',
    reason: 'supported',
  }
}

export function strictSafetyAnswer(safety: StrictQuestionSafety) {
  if (safety === 'fraud_or_bypass') return SAFE_FRAUD_OR_BYPASS_ANSWER
  if (safety === 'abusive') return SAFE_ABUSIVE_ANSWER
  return SAFE_SENSITIVE_DATA_ANSWER
}

export function strictSensitiveDataAnswer() {
  return strictSafetyAnswer('sensitive_personal_data')
}
