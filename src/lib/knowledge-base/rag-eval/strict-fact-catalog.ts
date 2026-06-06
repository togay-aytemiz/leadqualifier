import type { StrictQuestionEntity, StrictQuestionUnderstanding } from './strict-question-understanding'
import { normalizeStrictQuestionSearch } from './strict-question-understanding'
import { classifyStrictQuestionFacets } from './strict-answer-contract'
import type { RagProviderCitation } from './types'

export type StrictCatalogAnswerReason =
  | 'catalog_supported_existence'
  | 'catalog_unsupported_existence'
  | 'catalog_program_listing'
  | 'catalog_faculty_listing'
  | 'catalog_degree_level_listing'
  | 'catalog_program_distinction_fact'
  | 'catalog_institution_fact'
  | 'catalog_hospital_scope_guard'
  | 'catalog_affiliated_hospital_training_fact'
  | 'catalog_clinical_training_fact'
  | 'catalog_clinical_program_clarification'
  | 'catalog_clinical_program_scope_guard'
  | 'catalog_facility_resource_scope_guard'
  | 'catalog_campus_life_scope_guard'
  | 'catalog_housing_link_fact'
  | 'catalog_housing_scope_guard'
  | 'catalog_credential_scope_guard'
  | 'catalog_registration_scope_guard'
  | 'catalog_professional_authority_scope_guard'
  | 'catalog_candidate_event_scope_guard'
  | 'catalog_reputation_scope_guard'

export type StrictCatalogAnswer = {
  answer: string
  citations: RagProviderCitation[]
  refusal: boolean
  reason: StrictCatalogAnswerReason
}

type AcademicCatalogUnit = {
  name: string
  kind: StrictQuestionEntity['kind']
  aliases: string[]
  programs?: string[]
  note?: string
}

const CATALOG_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:academic-units',
  title: 'YİÜ Tanıtım Broşürü - Program ve Yerleşke Eşleşmeleri',
  quote: 'YİÜ tanıtım broşüründeki fakülte, yüksekokul, program ve yerleşke eşleşmeleri.',
}

const INSTITUTION_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:institution-overview',
  title: 'YİÜ Tanıtım Broşürü - Kurumsal Tanıtım',
  quote:
    'Yüksek İhtisas Üniversitesi, Türkiye Yüksek İhtisas Hastanesi Vakfı tarafından 2013 yılında Ankara’da kurulan bir vakıf üniversitesidir.',
}

const HOSPITAL_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:hospital-training-scope',
  title: 'YİÜ Klinik Eğitim ve Hastane Kapsamı',
  quote:
    'Onaylı kaynaklarda klinik ve staj uygulamaları için Sağlık Uygulama ve Araştırma Merkezi, afiliye/anlaşmalı hastaneler ve Eğitim ve Araştırma Hastanelerinden söz edilir; üniversitenin kendi hastanesi ya da tekil afiliye hastane adı/adresi/statüsü net doğrulanmamaktadır.',
}

const CLINICAL_TRAINING_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:clinical-training-timing',
  title: 'YİÜ Tıp Fakültesi - Klinik Eğitim Dönemleri',
  quote:
    'Tıp Fakültesi klinik eğitimi Dönem IV ve Dönem V stajlarıyla başlar; Dönem VI intörn hekimlik dönemidir.',
}

const CLINICAL_PROGRAM_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:clinical-program-scope',
  title: 'YİÜ Klinik Uygulama ve Staj Kapsamı',
  quote:
    'Programların klinik uygulama ve staj ayrıntıları program bazında değişir; yaz stajı varlığı, zorunluluğu veya süresi net doğrulanmadan program varlığı cevabı olarak verilmemelidir.',
}

const FACILITY_RESOURCE_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:facility-resource-scope',
  title: 'YİÜ Laboratuvar, Cihaz ve Uygulama İmkanları Kapsamı',
  quote:
    'Onaylı kaynaklarda program ve bazı genel uygulama başlıkları yer alabilir; ancak cihaz sayısı, bireysel cihaz kullanımı, simülasyon alanı veya hastane içi birim varlığı doğrulanmadan var cevabı verilmemelidir.',
}

const CAMPUS_LIFE_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:campus-life-scope',
  title: 'YİÜ Kampüs Yaşamı ve Güncel İmkan Bilgileri Kapsamı',
  quote:
    'Kampüs yaşamı, Wi-Fi, kafe/kantin, spor salonu, vejetaryen yemek, güvenlik, otopark, servis saatleri/güzergahları ve kampüs çevresi konaklama gibi güncel imkan bilgileri onaylı aday öğrenci kaynaklarında net doğrulanmadan var cevabı olarak verilmemelidir.',
}

const REGISTRATION_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:registration-scope',
  title: 'YİÜ Aday Öğrenci Kayıt Süreci Kapsamı',
  quote:
    'Aday öğrenci kesin kayıt, online kayıt, randevu, belge ve tarih bilgileri dönem ve başvuru türüne göre değişebilir; onaylı aday öğrenci kaynağında net doğrulanmadan kesin süreç cevabı verilmemelidir.',
}

const PROFESSIONAL_AUTHORITY_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:professional-authority-scope',
  title: 'YİÜ Mezuniyet Sonrası Mesleki Yetki Kapsamı',
  quote:
    'Program mezuniyet çıktıları mesleki yetki, iş yeri açma, araç kullanma veya unvan kullanımı için otomatik garanti olarak verilmemelidir; ilgili mevzuat ve yetkili kurum kuralları belirleyicidir.',
}

const CANDIDATE_EVENT_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:candidate-event-scope',
  title: 'YİÜ Tanıtım Günleri ve Aday Etkinlikleri Kapsamı',
  quote:
    'Tanıtım günü, kampüs gezisi, laboratuvar gezisi ve güncel aday etkinliği bilgileri dönemsel olabilir; güncel resmi duyurularla doğrulanmalıdır.',
}

const REPUTATION_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:reputation-scope',
  title: 'YİÜ Öznel Değerlendirme ve Karşılaştırma Kapsamı',
  quote:
    'Üniversite eksileri, kötü yorumlar, rakip kıyaslaması veya öznel değerlendirme iddiaları onaylı kaynaklarla doğrulanmadan aktarılmamalıdır.',
}

const HOUSING_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:housing-page',
  title: 'YİÜ Yurtlar / Konaklama Bilgilendirme Sayfası',
  url: 'https://yuksekihtisasuniversitesi.edu.tr/sayfa/yurtlar/yurtlar/yurtlar',
  quote:
    'Üniversite kaynaklarında yurtlar/konaklama için resmi bilgilendirme sayfası bağlantısı yer alır.',
}

const CREDENTIAL_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:credential-equivalency-scope',
  title: 'Yurtdışı Diploma Geçerliliği ve Denklik Kapsamı',
  quote:
    'Yurtdışında diploma geçerliliği ve mesleki denklik otomatik garanti olarak verilmemelidir; ülke, kurum ve meslek otoritesi kurallarına bağlıdır.',
}

const FACULTIES: AcademicCatalogUnit[] = [
  {
    name: 'Tıp Fakültesi',
    kind: 'faculty',
    aliases: ['tip', 'tip fakultesi', 'tip fakulteniz', 'turkce tip', 'ingilizce tip'],
    programs: ['Tıp Fakültesi (Türkçe)', 'Tıp Fakültesi (İngilizce)'],
  },
  {
    name: 'Sağlık Bilimleri Fakültesi',
    kind: 'faculty',
    aliases: ['saglik bilimleri fakultesi', 'saglik bilimleri fakultesinde'],
    programs: [
      'Beslenme ve Diyetetik',
      'Dil ve Konuşma Terapisi',
      'Fizyoterapi ve Rehabilitasyon',
      'Hemşirelik',
      'Sağlık Yönetimi',
      'Ergoterapi',
      'Ebelik',
    ],
  },
  {
    name: 'Spor Bilimleri Fakültesi',
    kind: 'faculty',
    aliases: ['spor bilimleri fakultesi'],
    programs: ['Antrenörlük Eğitimi'],
  },
]

const SCHOOLS: AcademicCatalogUnit[] = [
  {
    name: 'Sağlık Hizmetleri Meslek Yüksekokulu',
    kind: 'school',
    aliases: ['shmyo', 'saglik hizmetleri meslek yuksekokulu'],
    programs: [
      'Tele-Sağlık Teknikerliği',
      'Anestezi',
      'Biyomedikal Cihaz Teknolojisi',
      'Elektronörofizyoloji',
      'Optisyenlik',
      'Tıbbi Dokümantasyon ve Sekreterlik',
      'Tıbbi Veri İşleme Teknikerliği',
      'Tıbbi Laboratuvar Teknikleri',
      'Tıbbi Görüntüleme Teknikleri',
      'Tıbbi Tanıtım ve Pazarlama',
      'Fizyoterapi',
      'İlk ve Acil Yardım',
      'Ameliyathane Hizmetleri',
    ],
  },
  {
    name: 'Meslek Yüksekokulu',
    kind: 'school',
    aliases: ['myo', 'meslek yuksekokulu'],
    programs: ['Bilgisayar Programcılığı', 'Eczane Hizmetleri', 'Elektrik', 'Grafik Tasarım'],
  },
]

const PROGRAMS: AcademicCatalogUnit[] = [...FACULTIES, ...SCHOOLS].flatMap((unit) =>
  (unit.programs ?? []).map((program) => ({
    name: program.replace(/\s*\([^)]*\)\s*$/u, ''),
    kind: 'program' as const,
    aliases: [program, program.replace(/\s*\([^)]*\)\s*$/u, '')],
    note: `${program} ${unit.name} altında listelenir.`,
  }))
)

const SUPPORTED_UNITS = [...FACULTIES, ...SCHOOLS, ...PROGRAMS]

const UNSUPPORTED_UNITS: AcademicCatalogUnit[] = [
  {
    name: 'Hukuk Fakültesi',
    kind: 'faculty',
    aliases: ['hukuk fakultesi', 'hukuk fakulteniz'],
  },
  {
    name: 'Diş Hekimliği Fakültesi',
    kind: 'faculty',
    aliases: ['dis hekimligi fakultesi', 'dis hekimligi fakulteniz'],
  },
  {
    name: 'Eczacılık Fakültesi',
    kind: 'faculty',
    aliases: ['eczacilik fakultesi', 'eczacilik fakulteniz'],
  },
  {
    name: 'Mühendislik Fakültesi',
    kind: 'faculty',
    aliases: ['muhendislik fakultesi', 'muhendislik fakulteniz'],
  },
  {
    name: 'Yazılım Mühendisliği',
    kind: 'program',
    aliases: ['yazilim muhendisligi'],
  },
  {
    name: 'Psikoloji Bölümü',
    kind: 'program',
    aliases: ['psikoloji bolumu', 'psikoloji'],
  },
  {
    name: 'İngilizce Hemşirelik',
    kind: 'program',
    aliases: ['ingilizce hemsirelik'],
  },
]

function includesAlias(search: string, aliases: string[]) {
  const paddedSearch = ` ${search} `
  return aliases.some((alias) => {
    const normalizedAlias = normalizeStrictQuestionSearch(alias)
    return paddedSearch.includes(` ${normalizedAlias} `) || search.includes(normalizedAlias)
  })
}

function findSupportedUnit(understanding: StrictQuestionUnderstanding) {
  const entity = understanding.entities[0]
  if (entity) {
    const direct = SUPPORTED_UNITS.find((unit) => unit.name === entity.canonicalName)
    if (direct) return direct
  }

  return SUPPORTED_UNITS.find((unit) => includesAlias(understanding.normalizedSearch, unit.aliases))
}

export function findUnsupportedCatalogUnit(questionOrSearch: string) {
  const search = normalizeStrictQuestionSearch(questionOrSearch)
  return UNSUPPORTED_UNITS.find((unit) => includesAlias(search, unit.aliases)) ?? null
}

export function isSupportedByStrictCatalog(name: string) {
  const search = normalizeStrictQuestionSearch(name)
  return SUPPORTED_UNITS.some((unit) => unit.name === name || includesAlias(search, unit.aliases))
}

function renderSupportedExistence(unit: AcademicCatalogUnit) {
  const note = unit.note ? ` ${unit.note}` : ''
  return `${unit.name} vardır; onaylı tanıtım broşüründe listelenmektedir.${note}`
}

function renderUnsupportedExistence(unit: AcademicCatalogUnit) {
  return `Onaylı tanıtım broşürü ve program listesinde ${unit.name} listelenmemektedir. Bu nedenle belgelerde ${unit.name} bulunduğuna dair doğrulanmış bilgi yoktur.`
}

function renderPrograms(unit: AcademicCatalogUnit) {
  return `${unit.name} altında listelenen programlar: ${(unit.programs ?? []).join(', ')}.`
}

function renderFaculties() {
  return `Onaylı tanıtım broşüründe listelenen fakülteler: ${FACULTIES.map((unit) => unit.name).join(', ')}.`
}

function renderDegreeLevelPrograms() {
  const undergraduatePrograms = FACULTIES.flatMap((unit) => unit.programs ?? [])
  const associatePrograms = SCHOOLS.flatMap((unit) => unit.programs ?? [])
  return `Lisans programları: ${undergraduatePrograms.join(', ')}. Ön lisans programları: ${associatePrograms.join(', ')}.`
}

function resolveProgramDistinctionFact(search: string): StrictCatalogAnswer | null {
  const asksFizyoterapiDistinction =
    /fizyoterapi ve rehabilitasyon/.test(search) &&
    /(?:^|\s)fizyoterapi(?:\s|$)/.test(search) &&
    /(?:ayni|fark|bolum mu|program mi)/.test(search)
  if (!asksFizyoterapiDistinction) return null

  return {
    answer:
      'Fizyoterapi ve Rehabilitasyon ile Fizyoterapi aynı program değildir. Onaylı katalogda Fizyoterapi ve Rehabilitasyon lisans programı Sağlık Bilimleri Fakültesi altında; Fizyoterapi ön lisans programı ise Sağlık Hizmetleri Meslek Yüksekokulu altında listelenmektedir.',
    citations: [CATALOG_CITATION],
    refusal: false,
    reason: 'catalog_program_distinction_fact',
  }
}

function resolveInstitutionFact(search: string): StrictCatalogAnswer | null {
  if (/(?:ne zaman|kac yilinda|kurulus yil|kuruldu)/.test(search) && /(?:universite|yuksek ihtisas)/.test(search)) {
    return {
      answer:
        'Yüksek İhtisas Üniversitesi, Türkiye Yüksek İhtisas Hastanesi Vakfı tarafından 2013 yılında Ankara’da kurulmuştur.',
      citations: [INSTITUTION_CITATION],
      refusal: false,
      reason: 'catalog_institution_fact',
    }
  }
  return null
}

function resolveHospitalScopeFact(search: string): StrictCatalogAnswer | null {
  const asksHospitalIdentity =
    /(?:kendi hastane|kendi hastanesi|kendi hastaneniz|universitenin kendi hastanesi|yuksek ihtisas universitesi hastanesi|yiu hastanesi)/.test(
      search
    )
  const asksAffiliatedHospitalExistence =
    /(?:afiliye|afilye|anlasmali).{0,40}hastane/.test(search) &&
    /(?:var mi|varmi|mevcut mu|bulunuyor mu)/.test(search)
  const asksAffiliatedHospitalScope =
    /(?:afiliye|afilye|anlasmali).{0,40}hastane/.test(search) &&
    /(?:neresi|nerede|nerde|adres|hangi sehir|ozel|devlet|egitim ve arastirma|statu|adi|ismi)/.test(
      search
    )
  const asksSpecificTrainingHospital =
    /hastane/.test(search) &&
    /(?:hangi hastane|hangi hastanede|nerede egitim|egitim goruyor|egitim gorecek|staj nerede|uygulama nerede|hastaneye yerlestir|hastane.*kampuse yakin|hastane.*kampus.*yakin|kampus.*hastane.*yakin|hastaneye ulasim|hastane.*ulasim|hastane yapilana kadar|hastane yoksa|hastane projesi|hastane kurul|kendi hastaneniz ne zaman)/.test(
      search
    )

  if (asksAffiliatedHospitalExistence && !asksHospitalIdentity && !asksAffiliatedHospitalScope) {
    return {
      answer:
        'Onaylı kaynaklarda klinik ve staj uygulamaları için afiliye/anlaşmalı hastaneler ve Eğitim ve Araştırma Hastanelerinden söz edilir. Ancak afiliye hastanenin tekil adı, adresi veya özel/devlet statüsü hakkında net bilgi bulunmamaktadır.',
      citations: [HOSPITAL_SCOPE_CITATION],
      refusal: false,
      reason: 'catalog_affiliated_hospital_training_fact',
    }
  }

  if (!asksHospitalIdentity && !asksAffiliatedHospitalScope && !asksSpecificTrainingHospital) {
    return null
  }

  return {
    answer:
      'Onaylı kaynaklarda klinik ve staj uygulamaları için Sağlık Uygulama ve Araştırma Merkezi, afiliye/anlaşmalı hastaneler ve Eğitim ve Araştırma Hastanelerinden söz edilir. Ancak üniversitenin kendi hastanesi; afiliye hastanenin tekil adı, adresi, kampüse yakınlığı veya özel ya da devlet hastanesi statüsü hakkında net bilgi bulunmamaktadır.',
    citations: [HOSPITAL_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_hospital_scope_guard',
  }
}

function resolveClinicalProgramClarification(search: string): StrictCatalogAnswer | null {
  const asksBroadClinicalInternship =
    /(?:staj|uygulama|nobet|hasta bakimi|gozlem)/.test(search) &&
    /(?:kac gun|hangi sinif|ne zaman|nerede|ayarl|yerlestir|zorunlu|ucretli|garanti|yapiyor muyuz|tutuluyor mu|sadece gozlem)/.test(
      search
    )
  const namesSpecificProgram =
    /(?:tip|hemsirelik|ebelik|anestezi|ilk ve acil yardim|tibbi laboratuvar|tibbi goruntuleme|fizyoterapi|ergoterapi|dil ve konusma|beslenme|saglik yonetimi|optisyenlik|eczane hizmetleri|ameliyathane)/.test(
      search
    )

  if (!asksBroadClinicalInternship || namesSpecificProgram) return null

  return {
    answer: 'Hangi bölüm veya program için staj bilgisini öğrenmek istiyorsunuz?',
    citations: [],
    refusal: false,
    reason: 'catalog_clinical_program_clarification',
  }
}

function resolveClinicalProgramScopeGuard(
  search: string,
  understanding: StrictQuestionUnderstanding
): StrictCatalogAnswer | null {
  const asksSpecificSummerInternship =
    /(?:yaz staji|yaz stajı)/.test(search) &&
    /(?:var mi|varmi|zorunlu mu|kac gun|ne kadar sur|hangi sinif|ne zaman)/.test(search)
  const asksSpecificClinicalPractice =
    /(?:uygulama alani|uygulama alanı|hastanede uygulama|cihaz egitimi|ambulans kullan|ameliyat izle|hasta bakimi|kan gormek|laboratuvara gir|cihaz kullan|uygulama yap)/.test(
      search
    )
  if (!asksSpecificSummerInternship && !asksSpecificClinicalPractice) return null

  const program = findSupportedUnit(understanding)
  if (!program || program.kind !== 'program') return null

  const scopeLabel = asksSpecificSummerInternship
    ? 'yaz stajının varlığı, zorunluluğu veya süresi'
    : 'uygulama alanı, cihaz/simülasyon imkanı, hastane uygulaması veya mesleki yetki ayrıntıları'

  return {
    answer: `${program.name} için programın kendisi onaylı broşürde listelenmektedir. Ancak bu programda ${scopeLabel} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır.`,
    citations: [CLINICAL_PROGRAM_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_clinical_program_scope_guard',
  }
}

function resolveFacilityResourceScopeFact(
  understanding: StrictQuestionUnderstanding
): StrictCatalogAnswer | null {
  const search = understanding.normalizedSearch
  const asksFacilityResource =
    /(?:rontgen|mr|tomografi|cihaz|mikroskop|ambulans simulasyon|simulasyon laboratuvari|beceri laboratuvari|uygulama alani|dogumhane|yogun bakim|ameliyathane|cocuk hastaliklari servisi|dahili ve cerrahi|hasta basi egitim|ogrenci dinlenme alani|laboratuvarlari gez|laboratuvarlari gorebilir)/.test(
      search
    ) &&
    /(?:var mi|varmi|kac tane|kac adet|dusuyor mu|nerede|gorebilir miyim|gezebilir miyiz|kullan|egitimi)/.test(
      search
    )
  const asksFacetFacilityResource =
    classifyStrictQuestionFacets(understanding).includes('facility_resource')
  if (!asksFacilityResource && !asksFacetFacilityResource) return null

  const program = findSupportedUnit(understanding)
  const topic =
    program?.kind === 'program'
      ? `${program.name} için laboratuvar, simülasyon/uygulama alanı veya cihaz imkanı`
      : 'Laboratuvar, simülasyon/uygulama alanı, mikroskop, kadavra/maket, Röntgen, MR, tomografi veya hastane içi birim varlığı'

  return {
    answer: `${topic} gibi fiziksel imkan ayrıntıları hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Bu tür imkanlar için güncel resmi duyuru veya ilgili akademik birim kontrol edilmelidir.`,
    citations: [FACILITY_RESOURCE_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_facility_resource_scope_guard',
  }
}

function campusLifeTopicLabel(search: string) {
  if (/(?:wifi|wi fi)/.test(search)) return 'Wi-Fi'
  if (/kafe/.test(search)) return 'kafe'
  if (/kantin/.test(search)) return 'kantin'
  if (/spor salonu/.test(search)) return 'spor salonu'
  if (/vejetaryen/.test(search)) return 'vejetaryen yemek'
  if (/revir/.test(search)) return 'revir'
  if (/otopark/.test(search)) return 'otopark'
  if (/(?:guvenli|guvenlik)/.test(search)) return 'kampüs güvenliği'
  if (/servis saat/.test(search)) return 'servis saatleri'
  if (/servis guzergah/.test(search)) return 'servis güzergahları'
  if (/kampus yasam/.test(search)) return 'kampüs yaşamı'
  if (/kampus merkezi/.test(search)) return 'kampüsün merkezi konumu'
  if (/(?:kampusler.*yakin|birbirine yakin)/.test(search)) return 'kampüslerin birbirine yakınlığı'
  if (/apart/.test(search)) return 'kampüs çevresindeki apartlar'
  if (/kiralik ev/.test(search)) return 'kampüs çevresindeki kiralık evler'
  return 'kampüs yaşamı ve imkanları'
}

function resolveCampusLifeScopeFact(search: string): StrictCatalogAnswer | null {
  const asksCampusLifeScope =
    /(?:wifi|wi fi|kafe|kantin|spor salonu|vejetaryen|revir|otopark|kampus guvenli|kampus guvenligi|servis saat|servis guzergah|kampus yasam|kampus merkezi|kampusler.*yakin|birbirine yakin|apart|kiralik ev)/.test(
      search
    )
  if (!asksCampusLifeScope) return null

  const topic = campusLifeTopicLabel(search)
  return {
    answer: `${topic} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Bu tür kampüs yaşamı ve güncel imkan bilgileri değişebileceği için üniversitenin güncel resmi duyuruları veya ilgili birimi kontrol edilmelidir.`,
    citations: [CAMPUS_LIFE_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_campus_life_scope_guard',
  }
}

function asksClinicalInternshipTopic(search: string) {
  return /(?:staj|yaz staji|uygulama|nobet|hasta bakimi|gozlem|hastanede)/.test(search)
}

function resolveClinicalTrainingFact(search: string): StrictCatalogAnswer | null {
  const asksMedicalClinicalTiming =
    /(?:tip|tıp)/.test(search) &&
    /(?:hastane.*kacinci|kacinci.*hastane|hastaneye bas|klinik egitim|klinik.*basla)/.test(
      search
    )
  if (!asksMedicalClinicalTiming) return null

  return {
    answer:
      'Tıp Fakültesinde klinik eğitim Dönem IV ve Dönem V’te stajlarla başlar; Dönem VI ise intörn hekimlik dönemidir. Bu nedenle hastane/klinik uygulama başlangıcı yalnızca 6. sınıf olarak anlatılmamalıdır.',
    citations: [CLINICAL_TRAINING_CITATION],
    refusal: false,
    reason: 'catalog_clinical_training_fact',
  }
}

function hasHousingTerm(search: string) {
  return /(?:^|\s)(?:yurt|yurdu|yurtlar|yurtlari|yurtlarda|konaklama)(?:\s|$)/.test(
    search
  )
}

function resolveHousingFact(search: string): StrictCatalogAnswer | null {
  if (!hasHousingTerm(search)) return null
  if (/(?:ucret|fiyat|kac para|kac tl)/.test(search)) return null

  const asksUnsupportedScope = /(?:kiz yurdu|erkek yurdu|kiz ogrenci yurdu|erkek ogrenci yurdu|kampus icinde|kampuse yakin|yakinlarda|devlet yurdu|kyk|ozel yurt|anlasmali yurt|kendi yurdu|yurt garanti|garanti|yardimci|basvuru|nasil yap|nerede kal|sehir disindan gelen)/.test(
    search
  )
  if (asksUnsupportedScope) {
    return {
      answer:
        'Onaylı kaynaklarda yurtlar/konaklama için resmi bilgilendirme sayfası bağlantısı yer alır. Ancak kız/erkek yurdu, kampüs içinde yurt, kampüse yakınlık, özel/devlet yurdu, yurt başvuru süreci, yurt garantisi veya üniversitenin konaklama yerleştirme desteği hakkında net bilgi bulunmamaktadır.',
      citations: [HOUSING_CITATION],
      refusal: true,
      reason: 'catalog_housing_scope_guard',
    }
  }

  if (/^(?:yurt|yurtlar)\s+var mi\??$/.test(search)) {
    return {
      answer:
        'Üniversite kaynaklarında yurtlar/konaklama için resmi bilgilendirme sayfası bağlantısı bulunmaktadır. Güncel yurt seçenekleri ve ayrıntılar için bu resmi sayfa kontrol edilmelidir.',
      citations: [HOUSING_CITATION],
      refusal: false,
      reason: 'catalog_housing_link_fact',
    }
  }

  return null
}

function resolveCredentialScopeFact(search: string): StrictCatalogAnswer | null {
  if (/mavi diploma/.test(search)) {
    return {
      answer:
        'Mavi diploma verilip verilmediği hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Bu bilgi resmi diploma/diploma eki uygulamasına bağlı olduğu için üniversitenin güncel resmi duyuruları veya öğrenci işleri kontrol edilmelidir.',
      citations: [CREDENTIAL_SCOPE_CITATION],
      refusal: true,
      reason: 'catalog_credential_scope_guard',
    }
  }

  const asksInternationalCredential =
    /(?:diploma|denklik)/.test(search) &&
    /(?:yurtdisi|amerika|almanya|avrupa|otomatik|gecerli)/.test(search)
  if (!asksInternationalCredential) return null

  return {
    answer:
      'Diplomanın yurtdışında geçerliliği veya mesleki denklik otomatik değildir; başvurulacak ülke, kurum ve ilgili meslek otoritesinin kurallarına bağlıdır. Onaylı belgelerde YİÜ diplomasının Amerika, Almanya, Avrupa veya başka bir ülkede otomatik geçerli olduğuna dair net bilgi bulunmamaktadır.',
    citations: [CREDENTIAL_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_credential_scope_guard',
  }
}

function resolveRegistrationScopeFact(search: string): StrictCatalogAnswer | null {
  const asksRegistrationScope =
    /(?:kayit|kayıt)/.test(search) &&
    /(?:online|kesin kayit|e devlet|kampuse gel|tarih|saat|randevu|eksik belge|hangi belge|belgeler|baskasinin yerine|resit olmayan|vazgecersem|ucret iadesi|kayit ofisi)/.test(
      search
    )
  if (!asksRegistrationScope) return null

  return {
    answer:
      'Aday öğrenci kayıt sürecinde online kayıt, kesin kayıt belgeleri, kayıt tarihleri, randevu veya kampüse gelme zorunluluğu hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Bu bilgiler başvuru türü ve döneme göre değişebileceği için üniversitenin güncel resmi kayıt duyuruları kontrol edilmelidir.',
    citations: [REGISTRATION_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_registration_scope_guard',
  }
}

function resolveProfessionalAuthorityScopeFact(search: string): StrictCatalogAnswer | null {
  const asksProfessionalAuthority =
    /(?:eczaci olur|eczane ac|gozlukcu ac|optik ac|ambulans kullan|ambulans sur|doktor der|hacker olur|is garantisi|direkt hastaneye al|dogrudan is bul|en zengin)/.test(
      search
    )
  if (!asksProfessionalAuthority) return null

  return {
    answer:
      'Program mezuniyeti, mesleki yetki, iş yeri açma, araç kullanma, unvan kullanımı veya iş garantisi için otomatik garanti anlamına gelmez. Onaylı kaynaklarda bu konuda net bilgi bulunmamaktadır; ilgili meslek mevzuatı, yetkili kurum kuralları ve resmi kariyer/mezuniyet koşulları kontrol edilmelidir.',
    citations: [PROFESSIONAL_AUTHORITY_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_professional_authority_scope_guard',
  }
}

function resolveCandidateEventScopeFact(search: string): StrictCatalogAnswer | null {
  const asksCandidateEvent =
    /(?:tanitim gun|tanitim etkin|kampuste etkinlik|kampus etkinlik|etkinlik yap|kampusu gez|kampus gez|laboratuvarlari gez|laboratuvarlari gorebilir|hocalarla gorus|bolum hocalariyla gorus)/.test(
      search
    )
  if (!asksCandidateEvent) return null

  return {
    answer:
      'Güncel tanıtım günü, kampüs etkinliği, kampüs gezisi, laboratuvar gezisi veya bölüm hocalarıyla görüşme gibi aday etkinliği ayrıntıları hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Bu bilgiler dönemsel olabileceği için üniversitenin güncel resmi duyuruları veya aday öğrenci birimi kontrol edilmelidir.',
    citations: [CANDIDATE_EVENT_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_candidate_event_scope_guard',
  }
}

function resolveReputationScopeFact(search: string): StrictCatalogAnswer | null {
  const asksReputation =
    /(?:universitenin eksileri|eksileri ne|kotu yorum|kotu yorumlari|en kotu bolum|rakip.*kiyas|kiyaslar misin|olumsuz yorum|dezavantajlari)/.test(
      search
    )
  if (!asksReputation) return null

  return {
    answer:
      'Üniversitenin eksileri, kötü yorumlar veya rakiplerle kıyaslama gibi öznel değerlendirme başlıkları hakkında onaylı kaynaklarda doğrulanmış bilgi bulunmamaktadır. Yanıltıcı yorum aktarmak yerine program, ücret, burs, kontenjan, kampüs veya kayıt bilgileri gibi doğrulanabilir başlıklarda yardımcı olabilirim.',
    citations: [REPUTATION_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_reputation_scope_guard',
  }
}

function isPureExistenceQuestion(understanding: StrictQuestionUnderstanding) {
  return understanding.intents.every((intent) => intent === 'existence')
}

export function resolveStrictCatalogAnswer(input: {
  question: string
  understanding: StrictQuestionUnderstanding
}): StrictCatalogAnswer | null {
  const { understanding } = input
  const asksExistence = understanding.intents.includes('existence')
  const asksListing = understanding.intents.includes('listing')
  const programDistinctionFact = resolveProgramDistinctionFact(understanding.normalizedSearch)
  if (programDistinctionFact) return programDistinctionFact
  const institutionFact = resolveInstitutionFact(understanding.normalizedSearch)
  if (institutionFact) return institutionFact
  const hospitalScopeFact = resolveHospitalScopeFact(understanding.normalizedSearch)
  if (hospitalScopeFact) return hospitalScopeFact
  const clinicalProgramClarification = resolveClinicalProgramClarification(
    understanding.normalizedSearch
  )
  if (clinicalProgramClarification) return clinicalProgramClarification
  const clinicalProgramScopeGuard = resolveClinicalProgramScopeGuard(
    understanding.normalizedSearch,
    understanding
  )
  if (clinicalProgramScopeGuard) return clinicalProgramScopeGuard
  const clinicalTrainingFact = resolveClinicalTrainingFact(understanding.normalizedSearch)
  if (clinicalTrainingFact) return clinicalTrainingFact
  const housingFact = resolveHousingFact(understanding.normalizedSearch)
  if (housingFact) return housingFact
  const credentialScopeFact = resolveCredentialScopeFact(understanding.normalizedSearch)
  if (credentialScopeFact) return credentialScopeFact
  const professionalAuthorityScopeFact = resolveProfessionalAuthorityScopeFact(
    understanding.normalizedSearch
  )
  if (professionalAuthorityScopeFact) return professionalAuthorityScopeFact
  const candidateEventScopeFact = resolveCandidateEventScopeFact(understanding.normalizedSearch)
  if (candidateEventScopeFact) return candidateEventScopeFact
  const reputationScopeFact = resolveReputationScopeFact(understanding.normalizedSearch)
  if (reputationScopeFact) return reputationScopeFact
  const registrationScopeFact = resolveRegistrationScopeFact(understanding.normalizedSearch)
  if (registrationScopeFact) return registrationScopeFact
  const facilityResourceScopeFact = resolveFacilityResourceScopeFact(understanding)
  if (facilityResourceScopeFact) return facilityResourceScopeFact
  const campusLifeScopeFact = resolveCampusLifeScopeFact(understanding.normalizedSearch)
  if (campusLifeScopeFact) return campusLifeScopeFact

  if (
    asksListing &&
    /(?:^|\s)lisans(?:\s|$)/.test(understanding.normalizedSearch) &&
    /(?:on lisans|onlisans)/.test(understanding.normalizedSearch)
  ) {
    return {
      answer: renderDegreeLevelPrograms(),
      citations: [CATALOG_CITATION],
      refusal: false,
      reason: 'catalog_degree_level_listing',
    }
  }

  if (asksExistence && !asksClinicalInternshipTopic(understanding.normalizedSearch)) {
    const unsupported = findUnsupportedCatalogUnit(input.question)
    if (unsupported) {
      return {
        answer: renderUnsupportedExistence(unsupported),
        citations: [CATALOG_CITATION],
        refusal: true,
        reason: 'catalog_unsupported_existence',
      }
    }

    const supported = isPureExistenceQuestion(understanding)
      ? findSupportedUnit(understanding)
      : undefined
    if (supported) {
      return {
        answer: renderSupportedExistence(supported),
        citations: [CATALOG_CITATION],
        refusal: false,
        reason: 'catalog_supported_existence',
      }
    }
  }

  if (asksListing) {
    if (/hangi fakulte|hangi fakulteler|fakulteler/.test(understanding.normalizedSearch)) {
      return {
        answer: renderFaculties(),
        citations: [CATALOG_CITATION],
        refusal: false,
        reason: 'catalog_faculty_listing',
      }
    }

    const unit = findSupportedUnit(understanding)
    if (unit?.programs && unit.programs.length > 0) {
      return {
        answer: renderPrograms(unit),
        citations: [CATALOG_CITATION],
        refusal: false,
        reason: 'catalog_program_listing',
      }
    }
  }

  return null
}
