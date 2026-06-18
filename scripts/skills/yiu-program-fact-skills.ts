export type YiuProgramFactIntent = {
  order: string
  slug: string
  title: string
  triggerExamples: string[]
  responseText: string
}

type ProgramOption = {
  variant: 'Ücretli' | 'Burslu' | '%50 İndirimli'
  pointType: string
  quota: string
  rank: string | null
  score: string | null
  fee: string | null
}

type ProgramDefinition = {
  order: string
  slug: string
  sourceName: string
  displayName: string
  unit: string
  degree: 'lisans' | 'ön lisans'
  campus: string
  address: string
  aliases: string[]
}

const SKILL_TITLE_PREFIX = 'YİÜ Intent - '

export const PROGRAM_REPLACED_BASE_SLUGS = [
  'tip_ucretleri',
  'tip_kontenjanlari',
  'tip_puan_ve_basari_sirasi',
  'hemsirelik_ucret_kontenjan',
  'dil_konusma_terapisi_ucret_kontenjan',
  'fizyoterapi_rehabilitasyon_ucret_kontenjan',
  'beslenme_diyetetik_ucret_kontenjan',
  'ergoterapi_ebelik_ucret_kontenjan',
  'saglik_yonetimi_ea',
  'anestezi_ucret_kontenjan',
  'ilk_acil_yardim_ucret_kontenjan',
  'tibbi_laboratuvar_teknikleri_ucret_kontenjan',
  'ameliyathane_hizmetleri_ucret_kontenjan',
  'tibbi_tanitim_pazarlama_tutarsizlik',
  'tele_saglik_tibbi_veri_ucret',
  'myo_ucretler',
  'spor_antrenorluk_egitimi',
  'shmyo_diger_programlar_ucret_kontenjan',
] as const

const CAMPUSES = {
  tip: {
    campus: '100. Yıl Yerleşkesi',
    address: 'İşçi Blokları Mahallesi 1505. Sokak No:18/A Çankaya / Ankara',
  },
  baglica: {
    campus: 'Bağlıca Yerleşkesi',
    address: 'Bağlıca Mahallesi, Höyük Caddesi No:1 Bağlıca / Ankara',
  },
  balgat: {
    campus: 'Balgat Yerleşkesi',
    address: 'Oğuzlar Mahallesi, 1375. Sokak No:8 Balgat / Ankara',
  },
  baglum: {
    campus: 'Bağlum Yerleşkesi',
    address: 'Karakaya Mahallesi, Bağlum Bulvarı No:1 Keçiören / Ankara',
  },
} as const

function program(
  definition: Omit<ProgramDefinition, 'campus' | 'address'>,
  campus: keyof typeof CAMPUSES
): ProgramDefinition {
  return { ...definition, ...CAMPUSES[campus] }
}

const PROGRAMS: ProgramDefinition[] = [
  program({ order: '20', slug: 'tip_turkce_program_bilgileri', sourceName: 'Tıp Fakültesi', displayName: 'Tıp Fakültesi (Türkçe)', unit: 'Tıp Fakültesi', degree: 'lisans', aliases: ['Türkçe Tıp', 'Tıp Türkçe'] }, 'tip'),
  program({ order: '22', slug: 'tip_ingilizce_program_bilgileri', sourceName: 'Tıp Fakültesi (İngilizce)', displayName: 'Tıp Fakültesi (İngilizce)', unit: 'Tıp Fakültesi', degree: 'lisans', aliases: ['İngilizce Tıp', 'Tıp İngilizce'] }, 'tip'),
  program({ order: '29', slug: 'hemsirelik_ucret_kontenjan', sourceName: 'Hemşirelik', displayName: 'Hemşirelik', unit: 'Sağlık Bilimleri Fakültesi', degree: 'lisans', aliases: ['Hemşirelik'] }, 'baglica'),
  program({ order: '30', slug: 'dil_konusma_terapisi_ucret_kontenjan', sourceName: 'Dil ve Konuşma Terapisi', displayName: 'Dil ve Konuşma Terapisi', unit: 'Sağlık Bilimleri Fakültesi', degree: 'lisans', aliases: ['DKT', 'Dil Konuşma Terapisi'] }, 'baglica'),
  program({ order: '31', slug: 'fizyoterapi_rehabilitasyon_ucret_kontenjan', sourceName: 'Fizyoterapi ve Rehabilitasyon', displayName: 'Fizyoterapi ve Rehabilitasyon', unit: 'Sağlık Bilimleri Fakültesi', degree: 'lisans', aliases: ['FTR', 'Fizyoterapi ve Rehabilitasyon'] }, 'baglica'),
  program({ order: '32', slug: 'beslenme_diyetetik_ucret_kontenjan', sourceName: 'Beslenme ve Diyetetik', displayName: 'Beslenme ve Diyetetik', unit: 'Sağlık Bilimleri Fakültesi', degree: 'lisans', aliases: ['Beslenme ve Diyetetik', 'Beslenme'] }, 'baglica'),
  program({ order: '37', slug: 'anestezi_ucret_kontenjan', sourceName: 'Anestezi', displayName: 'Anestezi', unit: 'Sağlık Hizmetleri Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['Anestezi'] }, 'baglum'),
  program({ order: '38', slug: 'ilk_acil_yardim_ucret_kontenjan', sourceName: 'İlk ve Acil Yardım', displayName: 'İlk ve Acil Yardım', unit: 'Sağlık Hizmetleri Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['İAY', 'Paramedik', 'İlk ve Acil Yardım'] }, 'baglum'),
  program({ order: '39', slug: 'tibbi_laboratuvar_teknikleri_ucret_kontenjan', sourceName: 'Tıbbi Laboratuvar Teknikleri', displayName: 'Tıbbi Laboratuvar Teknikleri', unit: 'Sağlık Hizmetleri Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['TLT', 'Tıbbi Lab', 'Laboratuvar Teknikerliği'] }, 'balgat'),
  program({ order: '40', slug: 'ameliyathane_hizmetleri_ucret_kontenjan', sourceName: 'Ameliyathane Hizmetleri', displayName: 'Ameliyathane Hizmetleri', unit: 'Sağlık Hizmetleri Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['Ameliyathane Hizmetleri', 'Ameliyathane'] }, 'baglum'),
  program({ order: '41', slug: 'tibbi_tanitim_pazarlama_ucret_kontenjan', sourceName: 'Tıbbi Tanıtım ve Pazarlama', displayName: 'Tıbbi Tanıtım ve Pazarlama', unit: 'Sağlık Hizmetleri Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['TTP', 'Tıbbi Tanıtım ve Pazarlama'] }, 'baglum'),
  program({ order: '45', slug: 'spor_antrenorluk_egitimi', sourceName: 'Antrenörlük Eğitimi', displayName: 'Antrenörlük Eğitimi', unit: 'Spor Bilimleri Fakültesi', degree: 'lisans', aliases: ['Antrenörlük', 'Antrenörlük Eğitimi'] }, 'balgat'),
  program({ order: '69', slug: 'saglik_yonetimi_program_bilgileri', sourceName: 'Sağlık Yönetimi', displayName: 'Sağlık Yönetimi', unit: 'Sağlık Bilimleri Fakültesi', degree: 'lisans', aliases: ['Sağlık Yönetimi'] }, 'baglica'),
  program({ order: '70', slug: 'ergoterapi_program_bilgileri', sourceName: 'Ergoterapi', displayName: 'Ergoterapi', unit: 'Sağlık Bilimleri Fakültesi', degree: 'lisans', aliases: ['Ergoterapi'] }, 'baglica'),
  program({ order: '71', slug: 'ebelik_program_bilgileri', sourceName: 'Ebelik', displayName: 'Ebelik', unit: 'Sağlık Bilimleri Fakültesi', degree: 'lisans', aliases: ['Ebelik'] }, 'baglica'),
  program({ order: '72', slug: 'biyomedikal_cihaz_teknolojisi_program_bilgileri', sourceName: 'Biyomedikal Cihaz Teknolojisi', displayName: 'Biyomedikal Cihaz Teknolojisi', unit: 'Sağlık Hizmetleri Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['BCT', 'Biyomedikal Cihaz Teknolojisi', 'Biyomedikal'] }, 'balgat'),
  program({ order: '73', slug: 'elektronorofizyoloji_program_bilgileri', sourceName: 'Elektronörofizyoloji', displayName: 'Elektronörofizyoloji', unit: 'Sağlık Hizmetleri Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['ENF', 'Elektronörofizyoloji'] }, 'balgat'),
  program({ order: '74', slug: 'optisyenlik_program_bilgileri', sourceName: 'Optisyenlik', displayName: 'Optisyenlik', unit: 'Sağlık Hizmetleri Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['Optisyenlik'] }, 'baglum'),
  program({ order: '75', slug: 'tibbi_dokumantasyon_sekreterlik_program_bilgileri', sourceName: 'Tıbbi Dokümantasyon ve Sekreterlik', displayName: 'Tıbbi Dokümantasyon ve Sekreterlik', unit: 'Sağlık Hizmetleri Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['TDS', 'Tıbbi Dokümantasyon', 'Tıbbi Sekreterlik'] }, 'baglum'),
  program({ order: '76', slug: 'fizyoterapi_onlisans_program_bilgileri', sourceName: 'Fizyoterapi', displayName: 'Fizyoterapi', unit: 'Sağlık Hizmetleri Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['FZT', 'Fizyoterapi ön lisans'] }, 'balgat'),
  program({ order: '77', slug: 'tele_saglik_teknikerligi_program_bilgileri', sourceName: 'Tele-Sağlık Teknikerliği', displayName: 'Tele-Sağlık Teknikerliği', unit: 'Sağlık Hizmetleri Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['TST', 'Tele Sağlık', 'Tele-Sağlık Teknikerliği'] }, 'baglum'),
  program({ order: '78', slug: 'tibbi_veri_isleme_program_bilgileri', sourceName: 'Tıbbi Veri İşleme Teknikerliği', displayName: 'Tıbbi Veri İşleme Teknikerliği', unit: 'Sağlık Hizmetleri Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['TVİT', 'Tıbbi Veri', 'Tıbbi Veri İşleme'] }, 'balgat'),
  program({ order: '79', slug: 'bilgisayar_programciligi_program_bilgileri', sourceName: 'Bilgisayar Programcılığı', displayName: 'Bilgisayar Programcılığı', unit: 'Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['Bilgisayar Programcılığı', 'BP'] }, 'balgat'),
  program({ order: '80', slug: 'eczane_hizmetleri_program_bilgileri', sourceName: 'Eczane Hizmetleri', displayName: 'Eczane Hizmetleri', unit: 'Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['Eczane Hizmetleri', 'Eczane Teknikerliği'] }, 'balgat'),
  program({ order: '81', slug: 'elektrik_program_bilgileri', sourceName: 'Elektrik', displayName: 'Elektrik', unit: 'Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['Elektrik'] }, 'balgat'),
  program({ order: '82', slug: 'grafik_tasarim_program_bilgileri', sourceName: 'Grafik Tasarım', displayName: 'Grafik Tasarım', unit: 'Meslek Yüksekokulu', degree: 'ön lisans', aliases: ['Grafik Tasarım', 'Grafik Tasarımı'] }, 'balgat'),
]

function normalizeSourceName(value: string) {
  return value
    .replace(/^T\.Dokümantasyon/u, 'Tıbbi Dokümantasyon')
    .replace(/\s+Yeni$/u, '')
    .trim()
}

function parseVariant(rawName: string) {
  const match = rawName.match(/\s+\((Ücretli|Burslu|%50 İnd\.|%50 İndirimli)\)\s*(?:Yeni)?$/u)
  if (!match?.[1]) return null

  const variant = match[1] === '%50 İnd.' ? '%50 İndirimli' : match[1]
  return {
    sourceName: normalizeSourceName(rawName.slice(0, match.index)),
    variant: variant as ProgramOption['variant'],
  }
}

function parseOptions(markdown: string) {
  const byProgram = new Map<string, ProgramOption[]>()

  for (const line of markdown.split(/\r?\n/u)) {
    if (!line.startsWith('|')) continue
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    if (cells.length !== 7 || cells[0] === 'Puan Kodu' || /^-{3,}$/u.test(cells[0] ?? '')) continue

    const parsedName = parseVariant(cells[1] ?? '')
    if (!parsedName) continue
    const options = byProgram.get(parsedName.sourceName) ?? []
    options.push({
      variant: parsedName.variant,
      pointType: cells[2] ?? '',
      quota: cells[3] ?? '',
      rank: cells[4] === '-' ? null : (cells[4] ?? null),
      score: cells[5] === '-' ? null : (cells[5] ?? null),
      fee: cells[6] === '-' ? null : (cells[6] ?? null),
    })
    byProgram.set(parsedName.sourceName, options)
  }

  return byProgram
}

function formatOption(option: ProgramOption) {
  const fee = option.fee ? `, ${option.fee} TL` : ''
  const outcome = option.score && option.rank
    ? `; 2024 taban puanı ${option.score}, başarı sırası ${option.rank}`
    : ''
  return `- ${option.variant}: ${option.quota} kontenjan${fee}${outcome}.`
}

function buildTriggers(definition: ProgramDefinition) {
  const primary = definition.aliases[0] ?? definition.displayName
  const triggers = new Set([
    `${definition.displayName} var mı?`,
    `${primary} ücreti ne kadar?`,
    `${primary} kontenjanı kaç?`,
    `${primary} taban puanı nedir?`,
    `${primary} başarı sırası kaç?`,
    `${primary} hangi puan türüyle alıyor?`,
    `${primary} hangi kampüste?`,
    `${primary} burslu ve yüzde 50 seçenekleri neler?`,
    ...definition.aliases.map((alias) => `${alias} nedir?`),
  ])
  return [...triggers]
}

function buildResponse(definition: ProgramDefinition, options: ProgramOption[], preparationFee: string | null) {
  const pointTypes = [...new Set(options.map((option) => option.pointType).filter(Boolean))]
  const hasOutcomes = options.some((option) => option.score && option.rank)
  const lines = [
    `${definition.displayName}, ${definition.unit} bünyesinde bir ${definition.degree} programıdır. ${definition.campus}'nde, ${definition.address} adresinde eğitim verir.`,
    '',
    `Puan türü: ${pointTypes.join(' / ')}. 2025 kontenjan ve ücret bilgileri:`,
    ...options.map(formatOption),
  ]

  if (!hasOutcomes) {
    lines.push('', 'Bu program için 2024 taban puanı ve başarı sırası belirtilmiyor.')
  }
  if (preparationFee) {
    lines.push('', `İngilizce hazırlık ücreti 2025 için ${preparationFee} TL'dir.`)
  }
  if (!options.some((option) => option.variant === 'Burslu')) {
    lines.push('', `${definition.displayName} için 2025'te ayrıca Burslu kontenjan bulunmuyor.`)
  }

  lines.push(
    '',
    'Ücret ve kontenjanlar 2025; taban puanı ve başarı sırası 2024 verileridir.',
    '',
    'İstersen ücretli, burslu ve %50 indirimli seçenekleri hedef sıralamana göre birlikte karşılaştırabiliriz.'
  )
  return lines.join('\n')
}

export function buildYiuProgramFactIntents(markdown: string): YiuProgramFactIntent[] {
  const optionsByProgram = parseOptions(markdown)
  const preparationFee = markdown.match(/\| - \| Tıp Fakültesi \(Hazırlık\).*?\| ([\d.]+) \|/u)?.[1] ?? null

  return PROGRAMS.map((definition) => {
    const options = optionsByProgram.get(definition.sourceName)
    if (!options?.length) {
      throw new Error(`Brochure rows missing for ${definition.sourceName}`)
    }

    return {
      order: definition.order,
      slug: definition.slug,
      title: `${SKILL_TITLE_PREFIX}${definition.order} ${definition.slug}`,
      triggerExamples: buildTriggers(definition),
      responseText: buildResponse(
        definition,
        options,
        definition.sourceName === 'Tıp Fakültesi (İngilizce)' ? preparationFee : null
      ),
    }
  })
}

export function renderYiuProgramFactSkillPack(intents: YiuProgramFactIntent[]) {
  const sections = intents.map((intent) => [
    `## ${intent.order}. ${intent.slug}`,
    '',
    'Amaç: Programın varlığı, akademik birimi, yerleşkesi, puan türü, ücret, kontenjan, taban puan ve başarı sırası bilgilerini tek ve doğal bir cevapta sunmak.',
    '',
    'Kullanıcı örnekleri:',
    ...intent.triggerExamples.map((example) => `- ${example}`),
    '',
    'Instructed cevap:',
    '',
    intent.responseText,
    '',
    'Kaynak notu: 2025 doğrulanmış tanıtım verileri; ücret ve kontenjan 2025, taban puan ve başarı sırası 2024.',
  ].join('\n'))

  return [
    '# YİÜ Program Bazlı Broşür Skill Paketi',
    '',
    '> Bu dosya `scripts/skills/build-yiu-program-fact-skill-pack.ts` ile doğrulanmış broşür verisinden üretilir. Elle düzenlemeyin.',
    '',
    sections.join('\n\n---\n\n'),
    '',
    '---',
    '',
  ].join('\n')
}
