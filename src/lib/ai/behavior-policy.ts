export type BehaviorPolicySourcePriority =
  | 'brochure'
  | 'website_html'
  | 'approved_pdf'
  | 'structured_catalog'
  | 'official_channel'
  | 'knowledge_base'

export type BehaviorPolicyEvidenceRequirement =
  | 'pricing'
  | 'discounts'
  | 'quotas'
  | 'dates'
  | 'payments'
  | 'programs'
  | 'locations'
  | 'contacts'
  | 'credentials'
  | 'clinical_training'
  | 'availability'
  | 'legal_policy'

export type BehaviorPolicyRefusalClass =
  | 'sensitive_personal_data'
  | 'payment_collection'
  | 'credential_request'
  | 'fraud_or_bypass'
  | 'prompt_extraction'
  | 'abusive'
  | 'impossible_request'
  | 'off_scope'

export type BehaviorPolicyTone =
  | 'warm'
  | 'professional'
  | 'concise'
  | 'student_friendly'
  | 'formal'
  | 'casual'
  | 'emoji'
  | 'gen_z'

export type BehaviorPolicy = {
  businessScopeHints: string[]
  outOfScopeHints: string[]
  evidenceRequiredFor: BehaviorPolicyEvidenceRequirement[]
  sourcePriority: BehaviorPolicySourcePriority[]
  refusalClasses: BehaviorPolicyRefusalClass[]
  tone: BehaviorPolicyTone[]
  botName?: string
}

type BehaviorPolicySettings = {
  bot_name?: string | null
  prompt?: string | null
} | null | undefined

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

function normalizePolicyText(value: string) {
  return value
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function unique<T extends string>(values: T[]) {
  return Array.from(new Set(values))
}

function addIf<T extends string>(values: T[], condition: boolean, value: T) {
  if (condition) values.push(value)
}

function sourcePriorityFromPrompt(normalized: string): BehaviorPolicySourcePriority[] {
  const candidates: Array<{
    value: BehaviorPolicySourcePriority
    index: number
  }> = []

  const patterns: Array<{ value: BehaviorPolicySourcePriority; pattern: RegExp }> = [
    { value: 'brochure', pattern: /(?:brosur|broşur|tanitim brosuru|campaign material)/ },
    { value: 'website_html', pattern: /(?:website html|web sitesi html|web sitesi|website|html)/ },
    { value: 'approved_pdf', pattern: /(?:approved pdf|onayli pdf|pdf|yonerge|dokuman|belge)/ },
    { value: 'structured_catalog', pattern: /(?:structured catalog|fact catalog|katalog|tablo|catalog)/ },
    { value: 'official_channel', pattern: /(?:resmi kanal|official channel|yetkili kanal|resmi birim)/ },
    { value: 'knowledge_base', pattern: /(?:bilgi bankasi|knowledge base|kb)/ },
  ]

  for (const item of patterns) {
    const match = normalized.match(item.pattern)
    if (match?.index !== undefined) candidates.push({ value: item.value, index: match.index })
  }

  return unique(candidates.sort((left, right) => left.index - right.index).map((item) => item.value))
}

function evidenceRequirementsFromPrompt(normalized: string): BehaviorPolicyEvidenceRequirement[] {
  const values: BehaviorPolicyEvidenceRequirement[] = []

  addIf(values, /(?:ucret|fiyat|kac para|kac tl|tutar|pricing|price)/.test(normalized), 'pricing')
  addIf(values, /(?:burs|indirim|discount|scholarship)/.test(normalized), 'discounts')
  addIf(values, /(?:kontenjan|quota)/.test(normalized), 'quotas')
  addIf(values, /(?:tarih|deadline|gun|saat|takvim|date)/.test(normalized), 'dates')
  addIf(values, /(?:odeme|iban|taksit|kdv|kredi kart|payment|card)/.test(normalized), 'payments')
  addIf(values, /(?:program|bolum|fakulte|myo|hizmet|service)/.test(normalized), 'programs')
  addIf(values, /(?:kampus|yerleske|adres|ulasim|yurt|konaklama|location|campus)/.test(normalized), 'locations')
  addIf(values, /(?:iletisim|telefon|whatsapp|mail|e-?posta|email|contact)/.test(normalized), 'contacts')
  addIf(values, /(?:akredit|denklik|diploma|taninma|yok|credential|recognition)/.test(normalized), 'credentials')
  addIf(values, /(?:staj|klinik|hastane|laboratuvar|uygulama|clinical|internship|lab)/.test(normalized), 'clinical_training')
  addIf(values, /(?:musait|availability|randevu|kontrol et)/.test(normalized), 'availability')
  addIf(values, /(?:politika|kosul|kural|yonetmelik|yonerge|legal|policy)/.test(normalized), 'legal_policy')

  return unique(values)
}

function refusalClassesFromPrompt(normalized: string): BehaviorPolicyRefusalClass[] {
  const values: BehaviorPolicyRefusalClass[] = []

  addIf(values, /(?:tc kimlik|kisisel veri|ogrenci verisi|sifre|private|personal data)/.test(normalized), 'sensitive_personal_data')
  addIf(values, /(?:kredi kart|odeme alma|payment collection|kart bilg)/.test(normalized), 'payment_collection')
  addIf(values, /(?:osym sifre|şifre|credential|parola)/.test(normalized), 'credential_request')
  addIf(values, /(?:sahte belge|torpil|kopya|fraud|bypass|usulsuz)/.test(normalized), 'fraud_or_bypass')
  addIf(values, /(?:prompt|gizli talimat|sistem talimat|system instruction)/.test(normalized), 'prompt_extraction')
  addIf(values, /(?:kufur|abusive|hakaret)/.test(normalized), 'abusive')
  addIf(values, /(?:imkansiz|impossible|garanti ver|kesin kazan)/.test(normalized), 'impossible_request')
  addIf(values, /(?:kapsam disi|out of scope|konu disi)/.test(normalized), 'off_scope')

  return unique(values)
}

function outOfScopeHintsFromPrompt(normalized: string) {
  const values: string[] = []

  addIf(values, /(?:hava durumu|\bhava\b|weather)/.test(normalized), 'weather')
  addIf(values, /(?:yemek tarifi|tarif|makarna|menemen|kahve|recipe)/.test(normalized), 'recipes')
  addIf(values, /(?:astroloji|burc|fal|astrology)/.test(normalized), 'astrology')
  addIf(values, /(?:iliski tavsiyesi|sevgili|relationship)/.test(normalized), 'relationship_advice')
  addIf(values, /(?:piyasa|kira|dolar|euro|kripto|market)/.test(normalized), 'market_data')
  addIf(values, /(?:ders calistir|matematik|tutoring)/.test(normalized), 'tutoring')
  addIf(values, /(?:rakip|kotu yorum|kiyas|competitor)/.test(normalized), 'competitor_reputation')

  return unique(values)
}

function businessScopeHintsFromPrompt(normalized: string) {
  const values: string[] = []

  addIf(values, /(?:aday|basvuru|kayit|admission|tanitim)/.test(normalized), 'admissions')
  addIf(values, /(?:program|bolum|fakulte|myo|service|hizmet)/.test(normalized), 'programs')
  addIf(values, /(?:ucret|fiyat|pricing|price)/.test(normalized), 'pricing')
  addIf(values, /(?:kampus|yerleske|ulasim|yurt|campus)/.test(normalized), 'campus')
  addIf(values, /(?:staj|klinik|laboratuvar|hastane)/.test(normalized), 'clinical')
  addIf(values, /(?:burs|indirim)/.test(normalized), 'scholarships')
  addIf(values, /(?:iletisim|telefon|contact)/.test(normalized), 'contact')

  return unique(values)
}

function toneFromPrompt(normalized: string): BehaviorPolicyTone[] {
  const values: BehaviorPolicyTone[] = []

  addIf(values, /(?:sicak|sıcak|warm|samimi)/.test(normalized), 'warm')
  addIf(values, /(?:profesyonel|professional)/.test(normalized), 'professional')
  addIf(values, /(?:kisa|net|concise|short)/.test(normalized), 'concise')
  addIf(values, /(?:aday ogrenci|ogrenci dostu|student)/.test(normalized), 'student_friendly')
  addIf(values, /(?:resmi|formal)/.test(normalized), 'formal')
  addIf(values, /(?:rahat|casual)/.test(normalized), 'casual')
  addIf(values, /(?:emoji)/.test(normalized), 'emoji')
  addIf(values, /(?:gen-?z|z kusagi)/.test(normalized), 'gen_z')

  return unique(values)
}

export function compileBehaviorPolicyFromSettings(settings: BehaviorPolicySettings): BehaviorPolicy {
  const prompt = settings?.prompt?.trim() ?? ''
  const normalized = normalizePolicyText(prompt)
  const policy: BehaviorPolicy = {
    businessScopeHints: businessScopeHintsFromPrompt(normalized),
    outOfScopeHints: outOfScopeHintsFromPrompt(normalized),
    evidenceRequiredFor: evidenceRequirementsFromPrompt(normalized),
    sourcePriority: sourcePriorityFromPrompt(normalized),
    refusalClasses: refusalClassesFromPrompt(normalized),
    tone: toneFromPrompt(normalized),
    ...(settings?.bot_name?.trim() ? { botName: settings.bot_name.trim() } : {}),
  }

  return {
    ...policy,
    evidenceRequiredFor: unique([
      'pricing',
      'payments',
      'dates',
      'contacts',
      ...policy.evidenceRequiredFor,
    ]),
    refusalClasses: unique([
      'sensitive_personal_data',
      'payment_collection',
      'fraud_or_bypass',
      ...policy.refusalClasses,
    ]),
  }
}

export function summarizeBehaviorPolicy(policy: BehaviorPolicy) {
  return {
    businessScopeHints: policy.businessScopeHints,
    outOfScopeHints: policy.outOfScopeHints,
    evidenceRequiredFor: policy.evidenceRequiredFor,
    sourcePriority: policy.sourcePriority,
    refusalClasses: policy.refusalClasses,
    tone: policy.tone,
    ...(policy.botName ? { botName: policy.botName } : {}),
  }
}

export function formatBehaviorPolicyForPrompt(policy: BehaviorPolicy) {
  return JSON.stringify(
    {
      business_scope_hints: policy.businessScopeHints,
      out_of_scope_hints: policy.outOfScopeHints,
      evidence_required_for: policy.evidenceRequiredFor,
      source_priority: policy.sourcePriority,
      refusal_classes: policy.refusalClasses,
      tone: policy.tone,
      bot_name: policy.botName,
    },
    null,
    2
  )
}
