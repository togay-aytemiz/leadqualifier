import type { BrochureQueryPlan } from './brochure-query-plan'
import type { RagProviderCitation } from './types'

type ValidatedFollowupInput = {
  question: string
  answer: string
  plan: BrochureQueryPlan
  citations: RagProviderCitation[]
  refusal: boolean
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

function normalize(value: string) {
  return value
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function citationText(citations: RagProviderCitation[]) {
  return citations.map((citation) => citation.quote ?? '').join('\n')
}

function shouldSuppress(question: string, refusal: boolean) {
  if (refusal) return true
  const normalized = normalize(question)
  return (
    /(?:sadece|yalnizca).{0,30}(?:kaynak|link)/.test(normalized) ||
    /(?:kaynak|link).{0,30}(?:paylas|gonder)/.test(normalized) ||
    /(?:baska bir sey istemiyorum|devam etme|sorma|yeter|istemiyorum)/.test(normalized)
  )
}

function tableFollowup(input: ValidatedFollowupInput, support: string) {
  const program = input.plan.program
  if (!program) return ''
  const normalizedSupport = normalize(support)
  if (
    normalizedSupport.includes(normalize(program)) &&
    normalizedSupport.includes('burslu') &&
    normalizedSupport.includes('%50')
  ) {
    return `İsterseniz ${program} için burslu ve %50 indirimli seçenekleri de karşılaştırabilirim.`
  }
  return ''
}

function scholarshipFollowup(question: string, support: string) {
  const normalizedQuestion = normalize(question)
  const normalizedSupport = normalize(support)
  if (
    normalizedQuestion.includes('tercih burs') &&
    normalizedSupport.includes('akademik basari burs')
  ) {
    return 'Akademik başarı bursunun koşullarını da incelememi ister misiniz?'
  }
  if (
    normalizedQuestion.includes('akademik basari burs') &&
    normalizedSupport.includes('tercih burs')
  ) {
    return 'Tercih bursunun oranlarını da incelememi ister misiniz?'
  }
  return ''
}

function campusFollowup(question: string, support: string) {
  const normalizedQuestion = normalize(question)
  if (!/(?:hangi yerleske|nerede|kampus)/.test(normalizedQuestion)) return ''
  if (!/(?:mahalle|cadde|bulvari|sokak|no:)/i.test(normalize(support))) return ''
  const campus = support.match(/([A-ZÇĞİÖŞÜ][\p{L}\s.-]{1,50}? Yerleşkesi)/u)?.[1]?.trim()
  return campus ? `${campus}nin açık adresini de paylaşmamı ister misiniz?` : ''
}

function genericFollowup(input: ValidatedFollowupInput, support: string) {
  if (!support.trim()) return ''
  const normalizedQuestion = normalize(input.question)

  if (input.plan.intent === 'document_router') {
    return 'İsterseniz bu yönergedeki ilgili şartları da kaynaklardan özetleyebilirim.'
  }
  if (/(?:bidb|yonerge|yonetmelik|mevzuat)/.test(normalizedQuestion)) {
    return 'İsterseniz bu yönergedeki ilgili şartları da kaynaklardan özetleyebilirim.'
  }
  if (input.plan.intent === 'website_admissions') {
    return 'İsterseniz ilgilendiğiniz program grubunun kontenjan ve ücret bilgilerine de birlikte bakabiliriz.'
  }
  if (input.plan.intent === 'website_contact') {
    return 'İsterseniz ilgili yerleşkenin programlarını da kaynaklardan kontrol edebilirim.'
  }
  if (
    input.plan.intent === 'general_approved_corpus' &&
    /(?:bilgi paketi|program|fakulte|yuksekokul)/.test(normalizedQuestion)
  ) {
    return 'İsterseniz bu programlardan birinin eğitim süresi veya mezuniyet olanaklarını da kaynaklardan kontrol edebilirim.'
  }
  if (/(?:yurt|konaklama)/.test(normalizedQuestion)) {
    return 'İsterseniz konaklama dışında başka öğrenci yaşamı bağlantılarını da kontrol edebilirim.'
  }
  if (/(?:kurucu|vakif|tarihce|tivak|gecmis)/.test(normalizedQuestion)) {
    return 'Bu tarihçeyle bağlantılı başka bir başlığı da kaynaklardan özetleyebilirim.'
  }
  if (/(?:burs|indirim)/.test(normalizedQuestion)) {
    return 'İsterseniz başka burs ve indirim başlıklarını da kaynaklardan karşılaştırabilirim.'
  }
  if (/(?:telefon|e-posta|eposta|email|adres|iletisim)/.test(normalizedQuestion)) {
    return 'İsterseniz başka bir birimin iletişim bilgisini de kaynaklardan kontrol edebilirim.'
  }

  return 'İsterseniz bu başlıkla ilgili başka bir ayrıntıyı da kaynaklardan kontrol edebilirim.'
}

export function buildValidatedFollowup(input: ValidatedFollowupInput) {
  if (shouldSuppress(input.question, input.refusal)) return ''
  const support = citationText(input.citations)
  if (!support.trim()) return ''

  if (input.plan.intent === 'brochure_table_fact') {
    return tableFollowup(input, support) || genericFollowup(input, support)
  }
  if (input.plan.intent === 'brochure_scholarship') {
    return scholarshipFollowup(input.question, support) || genericFollowup(input, support)
  }
  if (input.plan.intent === 'brochure_campus_contact') {
    return campusFollowup(input.question, support) || genericFollowup(input, support)
  }
  return genericFollowup(input, support)
}
