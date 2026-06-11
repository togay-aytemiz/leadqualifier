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
  | 'catalog_program_duration_fact'
  | 'catalog_program_professional_title_fact'
  | 'catalog_program_fee_fact'
  | 'catalog_payment_policy_scope_guard'
  | 'catalog_admissions_metric_scope_guard'
  | 'catalog_admissions_decision_guard'
  | 'catalog_admissions_point_type_fact'
  | 'catalog_institution_fact'
  | 'catalog_institution_location_fact'
  | 'catalog_campus_program_listing'
  | 'catalog_campus_transport_fact'
  | 'catalog_campus_transport_scope_guard'
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
  | 'catalog_accreditation_scope_guard'
  | 'catalog_recognition_scope_guard'
  | 'catalog_credential_scope_guard'
  | 'catalog_registration_scope_guard'
  | 'catalog_academic_process_scope_guard'
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
    'YİÜ kaynaklarında 100. Yıl, Bağlıca, Balgat ve Bağlum yerleşkeleri Ankara adresleriyle listelenir.',
}

const CAMPUS_PROGRAM_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:campus-programs',
  title: 'YİÜ Tanıtım Broşürü - Fakülte, Program ve Yerleşke Eşleşmeleri',
  quote:
    'Broşürde Tıp Fakültesi 100. Yıl, Sağlık Bilimleri Fakültesi Bağlıca, Spor Bilimleri Fakültesi/Meslek Yüksekokulu/Sağlık Hizmetleri MYO programları Balgat ve Bağlum yerleşkeleriyle eşleştirilir.',
}

const CAMPUS_TRANSPORT_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:campus-transport',
  title: 'YİÜ Tanıtım Broşürü - Yerleşke, İletişim ve Ulaşım Bilgileri',
  url: 'https://yuksekihtisasuniversitesi.edu.tr/duyuru/universitemizde-yeni-duzenleme-kapsaminda-yapilan-yerleske-konumlari-guncellendi',
  quote:
    'Broşürde yerleşke adresleri, genel telefon, Bağlum telefonu ve ulaşım bilgileri için resmi bağlantı yer alır; servis saat/güzergah/ücret ayrıntıları ayrıca doğrulanmalıdır.',
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
    'Kampüs yaşamı, Wi-Fi, kafe/kantin, yemekhane, yemek fiyatları, spor salonu, vejetaryen yemek, güvenlik, otopark ve kampüs çevresi konaklama gibi güncel imkan bilgileri onaylı aday öğrenci kaynaklarında net doğrulanmadan var cevabı olarak verilmemelidir.',
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

const ACADEMIC_PROCESS_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:academic-process-scope',
  title: 'YİÜ Akademik Süreç, Devam ve Hazırlık Kapsamı',
  quote:
    'Devam zorunluluğu, devamsızlıktan kalma, hazırlık başarı/tekrar koşulu, uzaktan eğitim ve ders yükü gibi akademik süreç ayrıntıları resmi yönerge ve program duyurularıyla doğrulanmalıdır.',
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
    'Broşürde genel telefon ve Bağlum telefonu yer alır; WhatsApp danışma hattı, aday öğrenci birimi veya Öğrenci İşleri doğrudan telefon numarası gibi özel kanal iddiaları net doğrulanmadan var cevabı olarak verilmemelidir.',
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

const ACCREDITATION_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:accreditation-scope',
  title: 'Akreditasyon, Diploma Geçerliliği ve Program Tanınma Kapsamı',
  quote:
    'Akreditasyon program bazlı kalite değerlendirmesidir; diploma geçerliliği, YÖK tanınması ve mesleki denklik ayrı resmi otorite süreçleridir.',
}

const RECOGNITION_SCOPE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:institution-recognition-scope',
  title: 'YİÜ Kurumsal Tanıtım ve Resmi Tanınma Kapsamı',
  quote:
    'Yüksek İhtisas Üniversitesi 2013 yılında Ankara’da kurulan bir vakıf üniversitesi olarak tanıtılır; YÖK/YÖKSİS, program onayı ve mesleki tanınma iddiaları resmi otorite kaydıyla doğrulanmalıdır.',
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

const PROGRAM_DURATION_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:program-durations',
  title: 'YİÜ Tanıtım Broşürü - Program Süreleri',
  quote:
    'Broşürde Tıp Fakültesi 6 yıllık, lisans programları 4 yıllık ve ön lisans programları 2 yıllık programlar olarak aday öğrenci program listelerinde yer alır.',
}

const PROGRAM_PROFESSIONAL_TITLE_CITATION: RagProviderCitation = {
  providerSourceId: 'strict-catalog:program-professional-title',
  title: 'YİÜ Program Düzeyi ve Mesleki Unvan Kapsamı',
  quote:
    'Eczane Hizmetleri katalogda ön lisans programı olarak listelenir; program mezuniyeti fakülte düzeyi eczacılık unvanı veya mesleki yetki iddiası olarak yorumlanmamalıdır.',
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
    key: '100 yil',
    name: '100. Yıl Yerleşkesi',
    address: 'İşçi Blokları Mahallesi 1505. Sokak No:18/A Çankaya/Ankara',
  },
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

const CAMPUS_PROGRAM_GROUPS = [
  {
    keys: ['100 yil', 'tip'],
    name: '100. Yıl Yerleşkesi',
    address: 'İşçi Blokları Mahallesi 1505. Sokak No:18/A Çankaya/Ankara',
    groups: [
      {
        unit: 'Tıp Fakültesi',
        programs: ['Tıp Fakültesi (Türkçe)', 'Tıp Fakültesi (İngilizce)'],
      },
    ],
  },
  {
    keys: ['baglica', 'saglik bilimleri'],
    name: 'Bağlıca Yerleşkesi',
    address: 'Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca/Ankara',
    groups: [
      {
        unit: 'Sağlık Bilimleri Fakültesi',
        programs: [
          'Ergoterapi',
          'Ebelik',
          'Hemşirelik',
          'Beslenme ve Diyetetik',
          'Fizyoterapi ve Rehabilitasyon',
          'Dil ve Konuşma Terapisi',
          'Sağlık Yönetimi',
        ],
      },
    ],
  },
  {
    keys: ['balgat'],
    name: 'Balgat Yerleşkesi',
    address: 'Oğuzlar Mahallesi 1375 Sokak No:8 Balgat/Ankara',
    groups: [
      {
        unit: 'Spor Bilimleri Fakültesi',
        programs: ['Antrenörlük Eğitimi'],
      },
      {
        unit: 'Meslek Yüksekokulu',
        programs: ['Eczane Hizmetleri', 'Bilgisayar Programcılığı', 'Grafik Tasarım', 'Elektrik'],
      },
      {
        unit: 'Sağlık Hizmetleri Meslek Yüksekokulu',
        programs: [
          'Elektronörofizyoloji',
          'Biyomedikal Cihaz Teknolojisi',
          'Fizyoterapi',
          'Tıbbi Veri İşleme Teknikerliği',
          'Tıbbi Laboratuvar Teknikleri',
        ],
      },
    ],
  },
  {
    keys: ['baglum'],
    name: 'Bağlum Yerleşkesi',
    address: 'Karakaya Mahallesi Bağlum Bulvarı No:1 06291 Keçiören/Ankara',
    groups: [
      {
        unit: 'Sağlık Hizmetleri Meslek Yüksekokulu',
        programs: [
          'Anestezi',
          'Ameliyathane Hizmetleri',
          'İlk ve Acil Yardım',
          'Tıbbi Tanıtım ve Pazarlama',
          'Optisyenlik',
          'Tıbbi Dokümantasyon ve Sekreterlik',
          'Tele-Sağlık Teknikerliği',
        ],
      },
    ],
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

const PROGRAM_DURATION_FACTS = [
  {
    name: 'Tıp Fakültesi',
    aliases: ['tip', 'tip fakultesi', 'turkce tip', 'ingilizce tip'],
    duration: '6 yıllık',
    level: 'tıp programı',
  },
  {
    name: 'Beslenme ve Diyetetik',
    aliases: ['beslenme', 'beslenme ve diyetetik'],
    duration: '4 yıllık',
    level: 'lisans programı',
  },
  {
    name: 'Dil ve Konuşma Terapisi',
    aliases: ['dkt', 'dil konusma terapisi', 'dil ve konusma terapisi'],
    duration: '4 yıllık',
    level: 'lisans programı',
  },
  {
    name: 'Fizyoterapi ve Rehabilitasyon',
    aliases: ['ftr', 'fizyoterapi ve rehabilitasyon'],
    duration: '4 yıllık',
    level: 'lisans programı',
  },
  {
    name: 'Hemşirelik',
    aliases: ['hemsirelik'],
    duration: '4 yıllık',
    level: 'lisans programı',
  },
  {
    name: 'Sağlık Yönetimi',
    aliases: ['saglik yonetimi'],
    duration: '4 yıllık',
    level: 'lisans programı',
  },
  {
    name: 'Ergoterapi',
    aliases: ['ergoterapi'],
    duration: '4 yıllık',
    level: 'lisans programı',
  },
  {
    name: 'Ebelik',
    aliases: ['ebelik'],
    duration: '4 yıllık',
    level: 'lisans programı',
  },
  {
    name: 'Antrenörlük Eğitimi',
    aliases: ['antrenorluk egitimi', 'antrenorluk'],
    duration: '4 yıllık',
    level: 'lisans programı',
  },
  {
    name: 'Ameliyathane Hizmetleri',
    aliases: ['ameliyathane hizmetleri'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Anestezi',
    aliases: ['anestezi'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Biyomedikal Cihaz Teknolojisi',
    aliases: ['biyomedikal cihaz teknolojisi'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Elektronörofizyoloji',
    aliases: ['elektronorofizyoloji'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Optisyenlik',
    aliases: ['optisyenlik'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Tıbbi Dokümantasyon ve Sekreterlik',
    aliases: ['tibbi dokumantasyon', 'tibbi dokumantasyon ve sekreterlik'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Tıbbi Laboratuvar Teknikleri',
    aliases: ['tibbi laboratuvar', 'tibbi laboratuvar teknikleri'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Tıbbi Görüntüleme Teknikleri',
    aliases: ['tibbi goruntuleme', 'tibbi goruntuleme teknikleri'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Tıbbi Tanıtım ve Pazarlama',
    aliases: ['tibbi tanitim', 'tibbi tanitim ve pazarlama'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Fizyoterapi',
    aliases: ['fizyoterapi on lisans', 'fizyoterapi'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'İlk ve Acil Yardım',
    aliases: ['ilk ve acil yardim', 'ilk yardim', 'ilkyardim', 'ilkyardım'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Tele-Sağlık Teknikerliği',
    aliases: ['tele saglik', 'tele saglik teknikerligi'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Tıbbi Veri İşleme Teknikerliği',
    aliases: ['tibbi veri isleme', 'tibbi veri isleme teknikerligi'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Bilgisayar Programcılığı',
    aliases: ['bilgisayar programciligi'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Eczane Hizmetleri',
    aliases: ['eczane hizmetleri'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Elektrik',
    aliases: ['elektrik'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
  },
  {
    name: 'Grafik Tasarım',
    aliases: ['grafik tasarim', 'grafik tasarimi'],
    duration: '2 yıllık',
    level: 'ön lisans programı',
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

function renderSchools() {
  return `Onaylı tanıtım broşüründe listelenen meslek yüksekokulları: ${SCHOOLS.map((unit) => unit.name).join(', ')}.`
}

function renderDegreeLevelPrograms() {
  const undergraduateGroups = FACULTIES.map(
    (unit) => `${unit.name}: ${(unit.programs ?? []).join(', ')}`
  )
  const associateGroups = SCHOOLS.map(
    (unit) => `${unit.name}: ${(unit.programs ?? []).join(', ')}`
  )
  return `Lisans programları: ${undergraduateGroups.join('; ')}. Ön lisans programları: ${associateGroups.join('; ')}.`
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

function resolveProgramDurationFact(search: string): StrictCatalogAnswer | null {
  const asksDuration = /(?:kac yil|kac yillik|egitim suresi|ne kadar sur)/.test(search)
  if (!asksDuration) return null

  const program = PROGRAM_DURATION_FACTS.find((fact) => includesAlias(search, fact.aliases))
  if (!program) return null

  return {
    answer: `${program.name} ${program.duration} bir ${program.level} olarak listelenir. Hazırlık sınıfı, özel uygulama veya güncel program koşulu varsa ilgili akademik yılın resmi duyurusuyla ayrıca doğrulanmalıdır.`,
    citations: [PROGRAM_DURATION_CITATION],
    refusal: false,
    reason: 'catalog_program_duration_fact',
  }
}

function resolveProgramProfessionalTitleFact(search: string): StrictCatalogAnswer | null {
  const asksEczaneServicesTitle =
    /eczane hizmetleri/.test(search) &&
    /(?:eczaci olur|eczaci mi|eczaci olunur|eczaci yapar|eczacilik unvani|eczacı unvanı)/.test(
      search
    )
  if (!asksEczaneServicesTitle) return null

  return {
    answer:
      'Hayır. Eczane Hizmetleri onaylı katalogda Meslek Yüksekokulu altında listelenen 2 yıllık bir ön lisans programıdır. Bu programdan eczacı unvanı sonucu çıkarılmamalıdır; eczacı unvanı ve mesleki yetkiler için ilgili resmi mevzuat ve fakülte düzeyi eğitim koşulları ayrıca belirleyicidir.',
    citations: [CATALOG_CITATION, PROGRAM_PROFESSIONAL_TITLE_CITATION],
    refusal: false,
    reason: 'catalog_program_professional_title_fact',
  }
}

function resolveInstitutionFact(search: string): StrictCatalogAnswer | null {
  if (/(?:devlet mi|vakif|vakıf)/.test(search) && /(?:universite|yuksek ihtisas)/.test(search)) {
    return {
      answer:
        'Yüksek İhtisas Üniversitesi bir vakıf üniversitesidir; devlet üniversitesi değildir. Onaylı kaynaklarda Türkiye Yüksek İhtisas Hastanesi Vakfı tarafından 2013 yılında Ankara’da kurulduğu belirtilir.',
      citations: [INSTITUTION_CITATION],
      refusal: false,
      reason: 'catalog_institution_fact',
    }
  }

  if (/(?:kurucu vakif|kurucu vakf|vakfi kim|vakfı kim)/.test(search)) {
    return {
      answer:
        'Yüksek İhtisas Üniversitesi’nin kurucu vakfı Türkiye Yüksek İhtisas Hastanesi Vakfı’dır.',
      citations: [INSTITUTION_CITATION],
      refusal: false,
      reason: 'catalog_institution_fact',
    }
  }

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

function findCampusProgramGroup(search: string) {
  return CAMPUS_PROGRAM_GROUPS.find((campus) =>
    campus.keys.some((key) => search.includes(normalizeStrictQuestionSearch(key)))
  )
}

function renderCampusProgramGroups(campus: (typeof CAMPUS_PROGRAM_GROUPS)[number]) {
  return campus.groups
    .map((group) => `${group.unit}: ${group.programs.join(', ')}`)
    .join('; ')
}

function renderAllCampusProgramGroups() {
  return CAMPUS_PROGRAM_GROUPS.map(
    (campus) => `${campus.name}: ${renderCampusProgramGroups(campus)}`
  ).join('; ')
}

function resolveCampusProgramListingFact(search: string): StrictCatalogAnswer | null {
  if (
    /(?:hangi bolum hangi kampus|hangi bölüm hangi kampüs|hangi bolum hangi yerleske|hangi bölüm hangi yerleşke|bolumler hangi kampus|bölümler hangi kampüs|bolumler hangi yerleske|bölümler hangi yerleşke)/.test(
      search
    )
  ) {
    return {
      answer: `Broşürdeki yerleşke-program eşleşmeleri: ${renderAllCampusProgramGroups()}.`,
      citations: [CAMPUS_PROGRAM_CITATION],
      refusal: false,
      reason: 'catalog_campus_program_listing',
    }
  }

  if (
    /(?:myo|meslek yuksekokulu|meslek yüksekokulu)/.test(search) &&
    /(?:nerede|nerde|kampus|kampüs|yerleske|yerleşke)/.test(search)
  ) {
    return {
      answer:
        'Broşürde Meslek Yüksekokulu Balgat Yerleşkesi ile eşleştirilir. Sağlık Hizmetleri Meslek Yüksekokulu programları ise Balgat ve Bağlum yerleşkelerinde listelenir: Balgat Yerleşkesi adresi Oğuzlar Mahallesi 1375 Sokak No:8 Balgat/Ankara; Bağlum Yerleşkesi adresi Karakaya Mahallesi Bağlum Bulvarı No:1 06291 Keçiören/Ankara.',
      citations: [CAMPUS_PROGRAM_CITATION],
      refusal: false,
      reason: 'catalog_campus_program_listing',
    }
  }

  const campus = findCampusProgramGroup(search)
  if (!campus) return null

  const hasExplicitCampusKey = ['100 yil', 'baglica', 'balgat', 'baglum'].some((key) =>
    search.includes(key)
  )
  const hasCampusIntent = /(?:kampus|kampüs|yerleske|yerleşke|yerleskesinde|yerleşkesinde)/.test(
    search
  )
  const asksCampusProgramListing =
    (hasExplicitCampusKey &&
      /(?:hangi bolum|hangi program|hangi fakulte|bolumler|programlar|fakulteler)/.test(
        search
      )) ||
    /(?:hangi|nerede|nerde).{0,30}(?:kampus|yerleske)/.test(search) ||
    /(?:tip fakultesi|saglik bilimleri|shmyo|meslek yuksekokulu|spor bilimleri).{0,40}(?:kampus|yerleske|nerede|nerde)/.test(
      search
    ) ||
    (hasCampusIntent && hasExplicitCampusKey)
  if (!asksCampusProgramListing) return null

  return {
    answer: `${campus.name} için broşürdeki yerleşke eşleşmesi: ${renderCampusProgramGroups(
      campus
    )}. Adres: ${campus.address}.`,
    citations: [CAMPUS_PROGRAM_CITATION],
    refusal: false,
    reason: 'catalog_campus_program_listing',
  }
}

function campusTransportTopicLabel(search: string) {
  if (/hastaneye.*servis|servis.*hastane/.test(search)) return 'hastaneye servis'
  if (/kampusler arasi servis/.test(search)) return 'kampüsler arası servis'
  if (/servis saat/.test(search)) return 'servis saatleri'
  if (/servis guzergah/.test(search)) return 'servis güzergahları'
  if (/servis ucret|servis.*ucretli/.test(search)) return 'servis ücreti'
  if (/servis/.test(search)) return 'servis'
  if (/metro/.test(search)) return 'metro ile ulaşım'
  if (/otobus/.test(search)) return 'otobüs ile ulaşım'
  if (/dolmus/.test(search)) return 'dolmuş ile ulaşım'
  return 'ulaşım'
}

function resolveCampusTransportFact(search: string): StrictCatalogAnswer | null {
  const asksServiceScope =
    /(?:servis|metro|otobus|dolmus)/.test(search) &&
    /(?:var mi|varmi|ucretli|saat|guzergah|nereden gec|nasil|hastaneye|kampuse|kampusler arasi|toplu tasima)/.test(
      search
    )
  if (asksServiceScope) {
    const topic = campusTransportTopicLabel(search)
    return {
      answer: `Broşürde yerleşke adresleri ve ulaşım bilgileri için resmi bağlantı yer alır; ancak ${topic} hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Karar için ilgili yerleşke, güncel hizmet saatleri, güzergah, ücret ve ulaşım modu üniversitenin resmi ulaşım duyurusu veya ilgili birimiyle birlikte doğrulanmalıdır. Genel telefon: 0 (312) 329 10 10; Bağlum telefon: 0 (312) 329 74 25.`,
      citations: [CAMPUS_TRANSPORT_CITATION],
      refusal: true,
      reason: 'catalog_campus_transport_scope_guard',
    }
  }

  const asksCampusTransport =
    /(?:kampuse nasil|kampüse nasil|kampuse nasıl|kampüse nasıl|yerleskeye nasil|yerleşkeye nasıl|yerleskenize ulasim|yerleşkenize ulaşım|ulasim nasil|ulaşım nasıl|nasil gider|nasıl gider|nasil gidilir|nasıl gidilir)/.test(
      search
    ) ||
    (/(?:ulasim|ulaşım)/.test(search) && /(?:yerleske|yerleşke|kampus|kampüs)/.test(search))
  if (!asksCampusTransport) return null

  const campus = findCampusProgramGroup(search)
  const addressText = campus
    ? `${campus.name}: ${campus.address}`
    : CAMPUS_PROGRAM_GROUPS.map((location) => `${location.name}: ${location.address}`).join('; ')

  return {
    answer: `Broşürdeki yerleşke adresleri: ${addressText}. Ulaşım bilgileri için resmi bağlantı: https://yuksekihtisasuniversitesi.edu.tr/duyuru/universitemizde-yeni-duzenleme-kapsaminda-yapilan-yerleske-konumlari-guncellendi. Güncel rota, metro/otobüs/dolmuş seçeneği ve saat bilgisi değişebileceği için ilgili yerleşke ve güncel ulaşım modu birlikte doğrulanmalıdır. Genel telefon: 0 (312) 329 10 10; Bağlum telefon: 0 (312) 329 74 25.`,
    citations: [CAMPUS_TRANSPORT_CITATION],
    refusal: false,
    reason: 'catalog_campus_transport_fact',
  }
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

  if (asksSpecificSummerInternship && /(?:tip|tıp|tip fakultesi|tıp fakültesi)/.test(search)) {
    return {
      answer:
        'Onaylı kaynaklarda Tıp Fakültesi için klinik eğitim Dönem IV ve Dönem V’te stajlarla başlar; Dönem VI ise intörn hekimlik dönemidir. Bu kaynaklardan Tıp Fakültesi için ayrıca ayrı bir yaz stajı olduğu sonucu çıkarılmamalıdır.',
      citations: [CLINICAL_TRAINING_CITATION],
      refusal: false,
      reason: 'catalog_clinical_training_fact',
    }
  }

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
    /(?:rontgen|mr|tomografi|cihaz|mikroskop|mikroskob|ambulans simulasyon|simulasyon laboratuvari|beceri laboratuvari|uygulama alani|dogumhane|yogun bakim|ameliyathane|cocuk hastaliklari servisi|dahili ve cerrahi|hasta basi egitim|ogrenci dinlenme alani|laboratuvarlari gez|laboratuvarlari gorebilir)/.test(
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
  if (/yemek fiyat|yemek ucret|yemek.*para|yemek.*tl/.test(search)) return 'yemek fiyatları'
  if (/yemek kart/.test(search)) return 'yemek kartı'
  if (/yemekhane/.test(search)) return 'yemekhane'
  if (/yemek/.test(search)) return 'yemek hizmeti'
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
  if (/(?:ankara.*kira|kira|kiralar)/.test(search)) return 'Ankara kira ve konaklama maliyeti'
  return 'kampüs yaşamı ve imkanları'
}

function resolveCampusLifeScopeFact(search: string): StrictCatalogAnswer | null {
  const asksCampusLifeScope =
    /(?:wifi|wi fi|yemek|yemekhane|kafe|kantin|spor salonu|vejetaryen|revir|otopark|kampus guvenli|kampus guvenligi|kampus yasam|kampus merkezi|kampusler.*yakin|birbirine yakin|apart|kiralik ev|ankara.*kira|kira|kiralar)/.test(
      search
    )
  if (!asksCampusLifeScope) return null

  const topic = campusLifeTopicLabel(search)
  return {
    answer: `${topic} hakkında üniversitenin onaylı aday öğrenci kaynaklarında net bilgi bulunmamaktadır. Bu tür kampüs yaşamı, şehir yaşamı ve güncel imkan bilgileri değişebileceği için üniversitenin güncel resmi duyuruları veya ilgili birimi kontrol edilmelidir. Karar için ilgili yerleşke, dönem, hizmet saatleri/kapasitesi, konaklama türü ve varsa başvuru koşulu birlikte doğrulanmalıdır.`,
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
  return /(?:^|\s)(?:yurt|yurdu|yurtlar|yurtlari|yurtlarda|konaklama)(?:\s|$)|(?:sehir disindan gelen|nerede kaliyor|nerede kalıyor|nerde kaliyor|nerde kalıyor|kalacak yer)/.test(
    search
  )
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
        'Üniversite kaynaklarında Konaklama bilgileri için resmi yurtlar/konaklama sayfası bağlantısı bulunmaktadır: https://yuksekihtisasuniversitesi.edu.tr/sayfa/yurtlar/yurtlar/yurtlar. Güncel yurt seçenekleri, başvuru süreci, ücret, kontenjan, kampüse yakınlık ve varsa protokol/indirim bilgileri bu resmi sayfadan veya ilgili birimden doğrulanmalıdır.',
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
  const asksPrice =
    /(?:ucret(?:i|ler|leri)?\b|kac para|kac tl|ne kadar|fiyat(?:i|lar|lari)?\b|(?:^|\s)tl(?:\s|$)|₺)/.test(
      search
    )
  if (!asksPrice) return null

  const asksBroadProgramFees =
    /(?:2025|ucretleri|ucretler|fiyatlari|fiyatlar)/.test(search) &&
    !/(?:yurt|servis|yemek|staj|basvuru|kimlik|onluk|yaz okulu|tek ders|ek sinav|yatay gecis|kira|kiralar|kiralik ev|konaklama)/.test(
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

function resolvePreparationScopeFact(search: string): StrictCatalogAnswer | null {
  const asksPreparation = /hazirlik/.test(search)
  if (!asksPreparation) return null

  const asksSpecificProgram =
    /(?:tip|ingilizce tip|turkce tip|tıp|anestezi|hemsirelik|ebelik|dil ve konusma|dkt|ftr|fizyoterapi|beslenme|ergoterapi|saglik yonetimi)/.test(
      search
    )
  if (!asksSpecificProgram) return null

  if (/(?:tip|ingilizce tip|turkce tip|tıp)/.test(search)) {
    return {
      answer:
        'İngilizce Tıp için hazırlık konusu program dili ve resmi hazırlık yönergesine bağlıdır. Broşürde Tıp Fakültesi (Hazırlık) satırı ayrı olarak yer alır ve 2025 fiyatı 410.000 TL olarak gösterilir; hazırlığın zorunluluğu, muafiyet veya geçme koşulları güncel resmi hazırlık duyurusuyla doğrulanmalıdır.',
      citations: [PROGRAM_FEE_CITATION, ACADEMIC_PROCESS_SCOPE_CITATION],
      refusal: false,
      reason: 'catalog_academic_process_scope_guard',
    }
  }

  return {
    answer:
      'Hazırlık bilgisi program dili, kayıt statüsü ve resmi hazırlık yönergesine göre değişebilir. Onaylı aday öğrenci kaynaklarında bu program için hazırlık zorunluluğu veya muafiyet koşulu kesin bir genel kural olarak yer almamaktadır; hedef program ve güncel hazırlık duyurusu birlikte doğrulanmalıdır.',
    citations: [ACADEMIC_PROCESS_SCOPE_CITATION],
    refusal: false,
    reason: 'catalog_academic_process_scope_guard',
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
  const asksPreferenceAdvice =
    /(?:hangi bolum.*secmeliyim|hangi bölüm.*seçmeliyim|hangi program.*secmeliyim|hangi program.*seçmeliyim|hangi bolumu yaz|hangi bölümü yaz|hangi program.*uygun|hangi bolum.*uygun|hangi bölüm.*uygun|tip gelmezse|tıp gelmezse|hemsirelik mi|hemşirelik mi|anestezi mi|tibbi laboratuvar mi|tıbbi laboratuvar mı|saglik yonetimi mi|sağlık yönetimi mi|hastanede calismak|hastanede çalışmak|laboratuvarda calismak|laboratuvarda çalışmak|insanlarla birebir|spor gecmisim|spor geçmişim|bilgisayara ilgim)/.test(
      search
    )
  if (asksPreferenceAdvice) {
    return {
      answer:
        'Sizin yerinize tercih kararı veremem veya tek bir “en doğru bölüm” seçemem. Sağlıklı bir tercih için puan türünüz/başarı sıralamanız, hedef program, burs/indirim beklentisi, çalışmak istediğiniz ortam, mesleki ilgi alanınız ve programın kontenjan/geçmiş yıl verileri birlikte değerlendirilmelidir. Broşürde program, puan türü, kontenjan, taban puan ve başarı sırası gibi karşılaştırma girdileri yer alır; ancak kesin yerleşme garantisi verilemez.',
      citations: [ADMISSIONS_METRIC_CITATION, ADMISSIONS_DECISION_SCOPE_CITATION, CATALOG_CITATION],
      refusal: true,
      reason: 'catalog_admissions_decision_guard',
    }
  }

  const asksTransferOrDgs =
    /(?:yatay gecis|yatay geçiş|kurum ici yatay|kurum içi yatay|dgs|on lisanstan lisansa|ön lisanstan lisansa)/.test(
      search
    )
  if (asksTransferOrDgs) {
    return {
      answer:
        'Yatay geçiş, kurum içi geçiş veya DGS gibi başvuru süreçleri için onaylı kaynaklarda bu botun kesin kabul/uygunluk cevabı verebileceği net bilgi bulunmamaktadır. Bu süreçler program, kontenjan, sınıf/dönem, not ortalaması, başvuru takvimi ve resmi yönerge koşullarına bağlıdır. Karar için hedef program, başvuru türü, güncel kontenjan ve resmi başvuru duyurusu birlikte doğrulanmalıdır.',
      citations: [ADMISSIONS_DECISION_SCOPE_CITATION, REGISTRATION_SCOPE_CITATION],
      refusal: true,
      reason: 'catalog_admissions_decision_guard',
    }
  }

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

function resolveAccreditationScopeFact(search: string): StrictCatalogAnswer | null {
  const asksAccreditationDefinition =
    /(?:akreditasyon|akredite)/.test(search) && /(?:ne demek|nedir|anlami|ne anlama)/.test(search)
  if (asksAccreditationDefinition) {
    return {
      answer:
        'Akreditasyon, bir programın veya kurumun belirli kalite standartlarına göre bağımsız/ yetkili bir yapı tarafından değerlendirilmesi anlamına gelir. Diploma geçerliliğiyle aynı şey değildir; diploma geçerliliği, program onayı, YÖK tanınması ve mesleki denklik ayrı resmi süreçlerdir.',
      citations: [ACCREDITATION_SCOPE_CITATION],
      refusal: false,
      reason: 'catalog_accreditation_scope_guard',
    }
  }

  const asksInvalidity =
    /(?:akreditasyon olmazsa|akredite olmayan|akredite degilse|akredite değilse)/.test(search) &&
    /(?:diploma|gecersiz|geçersiz|okunmaz|okunur mu)/.test(search)
  if (asksInvalidity) {
    return {
      answer:
        'Akreditasyon diploma geçerliliğiyle aynı şey değildir. Akreditasyon program bazlı kalite değerlendirmesidir; diplomanın geçerliliği, YÖK tanınması, program onayı, mezuniyet koşulları ve varsa mesleki denklik/yetki süreçleri ayrı resmi otorite kurallarıyla değerlendirilir. Bu yüzden “akreditasyon yoksa diploma geçersizdir” şeklinde kesin bir sonuç çıkarılmamalıdır.',
      citations: [ACCREDITATION_SCOPE_CITATION],
      refusal: false,
      reason: 'catalog_accreditation_scope_guard',
    }
  }

  const asksAccreditation = /(?:akreditasyon|akredite)/.test(search)
  if (!asksAccreditation) return null

  const unit =
    PROGRAM_FEE_FACTS.find((program) => includesAlias(search, program.aliases)) ??
    (/(?:tip|tıp)/.test(search) ? { name: 'Tıp Fakültesi' } : null) ??
    (/(?:hemsirelik|hemşirelik)/.test(search) ? { name: 'Hemşirelik' } : null) ??
    (/(?:saglik bilimleri|sağlık bilimleri)/.test(search)
      ? { name: 'Sağlık Bilimleri Fakültesi bölümleri' }
      : null) ??
    (/(?:on lisans|ön lisans|myo|meslek yuksekokulu)/.test(search)
      ? { name: 'ön lisans programları' }
      : null)
  const topic = unit?.name ?? 'Bölümlerin/programların akreditasyon durumu'

  return {
    answer: `${topic} için akreditasyon durumu hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Akreditasyon program bazında değerlendirilir ve diploma geçerliliği, YÖK tanınması veya mesleki denklikle aynı şey değildir; karar için ilgili program, akreditasyon kuruluşu, geçerlilik tarihi ve resmi YÖK/YÖKAK/akreditasyon kaydı birlikte doğrulanmalıdır.`,
    citations: [ACCREDITATION_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_accreditation_scope_guard',
  }
}

function resolveRecognitionScopeFact(search: string): StrictCatalogAnswer | null {
  const asksInstitutionRecognition =
    /(?:yok|yök|yoksis|yöksis).{0,50}(?:tanin|tanın|denklik|denk|onay)/.test(search) ||
    /(?:universite|üniversite).{0,60}(?:yok|yök).{0,60}(?:tanin|tanın|onay)/.test(search)
  const asksDomesticCredential =
    /(?:diploma|diplomaniz|diplomanız|mezun olunca diplomam).{0,80}(?:devlet universitesi|devlet üniversitesi|ayni gecerlilik|aynı geçerlilik|gecerli mi|geçerli mi|yok denk|yök denk)/.test(
      search
    ) ||
    /(?:yok denkligi|yök denkliği|yok denkliği|yök denkligi)/.test(search)
  const asksPublicExamOutcome =
    /(?:kpss|atanabilir|atanma|atanir miyim|atanır mıyım)/.test(search)
  if (!asksInstitutionRecognition && !asksDomesticCredential && !asksPublicExamOutcome) {
    return null
  }

  if (asksPublicExamOutcome) {
    return {
      answer:
        'Mezuniyet sonrası KPSS’ye girme veya atanma hakkı program mezuniyet unvanı, ÖSYM/KPSS başvuru koşulları, ilgili kamu kadrosu ve mevzuata bağlıdır. Onaylı aday öğrenci kaynaklarında belirli bir programa “mezun olunca atanır” garantisi veren net bilgi bulunmamaktadır; karar için program, mezuniyet unvanı, KPSS kılavuzu ve ilgili kadro şartı birlikte doğrulanmalıdır.',
      citations: [RECOGNITION_SCOPE_CITATION],
      refusal: true,
      reason: 'catalog_recognition_scope_guard',
    }
  }

  return {
    answer:
      'Yüksek İhtisas Üniversitesi, onaylı tanıtım kaynaklarında Türkiye Yüksek İhtisas Hastanesi Vakfı tarafından 2013 yılında Ankara’da kurulmuş bir vakıf üniversitesi olarak yer alır. Ancak YÖK/YÖKSİS kaydı, program onayı, devlet üniversitesi diplomasıyla aynı geçerlilik yorumu veya özel bir denklik sonucu için resmi YÖK ve ilgili otorite kaydı esas alınmalıdır. Bu bot resmi denklik/tanınma belgesi yerine geçmez; karar için kurum, program, mezuniyet belgesi ve yetkili otorite kaydı birlikte doğrulanmalıdır.',
    citations: [INSTITUTION_CITATION, RECOGNITION_SCOPE_CITATION],
    refusal: false,
    reason: 'catalog_recognition_scope_guard',
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
  const asksEquivalencyRequirement =
    /denklik/.test(search) && /(?:gerekir|gerekli|lazim|almam|almak|mezun olunca)/.test(search)
  if (!asksInternationalCredential && !asksEquivalencyRequirement) return null

  if (asksEquivalencyRequirement && !asksInternationalCredential) {
    return {
      answer:
        'Denklik gerekip gerekmediği hedef ülke, kurum, meslek alanı ve ilgili meslek otoritesine bağlıdır. Onaylı belgelerde YİÜ diploması için mezun olunca otomatik veya her durumda denklik alınması gerektiğine dair net bilgi bulunmamaktadır. Karar için hangi ülke/kurum, hangi program ve hangi mesleki yetki sürecinin söz konusu olduğu resmi otoriteyle doğrulanmalıdır.',
      citations: [CREDENTIAL_SCOPE_CITATION],
      refusal: true,
      reason: 'catalog_credential_scope_guard',
    }
  }

  return {
    answer:
      'Diplomanın yurtdışında geçerliliği veya mesleki denklik otomatik değildir; başvurulacak ülke, kurum ve ilgili meslek otoritesinin kurallarına bağlıdır. Onaylı belgelerde YİÜ diplomasının Amerika, Almanya, Avrupa veya başka bir ülkede otomatik geçerli olduğuna dair net bilgi bulunmamaktadır.',
    citations: [CREDENTIAL_SCOPE_CITATION],
    refusal: true,
    reason: 'catalog_credential_scope_guard',
  }
}

function resolveRegistrationScopeFact(search: string): StrictCatalogAnswer | null {
  if (/(?:benim yerime|yerime).{0,30}(?:kayit|kayıt)|(?:kayit|kayıt).{0,30}(?:benim yerime|yerime)/.test(search)) {
    return {
      answer:
        'sizin yerinize kayıt yapamam veya resmi başvuru işlemi gerçekleştiremem. Kayıt işlemleri yalnızca üniversitenin güncel resmi kayıt kanalları, e-Devlet/ÖSYM süreçleri ve yetkili kayıt birimleri üzerinden yürütülmelidir. Karar için aday türü, kayıt dönemi, gerekli belgeler, kimlik doğrulama ve resmi kayıt kanalı birlikte doğrulanmalıdır.',
      citations: [REGISTRATION_SCOPE_CITATION],
      refusal: true,
      reason: 'catalog_registration_scope_guard',
    }
  }

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

function resolveAcademicProcessScopeFact(search: string): StrictCatalogAnswer | null {
  const asksPrepOutcome =
    /(?:hazirligi gecemezsem|hazırlığı geçemezsem|hazirlik.*gecemez|hazırlık.*geçemez|hazirlik.*kal|hazırlık.*kal)/.test(
      search
    )
  if (asksPrepOutcome) {
    return {
      answer:
        'Hazırlığı geçemezsem ne olur sorusu için onaylı aday öğrenci kaynaklarında net ve güncel resmi süreç bilgisi bulunmamaktadır. Hazırlık başarı/tekrar koşulu, muafiyet, program dili ve kayıt statüsü resmi akademik süreç ve ilgili hazırlık yönergesine bağlıdır. Karar için program, hazırlık zorunluluğu, sınav/muafiyet durumu ve güncel akademik yönerge birlikte doğrulanmalıdır.',
      citations: [ACADEMIC_PROCESS_SCOPE_CITATION],
      refusal: true,
      reason: 'catalog_academic_process_scope_guard',
    }
  }

  if (/(?:devamsizlik|devamsızlık|devamsizliktan kal|devamsızlıktan kal|devam zorunlu|devam zorunlulugu|devam zorunluluğu)/.test(search)) {
    return {
      answer:
        'Devamsızlık ve derse devam zorunluluğu hakkında onaylı aday öğrenci kaynaklarında bu botun kesin oran/kural verebileceği net bilgi bulunmamaktadır. Devamsızlıktan kalma koşulu ders, program, uygulama/staj türü ve resmi ders devam yönergesine bağlıdır. Karar için ilgili ders/program, dönem, teorik-uygulamalı ders ayrımı ve resmi ders devam kuralı birlikte doğrulanmalıdır.',
      citations: [ACADEMIC_PROCESS_SCOPE_CITATION],
      refusal: true,
      reason: 'catalog_academic_process_scope_guard',
    }
  }

  if (/(?:en az ders calisarak|en az ders çalışarak|az calisarak|az çalışarak|kolay bolum|kolay bölüm|en kolay bolum|en kolay bölüm)/.test(search)) {
    return {
      answer:
        'Bölümleri “en az ders çalışarak okunur” gibi bir ölçüte göre önermek uygun değildir. Ders yükü ve zorluk öğrencinin hazırlığına, ilgi alanına, programın müfredatına, uygulama/staj yüküne ve akademik beklentilere göre değişir. Tercih için programın ders planı, puan türü, mesleki hedef, çalışma alışkanlığı ve mezuniyet koşulları birlikte değerlendirilmelidir.',
      citations: [ACADEMIC_PROCESS_SCOPE_CITATION, ADMISSIONS_DECISION_SCOPE_CITATION],
      refusal: true,
      reason: 'catalog_academic_process_scope_guard',
    }
  }

  if (/(?:sadece online|uzaktan egitim|uzaktan eğitim|online okuyabilir)/.test(search)) {
    return {
      answer:
        'Sadece online okuma veya uzaktan eğitim imkanı hakkında onaylı aday öğrenci kaynaklarında net bilgi bulunmamaktadır. Bu durum program, ders türü, dönem ve resmi eğitim-öğretim duyurusuna bağlıdır. Karar için hedef program, derslerin yürütülme biçimi, varsa uygulama/staj yükümlülüğü ve güncel resmi duyuru birlikte doğrulanmalıdır.',
      citations: [ACADEMIC_PROCESS_SCOPE_CITATION],
      refusal: true,
      reason: 'catalog_academic_process_scope_guard',
    }
  }

  return null
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
  const asksStudentAffairsPhone =
    /(?:ogrenci isleri|öğrenci işleri|student affairs)/.test(search) &&
    /(?:telefon|numara|iletisim|ulaş|ulas)/.test(search)
  const asksCandidateOffice =
    /(?:aday ogrenci|aday öğrenci|aday birim|aday.*birim)/.test(search) &&
    /(?:nasil ulas|nasıl ulaş|ulasirim|ulaşırım|iletisim|telefon|numara|birim)/.test(search)

  if (!asksUnsupportedMessagingLine && !asksStudentAffairsPhone && !asksCandidateOffice) {
    return null
  }

  if (asksStudentAffairsPhone) {
    return {
      answer:
        'Öğrenci İşleri doğrudan telefon numarası hakkında onaylı aday öğrenci kaynaklarında net bilgi bulunmamaktadır. Broşürde resmi genel iletişim olarak Genel telefon: 0 (312) 329 10 10 ve Bağlum telefon: 0 (312) 329 74 25 yer alır. Öğrenci İşleri için güncel resmi iletişim sayfası, ilgili birim ve başvuru/kayıt dönemi birlikte doğrulanmalıdır.',
      citations: [CONTACT_SCOPE_CITATION, CAMPUS_TRANSPORT_CITATION],
      refusal: true,
      reason: 'catalog_contact_scope_guard',
    }
  }

  if (asksCandidateOffice) {
    return {
      answer:
        'aday öğrenci birimi için doğrudan özel iletişim kanalı hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. resmi iletişim için üniversitenin güncel iletişim sayfası ve broşürde yer alan genel telefon kullanılmalı; aday türü, başvuru/kayıt dönemi ve ilgili birim birlikte doğrulanmalıdır. Genel telefon: 0 (312) 329 10 10.',
      citations: [CONTACT_SCOPE_CITATION, CAMPUS_TRANSPORT_CITATION],
      refusal: true,
      reason: 'catalog_contact_scope_guard',
    }
  }

  return {
    answer:
      'WhatsApp danışma hattı, aday öğrenci WhatsApp hattı veya özel iletişim hattı hakkında onaylı kaynaklarda net bilgi bulunmamaktadır. Karar için üniversitenin resmi iletişim sayfası, ilgili birim ve güncel başvuru dönemi birlikte doğrulanmalıdır. Broşürde genel telefon olarak 0 (312) 329 10 10 yer alır.',
    citations: [CONTACT_SCOPE_CITATION, CAMPUS_TRANSPORT_CITATION],
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
    answer:
      `${topic} konusunda yardımcı olamam. Yüksek İhtisas Üniversitesi'nin programları, ücretleri, bursları, kontenjanları, kampüsleri veya kayıt süreciyle ilgili sorularınızı yanıtlayabilirim. Örneğin belirli bir program, ücret, kontenjan, kampüs ya da kayıt adımı sorabilirsiniz.`,
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
    /(?:universitenin eksileri|eksileri ne|kotu yorum|kotu yorumlari|en kotu bolum|rakip.*kiyas|kiyaslar misin|olumsuz yorum|dezavantajlari|hocalar zor|hoca.*zor|yemekler guzel|yemekler güzel)/.test(
      search
    )
  if (!asksReputation) return null

  return {
    answer:
      'Üniversitenin eksileri, kötü yorumlar, hocaların zorluğu, yemeklerin beğenilip beğenilmediği veya rakiplerle kıyaslama gibi öznel değerlendirme başlıkları hakkında onaylı kaynaklarda doğrulanmış bilgi bulunmamaktadır. Yanıltıcı yorum aktarmak yerine program, ücret, burs, kontenjan, kampüs veya kayıt bilgileri gibi doğrulanabilir başlıklarda yardımcı olabilirim.',
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
  const programDurationFact = resolveProgramDurationFact(understanding.normalizedSearch)
  if (programDurationFact) return programDurationFact
  const programProfessionalTitleFact = resolveProgramProfessionalTitleFact(
    understanding.normalizedSearch
  )
  if (programProfessionalTitleFact) return programProfessionalTitleFact
  const institutionFact = resolveInstitutionFact(understanding.normalizedSearch)
  if (institutionFact) return institutionFact
  const campusTransportFact = resolveCampusTransportFact(understanding.normalizedSearch)
  if (campusTransportFact) return campusTransportFact
  const campusProgramListingFact = resolveCampusProgramListingFact(understanding.normalizedSearch)
  if (campusProgramListingFact) return campusProgramListingFact
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
  const earlyOffTopicScopeFact = resolveOffTopicScopeFact(input.question, understanding)
  if (earlyOffTopicScopeFact) return earlyOffTopicScopeFact
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
  const preparationScopeFact = resolvePreparationScopeFact(understanding.normalizedSearch)
  if (preparationScopeFact) return preparationScopeFact
  const academicProcessScopeFact = resolveAcademicProcessScopeFact(understanding.normalizedSearch)
  if (academicProcessScopeFact) return academicProcessScopeFact
  const accreditationScopeFact = resolveAccreditationScopeFact(understanding.normalizedSearch)
  if (accreditationScopeFact) return accreditationScopeFact
  const credentialScopeFact = resolveCredentialScopeFact(understanding.normalizedSearch)
  if (credentialScopeFact) return credentialScopeFact
  const recognitionScopeFact = resolveRecognitionScopeFact(understanding.normalizedSearch)
  if (recognitionScopeFact) return recognitionScopeFact
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

  if (
    asksListing &&
    /(?:program listesi|bolumlere kayit|programlara kayit|kayit olabilecegim|tum lisans|tum bolum|tumu|genel olarak tum)/.test(
      understanding.normalizedSearch
    )
  ) {
    return {
      answer: renderDegreeLevelPrograms(),
      citations: [CATALOG_CITATION],
      refusal: false,
      reason: 'catalog_degree_level_listing',
    }
  }

  if (
    !/(?:shmyo|saglik hizmetleri|sağlık hizmetleri)/.test(understanding.normalizedSearch) &&
    /(?:hangi meslek yuksekokulu|hangi meslek yüksekokulu|meslek yuksekokullari|meslek yüksekokulları|myo)/.test(
      understanding.normalizedSearch
    )
  ) {
    return {
      answer: renderSchools(),
      citations: [CATALOG_CITATION],
      refusal: false,
      reason: 'catalog_faculty_listing',
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
    if (
      !/(?:shmyo|saglik hizmetleri|sağlık hizmetleri)/.test(understanding.normalizedSearch) &&
      /(?:hangi meslek yuksekokulu|hangi meslek yüksekokulu|meslek yuksekokullari|meslek yüksekokulları|myo)/.test(
        understanding.normalizedSearch
      )
    ) {
      return {
        answer: renderSchools(),
        citations: [CATALOG_CITATION],
        refusal: false,
        reason: 'catalog_faculty_listing',
      }
    }

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
