import type {
  StrictQuestionEntity,
  StrictQuestionUnderstanding,
} from './strict-question-understanding'
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
  | 'catalog_program_fee_fact'
  | 'catalog_payment_policy_scope_guard'
  | 'catalog_admissions_metric_scope_guard'
  | 'catalog_admissions_decision_guard'
  | 'catalog_admissions_point_type_fact'
  | 'catalog_institution_fact'
  | 'catalog_institution_location_fact'
  | 'catalog_scholarship_fact'
  | 'catalog_scholarship_scope_guard'
  | 'catalog_hospital_scope_guard'
  | 'catalog_affiliated_hospital_definition_fact'
  | 'catalog_affiliated_hospital_training_fact'
  | 'catalog_clinical_training_fact'
  | 'catalog_internship_policy_fact'
  | 'catalog_ergotherapy_training_fact'
  | 'catalog_clinical_program_clarification'
  | 'catalog_clinical_program_scope_guard'
  | 'catalog_clinical_practice_scope_guard'
  | 'catalog_facility_resource_scope_guard'
  | 'catalog_campus_life_fact'
  | 'catalog_campus_life_scope_guard'
  | 'catalog_housing_link_fact'
  | 'catalog_housing_agreement_fact'
  | 'catalog_housing_scope_guard'
  | 'catalog_double_major_fact'
  | 'catalog_credential_scope_guard'
  | 'catalog_registration_scope_guard'
  | 'catalog_professional_authority_scope_guard'
  | 'catalog_candidate_event_scope_guard'
  | 'catalog_reputation_scope_guard'
  | 'catalog_contact_scope_guard'
  | 'catalog_off_topic_scope_guard'

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

const INSTITUTION_LOCATION_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:campus-locations',
  title: 'YİÜ Tanıtım Broşürü - Yerleşke Konumları',
  quote:
    'YİÜ kaynaklarında Bağlıca, Balgat ve Bağlum yerleşkeleri Ankara adresleriyle listelenir.',
}

const HOSPITAL_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:hospital-training-scope',
  title: 'YİÜ Klinik Eğitim ve Hastane Kapsamı',
  quote:
    'Onaylı kaynaklarda klinik ve staj uygulamaları için Sağlık Uygulama ve Araştırma Merkezi, afiliye/anlaşmalı hastaneler ve Eğitim ve Araştırma Hastanelerinden söz edilir; üniversitenin kendi hastanesi ya da tekil afiliye hastane adı/adresi/statüsü net doğrulanmamaktadır.',
}

const AFFILIATED_HOSPITAL_DEFINITION_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:affiliated-hospital-definition',
  title: 'YİÜ Klinik Eğitim Kapsamı - Afiliye Hastane Terimi',
  quote:
    'Afiliye/anlaşmalı hastane, öğrencilerin klinik eğitim ve staj uygulamalarında yararlanılan anlaşmalı hastane yapısını ifade eder; tekil hastane adı ayrıca doğrulanmalıdır.',
}

const CLINICAL_TRAINING_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:clinical-training-timing',
  title: 'YİÜ Tıp Fakültesi - Klinik Eğitim Dönemleri',
  quote:
    'Tıp Fakültesi klinik eğitimi Dönem IV ve Dönem V stajlarıyla başlar; klinik stajların uygulama eğitimleri Sağlık Uygulama Araştırma Merkezi, afiliye/anlaşmalı hastaneler ve Sağlık Uygulama ve Araştırma Merkezlerinde yapılabilir. Dönem VI intörnlük eğitimidir.',
}

const CLINICAL_PROGRAM_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:clinical-program-scope',
  title: 'YİÜ Klinik Uygulama ve Staj Kapsamı',
  quote:
    'Programların klinik uygulama ve staj ayrıntıları program bazında değişir; yaz stajı varlığı, zorunluluğu veya süresi net doğrulanmadan program varlığı cevabı olarak verilmemelidir.',
}

const INTERNSHIP_POLICY_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:internship-policy',
  title: 'YİÜ Uygulamalı Eğitimler Yönergesi - Staj Esasları',
  quote:
    'Staj süresi 20 iş gününden az olmamak üzere programın niteliğine göre belirlenir; staj için AKTS kredisi belirlemek zorunludur ve staj kredisi toplamı 5 AKTS kredisinden az, 10 AKTS kredisinden fazla olamaz. Staj ücretleri için 3308 sayılı Kanun, Tıp Fakültesi intörnlüğü için 2547 sayılı Kanunun ek 29. maddesi uygulanır.',
}

const ERGOTHERAPY_TRAINING_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:ergotherapy-training',
  title: 'YİÜ Ergoterapi Bölümü - Laboratuvarlar ve Zorunlu Stajlar',
  quote:
    'Ergoterapi Bölümü kaynaklarında 2. sınıf yaz stajı, 3. sınıf yaz stajı ve 4. sınıf klinik uygulama stajı listelenir; laboratuvar başlığında Günlük Yaşam Aktiviteleri Simülasyon Laboratuvarı, El Rehabilitasyon Laboratuvarı, Pediatri Laboratuvarı ve Duyu Bütünleme Laboratuvarı gibi alanlar yer alır.',
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

const CAMPUS_LIFE_FACT_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:campus-life-facts',
  title: 'YİÜ Kampüs Yaşamı - Kütüphane ve Öğrenci Toplulukları',
  quote:
    'YİÜ kaynaklarında Kütüphane ve Dokümantasyon Daire Başkanlığı ile öğrenci toplulukları yönergesi/başlıkları yer alır.',
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

const OFF_TOPIC_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:off-topic-scope',
  title: 'YİÜ Aday Öğrenci Yanıt Kapsamı',
  quote:
    'Bot yanıtları onaylı aday öğrenci dokümanlarındaki program, ücret, burs, kontenjan, kampüs ve kayıt başlıklarıyla sınırlı tutulmalıdır.',
}

const CONTACT_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:contact-channel-scope',
  title: 'YİÜ Resmi İletişim Kanalı Kapsamı',
  quote:
    'WhatsApp danışma hattı veya aday öğrenci WhatsApp hattı gibi özel iletişim kanalı iddiaları onaylı kaynaklarda net doğrulanmadan var cevabı olarak verilmemelidir.',
}

const HOUSING_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:housing-page',
  title: 'YİÜ Yurtlar / Konaklama Bilgilendirme Sayfası',
  url: 'https://yuksekihtisasuniversitesi.edu.tr/sayfa/yurtlar/yurtlar/yurtlar',
  quote:
    'Üniversite kaynaklarında yurtlar/konaklama için resmi bilgilendirme sayfası bağlantısı yer alır.',
}

const HOUSING_AGREEMENT_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:housing-agreements',
  title: 'YİÜ Yurtlar / Anlaşmalı Yurtlar',
  url: 'https://yuksekihtisasuniversitesi.edu.tr/sayfa/yurtlar/yurtlar/yurtlar',
  quote:
    'YİÜ konaklama kaynaklarında Fırat Erkek Öğrenci Yurdu, Çiğdem Kız Öğrenci Yurdu ve Özel Nil Kız Öğrenci Yurdu için anlaşma/indirim bilgileri yer alır.',
}

const CREDENTIAL_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:credential-equivalency-scope',
  title: 'Yurtdışı Diploma Geçerliliği ve Denklik Kapsamı',
  quote:
    'Yurtdışında diploma geçerliliği ve mesleki denklik otomatik garanti olarak verilmemelidir; ülke, kurum ve meslek otoritesi kurallarına bağlıdır.',
}

const DOUBLE_MAJOR_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:double-major',
  title: 'YİÜ Tanıtım Broşürü - Burslar ve Çift Anadal',
  quote:
    'Broşürde ön lisans çift anadal için Ameliyathane Hizmetleri, Anestezi, Tıbbi Dokümantasyon ve Sekreterlik, Tıbbi Tanıtım ve Pazarlama, Tıbbi Laboratuvar Teknikleri ve Eczane Hizmetleri listelenmiştir.',
}

const SCHOLARSHIP_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:scholarship-facts',
  title: 'YİÜ Tanıtım Broşürü - Burs İmkanları',
  quote:
    'Broşürde YKS Üstün Başarı Bursu, Tercih Bursu, Akademik Başarı Bursu, Şehit ve Gazi Çocukları Bursu, Kardeş Bursu, Spor Başarı Bursu ve Sosyal Destek Bursu koşulları listelenir.',
}

const PROGRAM_FEE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:program-fees-2025',
  title: 'YİÜ Tanıtım Broşürü - 2025 Program Ücretleri',
  quote:
    'Broşür program ücret tablolarında ücretli, burslu ve %50 indirimli satırlar program bazında listelenir; burslu satırlarda fiyat alanı "-" olarak gösterilir.',
}

const PAYMENT_POLICY_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:payment-policy-scope',
  title: 'YİÜ Ücret ve Ödeme Koşulları Kapsamı',
  quote:
    'Program ücretleri broşürde program ve burs/indirim türü bazında listelenir; KDV, taksit, IBAN, online ödeme, peşin ödeme, kayıt anında ödeme ve ödeme kanalı gibi koşullar aynı resmi ücret/kayıt duyurusundan doğrulanmalıdır.',
}

const ADMISSIONS_METRIC_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:admissions-metrics-2025',
  title: 'YİÜ Tanıtım Broşürü - Kontenjan, Puan Türü, Taban Puan ve Başarı Sırası',
  quote:
    'Broşürde programların puan türü, 2025 kontenjanı, 2024 başarı sırası, 2024 taban puanı ve 2025 fiyat bilgileri program ve burs/indirim satırı bazında listelenir.',
}

const ADMISSIONS_DECISION_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:admissions-decision-scope',
  title: 'YİÜ Tercih ve Yerleşme Kararı Kapsamı',
  quote:
    'Taban puan, başarı sırası ve kontenjan bilgileri geçmiş yıl ve program satırı bazında referans veri sağlar; kesin yerleşme, tercih listesi veya kazanma garantisi olarak verilmemelidir.',
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

const CAMPUS_LOCATIONS = [
  {
    key: 'baglica',
    name: 'Bağlıca Yerleşkesi',
    address: 'Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca/Ankara',
  },
  {
    key: 'balgat',
    name: 'Balgat Yerleşkesi',
    address: 'Oğuzlar Mahallesi 1375 Sokak No:8 Balgat/Ankara',
  },
  {
    key: 'baglum',
    name: 'Bağlum Yerleşkesi',
    address: 'Karakaya Mahallesi Bağlum Bulvarı No:1 06291 Keçiören/Ankara',
  },
]

const DOUBLE_MAJOR_PROGRAMS = [
  'Ameliyathane Hizmetleri',
  'Anestezi',
  'Tıbbi Dokümantasyon ve Sekreterlik',
  'Tıbbi Tanıtım ve Pazarlama',
  'Tıbbi Laboratuvar Teknikleri',
  'Eczane Hizmetleri',
]

const DOUBLE_MAJOR_PAIRS: Array<[string, string]> = [
  ['Ameliyathane Hizmetleri', 'Anestezi'],
  ['Tıbbi Dokümantasyon ve Sekreterlik', 'Tıbbi Tanıtım ve Pazarlama'],
  ['Tıbbi Laboratuvar Teknikleri', 'Eczane Hizmetleri'],
]

const PROGRAM_FEE_FACTS = [
  {
    name: 'Tıp Fakültesi',
    aliases: ['tip', 'tip fakultesi', 'turkce tip', 'ingilizce tip'],
    paid: '720.000 TL',
    discounted50: '360.000 TL',
  },
  {
    name: 'Beslenme ve Diyetetik',
    aliases: ['beslenme', 'beslenme ve diyetetik'],
    paid: '490.000 TL',
    discounted50: '245.000 TL',
  },
  {
    name: 'Dil ve Konuşma Terapisi',
    aliases: ['dkt', 'dil konusma terapisi', 'dil ve konusma terapisi'],
    paid: '490.000 TL',
    discounted50: '245.000 TL',
  },
  {
    name: 'Fizyoterapi ve Rehabilitasyon',
    aliases: ['ftr', 'fizyoterapi ve rehabilitasyon'],
    paid: '490.000 TL',
    discounted50: '245.000 TL',
  },
  {
    name: 'Hemşirelik',
    aliases: ['hemsirelik'],
    paid: '490.000 TL',
    discounted50: '245.000 TL',
  },
  {
    name: 'Sağlık Yönetimi',
    aliases: ['saglik yonetimi'],
    paid: '460.000 TL',
    discounted50: '230.000 TL',
  },
  {
    name: 'Ergoterapi',
    aliases: ['ergoterapi'],
    paid: '460.000 TL',
    discounted50: '230.000 TL',
  },
  {
    name: 'Ebelik',
    aliases: ['ebelik'],
    paid: '460.000 TL',
    discounted50: '230.000 TL',
  },
  {
    name: 'Antrenörlük Eğitimi',
    aliases: ['antrenorluk egitimi', 'antrenorluk'],
    paid: '380.000 TL',
    discounted50: '190.000 TL',
  },
  {
    name: 'Ameliyathane Hizmetleri',
    aliases: ['ameliyathane hizmetleri'],
    paid: '330.000 TL',
    discounted50: '165.000 TL',
  },
  {
    name: 'Anestezi',
    aliases: ['anestezi'],
    paid: '330.000 TL',
    discounted50: '165.000 TL',
  },
  {
    name: 'Biyomedikal Cihaz Teknolojisi',
    aliases: ['biyomedikal cihaz teknolojisi'],
    paid: '330.000 TL',
    discounted50: '165.000 TL',
  },
  {
    name: 'Elektronörofizyoloji',
    aliases: ['elektronorofizyoloji'],
    paid: '330.000 TL',
    discounted50: '165.000 TL',
  },
  {
    name: 'Optisyenlik',
    aliases: ['optisyenlik'],
    paid: '330.000 TL',
    discounted50: '165.000 TL',
  },
  {
    name: 'Tıbbi Dokümantasyon ve Sekreterlik',
    aliases: ['tibbi dokumantasyon', 'tibbi dokumantasyon ve sekreterlik'],
    paid: '330.000 TL',
    discounted50: '165.000 TL',
  },
  {
    name: 'Tıbbi Laboratuvar Teknikleri',
    aliases: ['tibbi laboratuvar', 'tibbi laboratuvar teknikleri'],
    paid: '330.000 TL',
    discounted50: '165.000 TL',
  },
  {
    name: 'Tıbbi Tanıtım ve Pazarlama',
    aliases: ['tibbi tanitim', 'tibbi tanitim ve pazarlama'],
    paid: '330.000 TL',
    discounted50: '165.000 TL',
  },
  {
    name: 'Fizyoterapi ön lisans',
    aliases: ['fizyoterapi on lisans'],
    paid: '320.000 TL',
    discounted50: '160.000 TL',
  },
  {
    name: 'İlk ve Acil Yardım',
    aliases: ['ilk ve acil yardim', 'ilk yardim', 'ilkyardim', 'ilkyardım'],
    paid: '330.000 TL',
    discounted50: '165.000 TL',
  },
  {
    name: 'Tele-Sağlık Teknikerliği',
    aliases: ['tele saglik', 'tele saglik teknikerligi'],
    paid: '285.000 TL',
    discounted50: '142.500 TL',
  },
  {
    name: 'Tıbbi Veri İşleme Teknikerliği',
    aliases: ['tibbi veri isleme', 'tibbi veri isleme teknikerligi'],
    paid: '285.000 TL',
    discounted50: '142.500 TL',
  },
  {
    name: 'Bilgisayar Programcılığı',
    aliases: ['bilgisayar programciligi'],
    paid: '330.000 TL',
    discounted50: '165.000 TL',
  },
  {
    name: 'Eczane Hizmetleri',
    aliases: ['eczane hizmetleri'],
    paid: '330.000 TL',
    discounted50: '165.000 TL',
  },
  {
    name: 'Elektrik',
    aliases: ['elektrik'],
    paid: '300.000 TL',
    discounted50: '150.000 TL',
  },
  {
    name: 'Grafik Tasarım',
    aliases: ['grafik tasarim', 'grafik tasarimi'],
    paid: '300.000 TL',
    discounted50: '150.000 TL',
  },
]

const ADMISSIONS_POINT_TYPE_PROGRAMS = {
  SAY: [
    'Tıp Fakültesi',
    'Tıp Fakültesi (İngilizce)',
    'Beslenme ve Diyetetik',
    'Dil ve Konuşma Terapisi',
    'Fizyoterapi ve Rehabilitasyon',
    'Hemşirelik',
    'Ergoterapi',
    'Ebelik',
  ],
  EA: ['Sağlık Yönetimi'],
  TYT: [
    'Antrenörlük Eğitimi',
    'Ameliyathane Hizmetleri',
    'Anestezi',
    'Biyomedikal Cihaz Teknolojisi',
    'Elektronörofizyoloji',
    'Optisyenlik',
    'Tıbbi Dokümantasyon ve Sekreterlik',
    'Tıbbi Laboratuvar Teknikleri',
    'Tıbbi Tanıtım ve Pazarlama',
    'Fizyoterapi',
    'İlk ve Acil Yardım',
    'Tele-Sağlık Teknikerliği',
    'Tıbbi Veri İşleme Teknikerliği',
    'Bilgisayar Programcılığı',
    'Eczane Hizmetleri',
    'Elektrik',
    'Grafik Tasarım',
  ],
} as const

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
  if (
    /(?:ne zaman|kac yilinda|kurulus yil|kuruldu)/.test(search) &&
    /(?:universite|yuksek ihtisas)/.test(search)
  ) {
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

function renderAllCampusLocations() {
  return `Evet, Yüksek İhtisas Üniversitesi Ankara’dadır. Onaylı kaynaklarda yerleşkeler Ankara adresleriyle listelenir: ${CAMPUS_LOCATIONS.map(
    (location) => `${location.name}: ${location.address}`
  ).join('; ')}.`
}

function resolveInstitutionLocationFact(search: string): StrictCatalogAnswer | null {
  const asksUniversityInAnkara =
    /(?:universite|yuksek ihtisas)/.test(search) &&
    /ankara/.test(search) &&
    /(?:mi|midir|nerede|nerde|hangi sehir)/.test(search)
  if (asksUniversityInAnkara) {
    return {
      answer: renderAllCampusLocations(),
      citations: [INSTITUTION_LOCATION_CITATION],
      refusal: false,
      reason: 'catalog_institution_location_fact',
    }
  }

  const location = CAMPUS_LOCATIONS.find((candidate) => search.includes(candidate.key))
  if (!location) return null

  const asksSpecificCampusLocation =
    /(?:nerede|nerde|adres|nasil gider|nasil gidilir|kampus|yerleske)/.test(search)
  if (!asksSpecificCampusLocation) return null

  return {
    answer: `${location.name} adresi: ${location.address}.`,
    citations: [INSTITUTION_LOCATION_CITATION],
    refusal: false,
    reason: 'catalog_institution_location_fact',
  }
}

function resolveAffiliatedHospitalDefinitionFact(search: string): StrictCatalogAnswer | null {
  const asksDefinition =
    /(?:afiliye|afilye|anlasmali).{0,30}hastane/.test(search) &&
    /(?:ne demek|nedir|anlami|ne anlama)/.test(search)
  if (!asksDefinition) return null

  return {
    answer:
      'Afiliye/anlaşmalı hastane, öğrencilerin klinik eğitim, staj veya uygulama süreçlerinde yararlanılan anlaşmalı hastane yapısını ifade eder. Bu tanım hastane türünü veya tekil adı otomatik olarak vermez; onaylı kaynaklarda afiliye hastanenin tekil adı, adresi veya özel/devlet statüsü ayrıca net doğrulanmalıdır.',
    citations: [AFFILIATED_HOSPITAL_DEFINITION_CITATION],
    refusal: false,
    reason: 'catalog_affiliated_hospital_definition_fact',
  }
}

function resolveHospitalScopeFact(search: string): StrictCatalogAnswer | null {
  const asksHospitalIdentity =
    /(?:kendi hastane|kendi hastanesi|kendi hastaneniz|universitenin kendi hastanesi|yuksek ihtisas universitesi hastanesi|yiu hastanesi)/.test(
      search
    )
  const asksHospitalCaseVolume =
    /(?:ozel hastane|hastane|afiliye|afilye|anlasmali).{0,80}(?:vaka|hasta sayisi|vaka cesitliligi|sinirli|az olmaz|az kal)/.test(
      search
    ) || /(?:vaka|hasta sayisi).{0,80}(?:az|sinirli|cesitlilik|yeterlilik)/.test(search)
  const asksAffiliatedHospitalExistence =
    /(?:afiliye|afilye|anlasmali).{0,40}hastane/.test(search) &&
    /(?:var mi|varmi|mevcut mu|bulunuyor mu)/.test(search)
  const asksAffiliatedHospitalScope =
    /(?:afiliye|afilye|anlasmali).{0,40}hastane/.test(search) &&
    /(?:neresi|nerede|nerde|adres|hangi sehir|ozel|devlet|egitim ve arastirma|statu|adi|ismi)/.test(
      search
    )
  const asksAffiliatedShorthandScope =
    /(?:afiliye|afilye)/.test(search) &&
    /(?:neresi|nerede|nerde|adres|hangi sehir|lokasyon|konum)/.test(search)
  const asksSpecificTrainingHospital =
    /hastane/.test(search) &&
    /(?:hangi hastane|hangi hastanede|nerede egitim|egitim goruyor|egitim gorecek|staj nerede|uygulama nerede|hastaneye yerlestir|hastane.*kampuse yakin|hastane.*kampus.*yakin|kampus.*hastane.*yakin|hastaneye ulasim|hastane.*ulasim|hastaneye.*(?:toplu tasima|metro|otobus|dolmus|gidiliyor|gidilir|nasil gider)|hastane.*(?:toplu tasima|metro|otobus|dolmus|guzergah)|hastane yapilana kadar|hastane yoksa|hastane projesi|hastane kurul|kendi hastaneniz ne zaman)/.test(
      search
    )

  if (asksHospitalCaseVolume) {
    return {
      answer:
        'Onaylı kaynaklarda klinik ve staj uygulamaları için afiliye/anlaşmalı hastaneler ve Eğitim ve Araştırma Hastanelerinden söz edilir. Ancak özel veya anlaşmalı hastanelerde vaka sayısı, vaka çeşitliliği ya da hasta yoğunluğu düzeyi hakkında net bilgi bulunmamaktadır.',
      citations: [HOSPITAL_SCOPE_CITATION],
      refusal: true,
      reason: 'catalog_hospital_scope_guard',
    }
  }

  if (asksAffiliatedHospitalExistence && !asksHospitalIdentity && !asksAffiliatedHospitalScope) {
    return {
      answer:
        'Onaylı kaynaklarda klinik ve staj uygulamaları için afiliye/anlaşmalı hastaneler ve Eğitim ve Araştırma Hastanelerinden söz edilir. Ancak afiliye hastanenin tekil adı, adresi veya özel/devlet statüsü hakkında net bilgi bulunmamaktadır.',
      citations: [HOSPITAL_SCOPE_CITATION],
      refusal: false,
      reason: 'catalog_affiliated_hospital_training_fact',
    }
  }

  if (
    !asksHospitalIdentity &&
    !asksAffiliatedHospitalScope &&
    !asksAffiliatedShorthandScope &&
    !asksSpecificTrainingHospital
  ) {
    return null
  }

  return {
    answer:
      'Onaylı kaynaklarda klinik ve staj uygulamaları için Sağlık Uygulama ve Araştırma Merkezi, afiliye/anlaşmalı hastaneler ve Eğitim ve Araştırma Hastanelerinden söz edilir. Ancak üniversitenin kendi hastanesi; afiliye hastanenin tekil adı, adresi, kampüse yakınlığı, hastaneye ulaşım/toplu taşıma bilgisi veya özel ya da devlet hastanesi statüsü hakkında net bilgi bulunmamaktadır. Karar için hangi hastane/uygulama merkezi, yerleşke, dönem ve ulaşım güzergahı birlikte doğrulanmalıdır.',
    citations: [HOSPITAL_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_hospital_scope_guard',
  }
}

function resolveClinicalProgramClarification(search: string): StrictCatalogAnswer | null {
  const asksBroadClinicalInternship =
    /(?:staj|uygulama|nobet|hasta bakimi|gozlem|hastane|hastaneye)/.test(search) &&
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
    answer: `${program.name} için programın kendisi onaylı broşürde listelenmektedir. Ancak bu programda ${scopeLabel} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Karar için ilgili program, sınıf/dönem, uygulama türü ve yetkili akademik birim birlikte doğrulanmalıdır.`,
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
    answer: `${topic} gibi fiziksel imkan ayrıntıları hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Bu tür imkanlar için güncel resmi duyuru veya ilgili akademik birim kontrol edilmelidir. Karar için ilgili program, yerleşke, cihaz/laboratuvar türü ve güncel kullanım koşulu birlikte doğrulanmalıdır.`,
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
    answer: `${topic} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Bu tür kampüs yaşamı ve güncel imkan bilgileri değişebileceği için üniversitenin güncel resmi duyuruları veya ilgili birimi kontrol edilmelidir. Karar için ilgili yerleşke, dönem, hizmet saatleri/kapasitesi ve varsa başvuru koşulu birlikte doğrulanmalıdır.`,
    citations: [CAMPUS_LIFE_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_campus_life_scope_guard',
  }
}

function resolveCampusLifeFact(search: string): StrictCatalogAnswer | null {
  if (/kutuphane/.test(search)) {
    return {
      answer:
        'Evet. Onaylı kaynaklarda Kütüphane ve Dokümantasyon Daire Başkanlığı yer almaktadır; kütüphane ve ders çalışma alanı gibi ayrıntılar için ilgili kütüphane duyuruları kontrol edilmelidir.',
      citations: [CAMPUS_LIFE_FACT_CITATION],
      refusal: false,
      reason: 'catalog_campus_life_fact',
    }
  }

  if (/(?:ogrenci kulup|ogrenci topluluk|saglik kulup|spor kulup|kulup)/.test(search)) {
    return {
      answer:
        'Evet. Onaylı kaynaklarda öğrenci toplulukları başlığı ve öğrenci toplulukları yönergesi yer almaktadır. Güncel aktif topluluk listesi ve sağlık/spor özelindeki topluluk ayrıntıları için üniversitenin güncel resmi duyuruları kontrol edilmelidir.',
      citations: [CAMPUS_LIFE_FACT_CITATION],
      refusal: false,
      reason: 'catalog_campus_life_fact',
    }
  }

  if (/ders calisma/.test(search)) {
    return {
      answer:
        'Onaylı kaynaklarda kütüphane kapsamında ders çalışma alanları bulunduğu bilgisi yer almaktadır. Güncel kapasite ve kullanım koşulları için kütüphane duyuruları kontrol edilmelidir.',
      citations: [CAMPUS_LIFE_FACT_CITATION],
      refusal: false,
      reason: 'catalog_campus_life_fact',
    }
  }

  return null
}

function asksClinicalInternshipTopic(search: string) {
  return /(?:staj|yaz staji|uygulama|nobet|hasta bakimi|gozlem|hastanede)/.test(search)
}

function resolveClinicalTrainingFact(search: string): StrictCatalogAnswer | null {
  const asksMedicalClinicalTiming =
    (/(?:tip|tıp)/.test(search) &&
      /(?:hastane.*kacinci|kacinci.*hastane|hastaneye bas|klinik egitim|klinik.*basla)/.test(
        search
      )) ||
    /(?:hastaneye hangi sinif|hangi sinifta.*hastane|hastane.*hangi sinif|klinik.*hangi donem|klinik.*ne zaman)/.test(
      search
    )
  const asksBroadHealthPracticeLocation =
    /(?:saglik bolumu|saglik bolumleri|saglik.*ogrenci|ogrenciler).{0,80}(?:uygulama egitimi|uygulama|klinik|staj).{0,80}(?:nerede|nerde|neresi|yapiyor|yapiliyor)/.test(
      search
    ) ||
    /(?:uygulama egitimi|klinik uygulama).{0,80}(?:nerede|nerde|neresi|yapiyor|yapiliyor)/.test(
      search
    )
  if (!asksMedicalClinicalTiming && !asksBroadHealthPracticeLocation) return null

  if (asksBroadHealthPracticeLocation) {
    return {
      answer:
        'Onaylı kaynaklarda Tıp Fakültesi için Dönem IV ve Dönem V klinik staj uygulamalarının Sağlık Uygulama Araştırma Merkezi, afiliye/anlaşmalı hastaneler ve Sağlık Uygulama ve Araştırma Merkezlerinde yapılabileceği; Dönem VI intörnlük eğitiminin ayrıca Eğitim ve Araştırma Hastanelerinde de yapılabileceği belirtilir. Ergoterapi için de 4. sınıf klinik uygulama stajı İl Sağlık Müdürlüğü ve afiliye hastaneler kapsamında listelenir. Diğer sağlık programları için net yer bilgisi program bazında değiştiği için programı belirtmeniz gerekir.',
      citations: [CLINICAL_TRAINING_CITATION, ERGOTHERAPY_TRAINING_CITATION],
      refusal: false,
      reason: 'catalog_clinical_training_fact',
    }
  }

  return {
    answer:
      'Tıp için klinik eğitim Dönem IV ve Dönem V’te stajlarla başlar; Dönem VI ise intörn hekimlik dönemidir. Diğer sağlık programlarında hastane/uygulama başlangıcı program bazında değişebilir; kesin sınıf veya dönem için programı belirtmeniz gerekir.',
    citations: [CLINICAL_TRAINING_CITATION],
    refusal: false,
    reason: 'catalog_clinical_training_fact',
  }
}

function resolveErgotherapyTrainingFact(search: string): StrictCatalogAnswer | null {
  const asksErgotherapyTraining =
    /ergoterapi/.test(search) &&
    /(?:yaz staji|staj|klinik uygulama|laboratuvar|simulasyon|uygulama)/.test(search)
  const asksSummerInternshipListing =
    /(?:hangi|hangi bolum|hangi program|bolumlerde).{0,50}yaz staji/.test(search) ||
    /yaz staji.{0,50}(?:hangi|bolumlerde|programlarda|zorunlu)/.test(search)

  if (!asksErgotherapyTraining && !asksSummerInternshipListing) return null

  return {
    answer:
      'Onaylı akademik kaynaklarda Ergoterapi için 2. sınıf yaz stajı, 3. sınıf yaz stajı ve 4. sınıf klinik uygulama stajı listelenir. 4. sınıf klinik uygulama stajı İl Sağlık Müdürlüğü ve afiliye hastaneler kapsamında belirtilir. Aynı kaynakta Günlük Yaşam Aktiviteleri Simülasyon Laboratuvarı, El Rehabilitasyon Laboratuvarı, Pediatri Laboratuvarı ve Duyu Bütünleme Laboratuvarı gibi laboratuvarlar da yer alır. Diğer bölümler için yaz stajı kapsamı hakkında bu catalog’da net bilgi bulunmamaktadır; ilgili bölüm ayrıca doğrulanmalıdır.',
    citations: [ERGOTHERAPY_TRAINING_CITATION],
    refusal: false,
    reason: 'catalog_ergotherapy_training_fact',
  }
}

function resolveInternshipPolicyFact(search: string): StrictCatalogAnswer | null {
  const hasInternshipTerm =
    /(?:staj|intornluk|intörnlük|uygulamali egitim|isletmede mesleki egitim|zorunlu uygulama|klinik uygulama)/.test(
      search
    ) || (/(?:mezuniyet|zorunlu)/.test(search) && /uygulama/.test(search))
  if (!hasInternshipTerm) return null

  if (/(?:ozel hastane|özel hastane).{0,60}staj|staj.{0,60}(?:ozel hastane|özel hastane)/.test(search)) {
    return {
      answer:
        'Onaylı kaynaklarda Ergoterapi için 2. ve 3. sınıf yaz stajlarında Ulusal Staj Programı ve özel hastaneler vb. seçenekler listelenir. Genel Uygulamalı Eğitimler Yönergesi ise stajın programın niteliğine ve komisyon/onay süreçlerine bağlı olduğunu gösterir. Bu nedenle özel hastanede staj imkanı tüm programlar için otomatik garanti olarak anlatılmamalıdır; ilgili program ve komisyon koşulu birlikte doğrulanmalıdır.',
      citations: [ERGOTHERAPY_TRAINING_CITATION, INTERNSHIP_POLICY_CITATION],
      refusal: false,
      reason: 'catalog_internship_policy_fact',
    }
  }

  if (/(?:kac gun|kaç gün|ne kadar sur|sure|suresi|süresi)/.test(search)) {
    return {
      answer:
        'Uygulamalı Eğitimler Yönergesine göre staj süresi 20 iş gününden az olmamak üzere ilgili programın niteliğine göre belirlenir. Staj için AKTS kredisi belirlemek zorunludur; staj kredisi toplamı 5 AKTS kredisinden az, 10 AKTS kredisinden fazla olamaz. Kesin gün sayısı için programın niteliği ve ilgili program kuralları doğrulanmalıdır.',
      citations: [INTERNSHIP_POLICY_CITATION],
      refusal: false,
      reason: 'catalog_internship_policy_fact',
    }
  }

  if (/(?:ucretli|ücretli|ucret|ücret|para|maas|maaş)/.test(search)) {
    return {
      answer:
        'Uygulamalı Eğitimler Yönergesinde staj yapan öğrencilere ödenecek ücretler için 3308 sayılı Kanunun 25. maddesinin uygulanacağı belirtilir. Tıp Fakültesi intörnlük uygulaması kapsamında işletmede mesleki eğitim yapan öğrenciler için 2547 sayılı Kanunun ek 29. maddesi uygulanır. Net tutar veya ödeme uygulaması program ve işletme türüne göre doğrulanmalıdır.',
      citations: [INTERNSHIP_POLICY_CITATION],
      refusal: false,
      reason: 'catalog_internship_policy_fact',
    }
  }

  if (/(?:sigorta|is kazasi|iş kazası|meslek hastaligi|meslek hastalığı)/.test(search)) {
    return {
      answer:
        'Uygulamalı Eğitimler Yönergesinde staj yapan öğrenciler için iş kazası ve meslek hastalığı sigortası uygulanacağı; bu kapsamda ödenecek primlerin Üniversite tarafından karşılanacağı belirtilir. Program ve staj türü yine ilgili birimle doğrulanmalıdır.',
      citations: [INTERNSHIP_POLICY_CITATION],
      refusal: false,
      reason: 'catalog_internship_policy_fact',
    }
  }

  if (
    /(?:staj yeri|staj yerini|yerini.*ayarl|ayarl|yerlestir|yerleştir|garanti|buluyor|kendisi mi bul|universite mi|üniversite mi)/.test(
      search
    )
  ) {
    return {
      answer:
        'Onaylı kaynaklarda öğrenciye staj yeri garantisi verildiğine dair net bilgi bulunmamaktadır. Uygulamalı Eğitimler Yönergesi stajların komisyon veya alt komisyonlar tarafından değerlendirildiğini, uygun görüşle işletme değişikliği yapılabileceğini ve stajın program/işletme koşullarına bağlı olduğunu gösterir. Karar için program, staj türü, komisyon/onay süreci ve ilgili işletme birlikte doğrulanmalıdır.',
      citations: [INTERNSHIP_POLICY_CITATION],
      refusal: true,
      reason: 'catalog_internship_policy_fact',
    }
  }

  if (/(?:hangi sinif|hangi sınıf|ne zaman|yaz staji zorunlu|yaz stajı zorunlu)/.test(search)) {
    return {
      answer:
        'Genel Uygulamalı Eğitimler Yönergesi stajın hangi sınıfta yapılacağını tüm programlar için tek bir sınıf olarak belirtmez. Onaylı kaynaklarda Tıp için klinik stajlar Dönem IV ve Dönem V’te, intörnlük Dönem VI’da; Ergoterapi için 2. sınıf ve 3. sınıf yaz stajları ile 4. sınıf klinik uygulama stajı listelenir. Diğer programlar için kesin sınıf/dönem bilgisi program bazında doğrulanmalıdır.',
      citations: [INTERNSHIP_POLICY_CITATION, CLINICAL_TRAINING_CITATION, ERGOTHERAPY_TRAINING_CITATION],
      refusal: false,
      reason: 'catalog_internship_policy_fact',
    }
  }

  if (/(?:mezuniyet|mezun olabilir|mezun olur|staj yapmazsam)/.test(search)) {
    return {
      answer:
        'Uygulamalı Eğitimler Yönergesine göre staj için AKTS kredisi belirlemek zorunludur ve bu krediler mezuniyet kredisi hesabına dahil edilir. Stajları başarısız olarak değerlendirilen öğrenciler yeniden staj yapmak zorundadır. Bu nedenle programında zorunlu staj veya uygulama bulunan öğrenciler için ilgili staj/uygulama tamamlanmadan mezuniyet koşulu sağlanmış sayılmamalıdır; kesin cevap program bazında doğrulanmalıdır.',
      citations: [INTERNSHIP_POLICY_CITATION],
      refusal: false,
      reason: 'catalog_internship_policy_fact',
    }
  }

  if (/(?:nobet|nöbet)/.test(search)) {
    return {
      answer:
        'Tıp Fakültesi Dönem VI intörnlük stajlarında eğitim-öğretim alanları ve nöbet uygulamalarında programlama, uygulama ve denetimin ilgili klinikler tarafından yürütüldüğü belirtilir. Diğer programlarda nöbet olup olmadığı program bazında değişebileceği için ilgili bölüm/program doğrulanmalıdır.',
      citations: [CLINICAL_TRAINING_CITATION],
      refusal: false,
      reason: 'catalog_internship_policy_fact',
    }
  }

  return null
}

function resolveClinicalPracticeScopeGuard(search: string): StrictCatalogAnswer | null {
  const asksActivePracticeScope =
    /(?:hasta bakimi|hasta bakımı|sadece gozlem|sadece gözlem|aktif uygulama|hasta basi|hasta başı|gercek hasta|gerçek hasta)/.test(
      search
    )
  if (!asksActivePracticeScope) return null

  return {
    answer:
      'Hasta bakımı, sadece gözlem olup olmama, hasta başı eğitim veya aktif uygulama düzeyi program, sınıf/dönem ve klinik uygulama türüne göre değişir. Onaylı kaynaklarda Tıp için Dönem IV-V klinik stajları ve Dönem VI intörnlük süreci listelenir; ancak tüm programlar için “sadece gözlem” ya da “aktif hasta bakımı” şeklinde tek bir kural net bilgi olarak bulunmamaktadır. Kesin cevap için programı belirtmeniz ve ilgili klinik uygulama/staj yönergesinin doğrulanması gerekir.',
    citations: [CLINICAL_TRAINING_CITATION, CLINICAL_PROGRAM_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_clinical_practice_scope_guard',
  }
}

function hasHousingTerm(search: string) {
  return /(?:^|\s)(?:yurt|yurdu|yurtlar|yurtlari|yurtlarda|konaklama)(?:\s|$)/.test(search)
}

function resolveHousingFact(search: string): StrictCatalogAnswer | null {
  if (!hasHousingTerm(search)) return null
  if (/(?:ucret|fiyat|kac para|kac tl)/.test(search)) return null

  if (/(?:anlasmali yurt|yurt.*anlasma|protokol|universitenin anlasmali yurdu)/.test(search)) {
    return {
      answer:
        'Evet. Onaylı konaklama kaynaklarında üniversitenin anlaşmalı/indirimli yurt protokol listesi yer almaktadır. Örnekler: Fırat Erkek Öğrenci Yurdu için %15, Çiğdem Kız Öğrenci Yurdu için %20 ve Özel Nil Kız Öğrenci Yurdu için %10 indirim bilgisi listelenmiştir. Üniversitenin kendine ait yurdu olduğu sonucuna buradan gidilmemelidir.',
      citations: [HOUSING_AGREEMENT_CITATION],
      refusal: false,
      reason: 'catalog_housing_agreement_fact',
    }
  }

  const asksUnsupportedScope =
    /(?:kiz yurdu|erkek yurdu|kiz ogrenci yurdu|erkek ogrenci yurdu|kampus icinde|kampuse yakin|yakinlarda|devlet yurdu|kyk|ozel yurt|anlasmali yurt|kendi yurdu|yurt garanti|garanti|yardimci|basvuru|nasil yap|nerede kal|sehir disindan gelen)/.test(
      search
    )
  if (asksUnsupportedScope) {
    return {
      answer:
        'Onaylı kaynaklarda yurtlar/konaklama için resmi bilgilendirme sayfası bağlantısı yer alır. Ancak kız/erkek yurdu, kampüs içinde yurt, kampüse yakınlık, özel/devlet yurdu, yurt başvuru süreci, yurt garantisi veya üniversitenin konaklama yerleştirme desteği hakkında net bilgi bulunmamaktadır. Karar için üniversitenin yurt/konaklama sayfası, başvuru takvimi, yurt türü ve güncel protokol listesi birlikte doğrulanmalıdır.',
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

function matchesDoubleMajorProgram(search: string, program: string) {
  const normalizedProgram = normalizeStrictQuestionSearch(program)
  if (search.includes(normalizedProgram)) return true
  if (program === 'Tıbbi Laboratuvar Teknikleri') return /tibbi laboratuvar/.test(search)
  if (program === 'Tıbbi Dokümantasyon ve Sekreterlik') return /tibbi dokumantasyon/.test(search)
  if (program === 'Tıbbi Tanıtım ve Pazarlama') return /tibbi tanitim/.test(search)
  return false
}

function resolveDoubleMajorFact(search: string): StrictCatalogAnswer | null {
  const asksDoubleMajor = /(?:cift anadal|cap|anadal)/.test(search)
  if (!asksDoubleMajor) return null

  if (/(?:ikinci diploma|diploma al|diploma ver|ikinci on lisans)/.test(search)) {
    return {
      answer:
        'Evet. Çift anadal programı, öğrencinin yerleştiği program dışında ikinci diploma, yani ikinci bir ön lisans diploması almak üzere öğrenim görmesini sağlayan program olarak açıklanmaktadır.',
      citations: [DOUBLE_MAJOR_CITATION],
      refusal: false,
      reason: 'catalog_double_major_fact',
    }
  }

  if (/tip/.test(search)) {
    return {
      answer: `Onaylı broşürde çift anadal kapsamı ön lisans programları için listelenmiştir; Tıp Fakültesi bu listede listelenmemektedir. Listelenen programlar: ${DOUBLE_MAJOR_PROGRAMS.join(', ')}.`,
      citations: [DOUBLE_MAJOR_CITATION],
      refusal: true,
      reason: 'catalog_double_major_fact',
    }
  }

  const mentionedPrograms = DOUBLE_MAJOR_PROGRAMS.filter((program) =>
    matchesDoubleMajorProgram(search, program)
  )
  const matchedPair = DOUBLE_MAJOR_PAIRS.find(
    ([first, second]) => mentionedPrograms.includes(first) && mentionedPrograms.includes(second)
  )
  if (matchedPair) {
    return {
      answer: `Evet. Onaylı çift anadal bilgisinde ${matchedPair[0]} ile ${matchedPair[1]} arasında çift anadal yapılabilecek program eşleşmesi listelenmektedir.`,
      citations: [DOUBLE_MAJOR_CITATION],
      refusal: false,
      reason: 'catalog_double_major_fact',
    }
  }

  const asksListing =
    /(?:hangi|var mi|varmi|yapabiliyor|yapabilir|program|aralarinda|arasında|on lisans|onlisans)/.test(
      search
    )
  if (!asksListing) return null

  return {
    answer: `Broşürde ön lisans çift anadal için listelenen programlar: ${DOUBLE_MAJOR_PROGRAMS.join(', ')}.`,
    citations: [DOUBLE_MAJOR_CITATION],
    refusal: false,
    reason: 'catalog_double_major_fact',
  }
}

function resolveScholarshipFact(search: string): StrictCatalogAnswer | null {
  const asksBursluFee =
    /burslu/.test(search) &&
    /(?:ucret od|ucret oder|ucret oduyor|ucretli mi|para od|para oder|ucret)/.test(search)
  if (asksBursluFee) {
    return {
      answer:
        'Burslu kontenjan, tercih bursu ve akademik başarı bursu gibi indirim burslarından ayrı değerlendirilmelidir. Broşürde program ücret tablolarında Burslu satırlarının fiyat alanı "-" olarak gösterilir; Ücretli ve %50 indirimli satırlarda tutar yer alır. Kayıt sırasında varsa ek ödeme veya koşullar için resmi kayıt ve burs duyuruları kontrol edilmelidir.',
      citations: [PROGRAM_FEE_CITATION, SCHOLARSHIP_CITATION],
      refusal: false,
      reason: 'catalog_scholarship_fact',
    }
  }

  const asksBursluVsPaid =
    /burslu kontenjan/.test(search) &&
    /ucretli kontenjan/.test(search) &&
    /(?:fark|ne demek|nedir)/.test(search)
  if (asksBursluVsPaid) {
    return {
      answer:
        'Burslu kontenjan ile ücretli kontenjan program ücret tablosunda ayrı satırlar olarak listelenir. Broşürde Burslu satırlarının fiyat alanı "-" olarak gösterilir; Ücretli satırlarda ilgili programın tam ücret tutarı yer alır. Tercih bursu, akademik başarı bursu ve diğer indirim bursları ise ayrıca koşulları olan burs/indirim başlıklarıdır.',
      citations: [PROGRAM_FEE_CITATION, SCHOLARSHIP_CITATION],
      refusal: false,
      reason: 'catalog_scholarship_fact',
    }
  }

  const asksPreferenceScope =
    /tercih bursu/.test(search) &&
    /(?:tum bolum|tum program|her bolum|her program|butun bolum|ucretli program|ucretli kontenjan|gecerli mi|kapsam)/.test(
      search
    )
  if (asksPreferenceScope) {
    const topic = /ucretli/.test(search) ? 'ücretli programlarda' : 'tüm bölümlerde'
    return {
      answer: `Tercih bursunda 1. sırada yerleşenlere %10, 2. sırada %7, 3. sırada %5 indirim listelenmiştir. Ancak broşürde tercih bursunun ${topic} geçerli olduğuna dair net bilgi bulunmamaktadır. Karar için program türü, tercih sırası ve ilgili akademik yılın resmi burs/kayıt duyurusu birlikte doğrulanmalıdır.`,
      citations: [SCHOLARSHIP_CITATION],
      refusal: true,
      reason: 'catalog_scholarship_scope_guard',
    }
  }

  const asksPreferenceRates =
    /tercih bursu/.test(search) || /(?:^|\s)1\s*tercih/.test(search)
  if (asksPreferenceRates) {
    return {
      answer:
        'Tercih bursunda Yüksek İhtisas Üniversitesine 1. sırada tercih ederek yerleşen öğrencilere yıllık eğitim öğretim ücretinden %10, 2. sırada yerleşenlere %7, 3. sırada yerleşenlere %5 indirim uygulanır.',
      citations: [SCHOLARSHIP_CITATION],
      refusal: false,
      reason: 'catalog_scholarship_fact',
    }
  }

  const asksFirstThousand =
    /(?:ilk\s*1000|1000.*(?:burs|gir)|501\s*-?\s*1000)/.test(search) &&
    /(?:burs|gir|siralama)/.test(search)
  if (asksFirstThousand) {
    return {
      answer:
        'Evet. YKS Üstün Başarı Bursunda 501-1000 sıralama aralığı için her akademik yılda 8 ay boyunca 7.000,00 TL karşılıksız burs listelenmiştir.',
      citations: [SCHOLARSHIP_CITATION],
      refusal: false,
      reason: 'catalog_scholarship_fact',
    }
  }

  const asksYksScholarship =
    /(?:yks|ustun basari|ilk\s*100|ilk\s*500|ilk\s*10000)/.test(search) &&
    /burs/.test(search)
  if (asksYksScholarship) {
    return {
      answer:
        'YKS Üstün Başarı Bursunda akademik yıllar süresince her sene 8 ay karşılıksız burs imkanı listelenmiştir: ilk 100 için 30.000,00 TL, 101-500 için 10.000,00 TL, 501-1000 için 7.000,00 TL, 1001-10000 için 5.000,00 TL.',
      citations: [SCHOLARSHIP_CITATION],
      refusal: false,
      reason: 'catalog_scholarship_fact',
    }
  }

  return null
}

function resolveProgramFeeFact(search: string): StrictCatalogAnswer | null {
  const asksPrice = /(?:ucret|kac para|kac tl|fiyat|tl)/.test(search)
  if (!asksPrice) return null

  const asksBroadProgramFees =
    /(?:2025|ucretleri|ucretler|fiyatlari|fiyatlar)/.test(search) &&
    !/(?:yurt|servis|yemek|staj|basvuru|kimlik|onluk|yaz okulu|tek ders|ek sinav|yatay gecis)/.test(
      search
    ) &&
    !/(?:kdv|taksit|pesin|peşin|online|iban|kredi kart|kayit sirasinda|kayıt sırasında|hazirlik|hazırlık|her yil|her yıl|kesin mi|web sitesi|website|brosur|broşür)/.test(
      search
    )
  if (asksBroadProgramFees) {
    return {
      answer:
        '2025 broşüründe ücretler program ve burs/indirim satırı bazında listelenir. Kısa özet: Tıp Fakültesi 720.000 TL, %50 indirimli 360.000 TL; Beslenme ve Diyetetik, Dil ve Konuşma Terapisi, Fizyoterapi ve Rehabilitasyon ve Hemşirelik 490.000 TL, %50 indirimli 245.000 TL; Sağlık Yönetimi, Ergoterapi ve Ebelik 460.000 TL, %50 indirimli 230.000 TL; Antrenörlük Eğitimi 380.000 TL, %50 indirimli 190.000 TL; birçok ön lisans programı 330.000 TL, %50 indirimli 165.000 TL; Grafik Tasarım ve Elektrik 300.000 TL, %50 indirimli 150.000 TL. Burslu satırlarda fiyat alanı "-" olarak gösterilir. Net cevap için programı belirtirseniz ilgili satırı söyleyebilirim.',
      citations: [PROGRAM_FEE_CITATION],
      refusal: false,
      reason: 'catalog_program_fee_fact',
    }
  }

  const program = PROGRAM_FEE_FACTS.find((fact) => includesAlias(search, fact.aliases))
  if (!program) return null

  return {
    answer: `${program.name} için 2025 broşüründe Ücretli fiyat ${program.paid}, %50 indirimli fiyat ${program.discounted50} olarak listelenir. Burslu kontenjan satırında fiyat alanı "-" olarak gösterilir.`,
    citations: [PROGRAM_FEE_CITATION],
    refusal: false,
    reason: 'catalog_program_fee_fact',
  }
}

function resolvePaymentPolicyScopeFact(search: string): StrictCatalogAnswer | null {
  if (/(?:kart bilg|kart numara|cvv|cvc|kredi kart.{0,40}(?:yaz|paylas|gonder|ver|buraya))/.test(search)) {
    return null
  }

  const asksSourceConflict =
    /(?:web sitesi|website|site).{0,80}(?:ucret|fiyat)|(?:ucret|fiyat).{0,80}(?:web sitesi|website|site)/.test(
      search
    ) && /(?:brosur|broşür|farkli|farklı|hangisi gecerli|gecerli)/.test(search)
  const asksPaymentChannel =
    /(?:iban|online od|online ödeme|odeme online|ödeme online|odeme kanali|ödeme kanalı|kripto)/.test(
      search
    )
  const asksPaymentTerms =
    /(?:kdv|pesin|peşin|taksit|kredi kartina taksit|kredi karti taksit|kayit sirasinda|kayıt sırasında|ne kadar odeme|ne kadar ödeme|hazirlik sinifinda ucret|hazırlık sınıfında ücret|her yil art|her yıl art|2026 ucret|2026 ücret|ucretler belli|ücretler belli|brosurdeki ucret|broşürdeki ücret|kesin mi)/.test(
      search
    )
  if (!asksSourceConflict && !asksPaymentChannel && !asksPaymentTerms) return null

  if (asksSourceConflict) {
    return {
      answer:
        'Web sitesi ile broşürdeki ücret farklı görünüyorsa bu bot tek başına hangisinin geçerli olduğunu kesinleştirmemelidir. Geçerli ücret için aynı akademik yıl, program, burs/indirim türü, KDV ve ödeme koşullarını içeren güncel resmi ücret/kayıt duyurusu esas alınarak doğrulama yapılmalıdır.',
      citations: [PAYMENT_POLICY_SCOPE_CITATION, PROGRAM_FEE_CITATION],
      refusal: true,
      reason: 'catalog_payment_policy_scope_guard',
    }
  }

  if (/iban/.test(search)) {
    return {
      answer:
        'IBAN bilgisi bu sohbetten gönderilmemelidir; onaylı kaynaklarda bu botun paylaşabileceği doğrulanmış bir IBAN bilgisi bulunmamaktadır. Ödeme için yalnızca üniversitenin güncel resmi ödeme ve kayıt kanalları kullanılmalı; program, akademik yıl, ödeme yöntemi ve alıcı hesabı resmi kanaldan doğrulanmalıdır.',
      citations: [PAYMENT_POLICY_SCOPE_CITATION],
      refusal: true,
      reason: 'catalog_payment_policy_scope_guard',
    }
  }

  if (/kripto/.test(search)) {
    return {
      answer:
        'Kripto para ile ödeme kabul edildiğine dair onaylı kaynaklarda net bilgi bulunmamaktadır. Ödeme için yalnızca üniversitenin güncel resmi ödeme ve kayıt kanalları kontrol edilmelidir; geçerli ödeme yöntemi, akademik yıl ve resmi ödeme ekranı birlikte doğrulanmalıdır.',
      citations: [PAYMENT_POLICY_SCOPE_CITATION],
      refusal: true,
      reason: 'catalog_payment_policy_scope_guard',
    }
  }

  const topic = (() => {
    if (/kdv/.test(search)) return 'KDV dahil olup olmadığı'
    if (/(?:taksit|kredi kartina taksit|kredi karti taksit)/.test(search)) return 'taksit veya kredi kartı taksit koşulu'
    if (/(?:pesin|peşin)/.test(search)) return 'peşin ödeme zorunluluğu'
    if (/(?:online od|odeme online|ödeme online)/.test(search)) return 'online ödeme imkanı'
    if (/(?:kayit sirasinda|kayıt sırasında|ne kadar odeme|ne kadar ödeme)/.test(search)) {
      return 'kayıt sırasında ödenecek tutar'
    }
    if (/(?:hazirlik sinifinda ucret|hazırlık sınıfında ücret)/.test(search)) {
      return 'hazırlık sınıfı ücreti'
    }
    if (/(?:her yil art|her yıl art)/.test(search)) return 'ücretlerin yıllık artış koşulu'
    if (/(?:2026 ucret|2026 ücret|ucretler belli|ücretler belli)/.test(search)) {
      return '2026/2026-2027 ücretlerinin kesinleşip kesinleşmediği'
    }
    return 'ödeme koşulu'
  })()

  return {
    answer: `${topic} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Broşürde program ücretleri program ve burs/indirim türü bazında listelenir; ancak KDV, taksit, peşin/online ödeme, kayıt anında ödeme veya yıllık artış gibi ödeme koşulları ayrıca güncel resmi ücret/kayıt duyurusundan doğrulanmalıdır. Karar için akademik yıl, program, burs/indirim durumu, KDV ve resmi ödeme kanalı birlikte kontrol edilmelidir.`,
    citations: [PAYMENT_POLICY_SCOPE_CITATION, PROGRAM_FEE_CITATION],
    refusal: true,
    reason: 'catalog_payment_policy_scope_guard',
  }
}

function resolveAdmissionsMetricScopeFact(search: string): StrictCatalogAnswer | null {
  const asksBaseScores = /(?:taban puan|puanlar nedir|puanlari nedir)/.test(search)
  const asksRanks = /(?:basari siral|başarı sıral|siralama nedir|sıralama nedir)/.test(search)
  if (!asksBaseScores && !asksRanks) return null

  const metric = asksBaseScores ? '2024 taban puanı' : '2024 başarı sırası'
  return {
    answer: `Broşürde ${metric}, puan türü ve 2025 kontenjan bilgileri program ve burs/indirim satırı bazında listelenir. Tüm tablo geniş olduğu için hangi programı ve hangi burs/indirim türünü sorduğunuzu belirtmeniz gerekir; örneğin Tıp, Dil ve Konuşma Terapisi, Anestezi veya Bilgisayar Programcılığı gibi. Bu veriler geçmiş yıl referansıdır; kesin yerleşme garantisi vermez.`,
    citations: [ADMISSIONS_METRIC_CITATION, ADMISSIONS_DECISION_SCOPE_CITATION],
    refusal: false,
    reason: 'catalog_admissions_metric_scope_guard',
  }
}

function resolveAdmissionsPointTypeFact(search: string): StrictCatalogAnswer | null {
  const asksPointType =
    /(?:^|\s)(?:say|ea|tyt)(?:\s|$)/.test(search) &&
    /(?:bolum|program|puan tur|puan tür|hangi|var mi|varmi)/.test(search)
  if (!asksPointType) return null

  const pointType = /(?:^|\s)say(?:\s|$)/.test(search)
    ? 'SAY'
    : /(?:^|\s)ea(?:\s|$)/.test(search)
      ? 'EA'
      : 'TYT'
  const programs = ADMISSIONS_POINT_TYPE_PROGRAMS[pointType]

  return {
    answer: `${pointType} puan türüyle broşürde listelenen programlar: ${programs.join(', ')}. Puan türü, kontenjan, taban puan ve başarı sırası programın burs/indirim satırına göre değişebilir; tercih kararı için ilgili program satırı ayrıca kontrol edilmelidir.`,
    citations: [ADMISSIONS_METRIC_CITATION],
    refusal: false,
    reason: 'catalog_admissions_point_type_fact',
  }
}

function resolveAdmissionsDecisionGuard(search: string): StrictCatalogAnswer | null {
  const asksPersonalPlacement =
    /(?:kazanir miyim|kazanır mıyım|kesin kazan|kesin gir|yerlesebilir miyim|yerleşebilir miyim|bu siralamayla|bu sıralamayla|gecen yilki siralamayla|geçen yılki sıralamayla|puanim su|puanım şu|siralamam su|sıralamam şu|hangi bolumleri yazmaliyim|hangi bölümleri yazmalıyım|tercih listesi|tercihlerimi|kesin kazanacagim|kesin kazanacağım)/.test(
      search
    )
  if (!asksPersonalPlacement) return null

  if (/(?:tercih listesi|hangi bolumleri yazmaliyim|hangi bölümleri yazmalıyım|tercihlerimi)/.test(search)) {
    return {
      answer:
        'Nihai tercih listesi hazırlayamam veya sizin yerinize tercih kararı veremem. Broşürdeki puan türü, 2025 kontenjanı, 2024 taban puanı ve başarı sırası verileriyle seçenekleri karşılaştırabilirim; bunun için puanınızı veya başarı sıralamanızı, puan türünüzü, program ilgisi/önceliğinizi ve burs/indirim tercihinizi belirtmeniz gerekir. Kesin kazanma ya da yerleşme garantisi verilemez.',
      citations: [ADMISSIONS_METRIC_CITATION, ADMISSIONS_DECISION_SCOPE_CITATION],
      refusal: true,
      reason: 'catalog_admissions_decision_guard',
    }
  }

  if (/(?:gecen yilki siralamayla|geçen yılki sıralamayla)/.test(search)) {
    return {
      answer:
        'Geçmiş yıl taban puanı ve başarı sırası yalnızca referans veridir; geçen yılki sıralamayla bu yıl yerleşme garantisi verilemez. Kontenjan, aday tercihleri, puan türü, burs/indirim satırı ve yıllık talep değişebilir. Karşılaştırma yapabilmem için hedef programı, puan türünüzü ve başarı sıralamanızı belirtmeniz gerekir.',
      citations: [ADMISSIONS_METRIC_CITATION, ADMISSIONS_DECISION_SCOPE_CITATION],
      refusal: true,
      reason: 'catalog_admissions_decision_guard',
    }
  }

  return {
    answer:
      'Kesin kazanma veya yerleşme garantisi veremem. Broşürdeki 2025 kontenjanı, 2024 taban puanı ve 2024 başarı sırası verileriyle karşılaştırma yapılabilir; bunun için puanınızı veya başarı sıralamanızı, puan türünüzü, hedef programı ve burs/indirim türünü belirtmeniz gerekir. Son yerleşme sonucu ÖSYM tercih süreci, kontenjan ve aday tercih dağılımına bağlıdır.',
    citations: [ADMISSIONS_METRIC_CITATION, ADMISSIONS_DECISION_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_admissions_decision_guard',
  }
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
    /(?:nasil|online|kesin kayit|e devlet|kampuse gel|tarih|saat|randevu|eksik belge|hangi belge|belgeler|baskasinin yerine|resit olmayan|vazgecersem|ucret iadesi|kayit ofisi)/.test(
      search
    )
  if (!asksRegistrationScope) return null

  return {
    answer:
      'Aday öğrenci kayıt sürecinde online kayıt, kesin kayıt belgeleri, kayıt tarihleri, randevu veya kampüse gelme zorunluluğu hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Bu bilgiler başvuru türü ve döneme göre değişebileceği için üniversitenin güncel resmi kayıt duyuruları kontrol edilmelidir. Karar için aday türü, kayıt dönemi, gerekli belge ve başvuru kanalı birlikte doğrulanmalıdır.',
    citations: [REGISTRATION_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_registration_scope_guard',
  }
}

function resolveProfessionalAuthorityScopeFact(search: string): StrictCatalogAnswer | null {
  const asksProfessionalAuthority =
    /(?:eczaci olur|eczane ac|gozlukcu ac|optik ac|ambulans kullan|ambulans sur|doktor der|hacker olur|is garantisi|direkt hastaneye al|dogrudan is bul|is bul|is imkani|is olanagi|en kolay is|en kolay bolum|en zor bolum|en cok maas|maas|en zengin)/.test(
      search
    )
  if (!asksProfessionalAuthority) return null

  return {
    answer:
      'Program mezuniyeti, mesleki yetki, iş yeri açma, araç kullanma, unvan kullanımı veya iş garantisi için otomatik garanti anlamına gelmez. Onaylı kaynaklarda bu konuda net bilgi bulunmamaktadır; ilgili meslek mevzuatı, yetkili kurum kuralları ve resmi kariyer/mezuniyet koşulları kontrol edilmelidir. Karar için mezuniyet unvanı, ilgili mevzuat, yetkili kurum koşulları ve iş ilanı/atama şartı birlikte doğrulanmalıdır.',
    citations: [PROFESSIONAL_AUTHORITY_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_professional_authority_scope_guard',
  }
}

function resolveContactScopeFact(search: string): StrictCatalogAnswer | null {
  const asksUnsupportedMessagingLine =
    /(?:whatsapp|danisma hatti|danisma hatt|aday.*hatti|iletisim hatti)/.test(search) &&
    /(?:var mi|varmi|mevcut mu|telefon|numara|hatti|hatt|danisma|iletisim)/.test(search)

  if (!asksUnsupportedMessagingLine) return null

  return {
    answer:
      'WhatsApp danışma hattı, aday öğrenci WhatsApp hattı veya özel iletişim hattı hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Karar için üniversitenin resmi iletişim sayfası, ilgili birim ve güncel başvuru dönemi birlikte doğrulanmalıdır.',
    citations: [CONTACT_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_contact_scope_guard',
  }
}

function resolveOffTopicScopeFact(
  question: string,
  understanding: StrictQuestionUnderstanding
): StrictCatalogAnswer | null {
  if (!understanding.intents.includes('off_topic')) return null

  const search = understanding.normalizedSearch
  if (
    /(?:chatgpt|gercek insan|ogrenci misin|sen kimsin|yapay zeka misin|ai misin|asistan misin)/.test(
      search
    )
  ) {
    return {
      answer:
        'Ben Qualy AI destek asistanıyım; gerçek insan ya da öğrenci değilim. Yüksek İhtisas Üniversitesi ile ilgili program, ücret, burs, kontenjan, kampüs ve kayıt süreci sorularınızı onaylı kaynaklara göre yanıtlamak için buradayım.',
      citations: [OFF_TOPIC_SCOPE_CITATION],
      refusal: false,
      reason: 'catalog_off_topic_scope_guard',
    }
  }

  const topic = question
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    answer: `${topic} üniversitenin onaylı aday öğrenci dokümanlarında yer alan bir başlık değildir. Yüksek İhtisas Üniversitesi'nin programları, ücretleri, bursları, kontenjanları, kampüsleri veya kayıt süreciyle ilgili sorularınızı yanıtlayabilirim.`,
    citations: [OFF_TOPIC_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_off_topic_scope_guard',
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
      'Güncel tanıtım günü, kampüs etkinliği, kampüs gezisi, laboratuvar gezisi veya bölüm hocalarıyla görüşme gibi aday etkinliği ayrıntıları hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Bu bilgiler dönemsel olabileceği için üniversitenin güncel resmi duyuruları veya aday öğrenci birimi kontrol edilmelidir. Karar için etkinlik tarihi, yerleşke, laboratuvar türü ve aday etkinliği başvuru kanalı birlikte doğrulanmalıdır.',
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
  const institutionLocationFact = resolveInstitutionLocationFact(understanding.normalizedSearch)
  if (institutionLocationFact) return institutionLocationFact
  const affiliatedHospitalDefinitionFact = resolveAffiliatedHospitalDefinitionFact(
    understanding.normalizedSearch
  )
  if (affiliatedHospitalDefinitionFact) return affiliatedHospitalDefinitionFact
  const hospitalScopeFact = resolveHospitalScopeFact(understanding.normalizedSearch)
  if (hospitalScopeFact) return hospitalScopeFact
  const doubleMajorFact = resolveDoubleMajorFact(understanding.normalizedSearch)
  if (doubleMajorFact) return doubleMajorFact
  const scholarshipFact = resolveScholarshipFact(understanding.normalizedSearch)
  if (scholarshipFact) return scholarshipFact
  const programFeeFact = resolveProgramFeeFact(understanding.normalizedSearch)
  if (programFeeFact) return programFeeFact
  const paymentPolicyScopeFact = resolvePaymentPolicyScopeFact(understanding.normalizedSearch)
  if (paymentPolicyScopeFact) return paymentPolicyScopeFact
  const admissionsDecisionGuard = resolveAdmissionsDecisionGuard(understanding.normalizedSearch)
  if (admissionsDecisionGuard) return admissionsDecisionGuard
  const admissionsMetricScopeFact = resolveAdmissionsMetricScopeFact(understanding.normalizedSearch)
  if (admissionsMetricScopeFact) return admissionsMetricScopeFact
  const admissionsPointTypeFact = resolveAdmissionsPointTypeFact(understanding.normalizedSearch)
  if (admissionsPointTypeFact) return admissionsPointTypeFact
  const offTopicScopeFact = resolveOffTopicScopeFact(input.question, understanding)
  if (offTopicScopeFact) return offTopicScopeFact
  const clinicalTrainingFact = resolveClinicalTrainingFact(understanding.normalizedSearch)
  if (clinicalTrainingFact) return clinicalTrainingFact
  const ergotherapyTrainingFact = resolveErgotherapyTrainingFact(understanding.normalizedSearch)
  if (ergotherapyTrainingFact) return ergotherapyTrainingFact
  const internshipPolicyFact = resolveInternshipPolicyFact(understanding.normalizedSearch)
  if (internshipPolicyFact) return internshipPolicyFact
  const clinicalPracticeScopeGuard = resolveClinicalPracticeScopeGuard(
    understanding.normalizedSearch
  )
  if (clinicalPracticeScopeGuard) return clinicalPracticeScopeGuard
  const clinicalProgramClarification = resolveClinicalProgramClarification(
    understanding.normalizedSearch
  )
  if (clinicalProgramClarification) return clinicalProgramClarification
  const clinicalProgramScopeGuard = resolveClinicalProgramScopeGuard(
    understanding.normalizedSearch,
    understanding
  )
  if (clinicalProgramScopeGuard) return clinicalProgramScopeGuard
  const housingFact = resolveHousingFact(understanding.normalizedSearch)
  if (housingFact) return housingFact
  const credentialScopeFact = resolveCredentialScopeFact(understanding.normalizedSearch)
  if (credentialScopeFact) return credentialScopeFact
  const professionalAuthorityScopeFact = resolveProfessionalAuthorityScopeFact(
    understanding.normalizedSearch
  )
  if (professionalAuthorityScopeFact) return professionalAuthorityScopeFact
  const contactScopeFact = resolveContactScopeFact(understanding.normalizedSearch)
  if (contactScopeFact) return contactScopeFact
  const candidateEventScopeFact = resolveCandidateEventScopeFact(understanding.normalizedSearch)
  if (candidateEventScopeFact) return candidateEventScopeFact
  const reputationScopeFact = resolveReputationScopeFact(understanding.normalizedSearch)
  if (reputationScopeFact) return reputationScopeFact
  const registrationScopeFact = resolveRegistrationScopeFact(understanding.normalizedSearch)
  if (registrationScopeFact) return registrationScopeFact
  const facilityResourceScopeFact = resolveFacilityResourceScopeFact(understanding)
  if (facilityResourceScopeFact) return facilityResourceScopeFact
  const campusLifeFact = resolveCampusLifeFact(understanding.normalizedSearch)
  if (campusLifeFact) return campusLifeFact
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
