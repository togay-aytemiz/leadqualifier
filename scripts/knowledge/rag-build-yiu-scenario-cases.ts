import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { RagEvalCase } from '@/lib/knowledge-base/rag-eval/types'

type Args = {
  out?: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token?.startsWith('--')) continue
    const key = token.slice(2)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`)
    index += 1
    if (key === 'out') args.out = value
    else throw new Error(`Unknown argument --${key}`)
  }
  return args
}

const CASES: RagEvalCase[] = [
  {
    id: 'yiu-scenario-01',
    question:
      'Bir personel uzun süre ücretsiz izin almak istiyor. Bu izin en fazla ne kadar olabilir?',
    language: 'tr',
    category: 'scenario_supported_policy',
    expectedAnswerTerms: ['1', 'yıl'],
    expectedSourceTerms: ['İzin Kullanımı Yönergesi'],
  },
  {
    id: 'yiu-scenario-02',
    question: 'Sağlık raporum vardı ama sınava yine girdim. Sonradan mazeret saydırabilir miyim?',
    language: 'tr',
    category: 'scenario_supported_policy',
    expectedAnswerTerms: ['geçersiz'],
    expectedSourceTerms: ['Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği'],
  },
  {
    id: 'yiu-scenario-03',
    question: 'Hazırlık sınıfındayım, Erasmus programına başvurabilir miyim?',
    language: 'tr',
    category: 'scenario_supported_policy',
    expectedAnswerTerms: ['Hazırlık'],
    expectedAnyAnswerTermGroups: [['yararlanamaz', 'yararlanamazlar']],
    expectedSourceTerms: ['Erasmus + Yönergesi'],
  },
  {
    id: 'yiu-scenario-04',
    question: 'Yaz okulunda dört ders almak istiyorum. Yönerge buna izin veriyor mu?',
    language: 'tr',
    category: 'scenario_supported_policy',
    expectedAnswerTerms: ['ders'],
    expectedAnyAnswerTermGroups: [['3', 'üç']],
    expectedSourceTerms: ['Yaz Öğretimi Yönergesi'],
    mustNotContain: ['4 ders alabilir'],
  },
  {
    id: 'yiu-scenario-05',
    question: 'Tıp fakültesinde intörnüm, zorunlu stajlara ara vererek devam edebilir miyim?',
    language: 'tr',
    category: 'scenario_supported_policy',
    expectedAnswerTerms: ['intörn'],
    expectedAnyAnswerTermGroups: [['aralıksız', 'devam']],
    expectedSourceTerms: ['Tıp Fakültesi Dönem VI İntörn Hekimlik Eğitimi Yönergesi'],
  },
  {
    id: 'yiu-scenario-06',
    question: 'Çevrimiçi sınav yönergesi hangi tarihte kabul edilmişti?',
    language: 'tr',
    category: 'scenario_supported_policy',
    expectedAnswerTerms: ['06.06.2023'],
    expectedSourceTerms: ['Tıp Fakültesi Çevrimiçi Sınav Yönergesi'],
  },
  {
    id: 'yiu-scenario-07',
    question: 'Engelli öğrencilere yönelik birimin amacı ne?',
    language: 'tr',
    category: 'scenario_supported_policy',
    expectedAnswerTerms: ['engelli', 'öğrenci'],
    expectedSourceTerms: ['Engelli Öğrenci Birimi Yönergesi'],
  },
  {
    id: 'yiu-scenario-08',
    question: 'BİDB neyin kısaltması? Çok kısa anlat.',
    language: 'tr',
    category: 'scenario_supported_acronym',
    expectedAnswerTerms: ['Bilgi İşlem Daire Başkanlığı'],
    expectedAnySourceTermGroups: [
      [
        'Bilgi İşlem Daire Başkanlığı (BİDB)',
        'BİDB Çalışma Usul ve Esasları Hakkındaki Yönerge',
        'BİDB Bilgisayar, Ağ ve Bilişim Kaynakları Kullanım Yönergesi',
      ],
    ],
  },
  {
    id: 'yiu-scenario-09',
    question: 'BAP denilen şey hangi yönerge ile ilgili?',
    language: 'tr',
    category: 'scenario_supported_acronym',
    expectedAnswerTerms: ['Bilimsel Araştırma Projeleri'],
    expectedSourceTerms: ['Bilimsel Araştırma Projeleri Uygulama Yönergesi'],
  },
  {
    id: 'yiu-scenario-10',
    question: 'AKTS ne demek? Öğrenci diliyle açıklar mısın?',
    language: 'tr',
    category: 'scenario_supported_explanation',
    expectedAnswerTerms: ['Avrupa Kredi Transfer Sistemi'],
    expectedSourceTerms: ['Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği'],
  },
  {
    id: 'yiu-scenario-11',
    question: 'Kütüphane yönergesi neyi düzenliyor, tek cümle?',
    language: 'tr',
    category: 'scenario_supported_explanation',
    expectedAnswerTerms: ['Kütüphane'],
    expectedSourceTerms: ['Kütüphane ve Dökümantasyon Daire Başkanlığı Yönergesi'],
  },
  {
    id: 'yiu-scenario-12',
    question: 'SKSDB açılımı nedir?',
    language: 'tr',
    category: 'scenario_supported_acronym',
    expectedAnswerTerms: ['Sağlık', 'Kültür', 'Spor'],
    expectedAnySourceTermGroups: [
      [
        'SKSDB',
        'Sağlık, Kültür ve Spor Dairesi Başkanlığı',
        'Sağlık, Kültür ve Spor Dairesi Başkanlığı Yönergesi',
        'SKSDB Kültür ve Sosyal Hizmetler Yönergesi',
      ],
    ],
  },
  {
    id: 'yiu-scenario-13',
    question: 'TTO hangi ofis?',
    language: 'tr',
    category: 'scenario_supported_acronym',
    expectedAnswerTerms: ['Teknoloji Transfer Ofisi'],
    expectedAnySourceTermGroups: [
      ['Teknoloji Transfer Ofisi Yönergesi', 'Teknoloji Transfer Ofisi (TTO)'],
    ],
  },
  {
    id: 'yiu-scenario-14',
    question: 'UÇEP neyin kısaltması?',
    language: 'tr',
    category: 'scenario_supported_acronym',
    expectedAnyAnswerTermGroups: [
      ['Ulusal Çekirdek Eğitim Programı', 'Ulusal Çekirdek Eğitimi Programı'],
    ],
    expectedSourceTerms: ['Tıp Fakültesi Ulusal Çekirdek Eğitimi Programı Kurulu Yönergesi'],
  },
  {
    id: 'yiu-scenario-15',
    question: 'Özel öğrenci yönergesi hangi senato kararıyla kabul edilmiş?',
    language: 'tr',
    category: 'scenario_supported_policy',
    expectedAnswerTerms: ['2020/87'],
    expectedSourceTerms: ['Özel Öğrenci Yönergesi'],
  },
  {
    id: 'yiu-scenario-16',
    question: "Tıp Fakültesi Klinik Beceri Eğitimi Yönergesi'nin doküman numarası ne?",
    language: 'tr',
    category: 'scenario_supported_policy',
    expectedAnswerTerms: ['TIP.YNG.0015'],
    expectedSourceTerms: ['Tıp Fakültesi Klinik Beceri Eğitimi Yönergesi'],
  },
  {
    id: 'yiu-scenario-17',
    question: "Kaynak linkini de paylaş: Erasmus'ta hazırlık öğrencisi yararlanabiliyor mu?",
    language: 'tr',
    category: 'scenario_supported_source_link',
    expectedAnswerTerms: ['Hazırlık'],
    expectedAnyAnswerTermGroups: [['yararlanamaz', 'yararlanamazlar']],
    expectedSourceTerms: ['Erasmus + Yönergesi'],
  },
  {
    id: 'yiu-scenario-18',
    question: 'Bana robot gibi değil, kısa ve net anlat: ücretsiz izin sınırı ne?',
    language: 'tr',
    category: 'scenario_supported_tone',
    expectedAnswerTerms: ['1', 'yıl'],
    expectedSourceTerms: ['İzin Kullanımı Yönergesi'],
  },
  {
    id: 'yiu-scenario-19',
    question: 'Ders notlarına MEDU’dan mı UZEM’den mi bakacağım?',
    language: 'tr',
    category: 'scenario_unsupported',
    unsupported: true,
    mustNotContain: ['MEDU üzerinden', 'UZEM üzerinden', 'ÖBS üzerinden', 'öğrenci işleri'],
  },
  {
    id: 'yiu-scenario-20',
    question: 'BİDB’nin e-posta adresi nedir?',
    language: 'tr',
    category: 'scenario_unsupported_contact',
    unsupported: true,
    mustNotContain: ['@', 'bilgiislem', 'yiu@yiu'],
  },
  {
    id: 'yiu-scenario-21',
    question: 'Bu PDF’lerde BİDB’ye ait doğrudan bir telefon numarası var mı?',
    language: 'tr',
    category: 'scenario_unsupported_contact',
    unsupported: true,
    mustNotContain: ['0312', '+90', '329 10 10'],
  },
  {
    id: 'yiu-scenario-22',
    question: 'Tıp Fakültesi öğrenim ücreti ne kadar?',
    language: 'tr',
    category: 'scenario_unsupported',
    unsupported: true,
    mustNotContain: ['₺'],
  },
  {
    id: 'yiu-scenario-23',
    question: 'Diş Hekimliği Fakültesi yaz stajı kaç gün?',
    language: 'tr',
    category: 'scenario_unsupported',
    unsupported: true,
    mustNotContain: ['20 iş günü', '30 iş günü', '35 saat', 'haftada 5 gün', '7 saat'],
  },
  {
    id: 'yiu-scenario-24',
    question: '2026 yemek bursu başvuru son tarihi ne?',
    language: 'tr',
    category: 'scenario_unsupported',
    unsupported: true,
    mustNotContain: [
      'Ocak',
      'Şubat',
      'Mart',
      'Nisan',
      'Mayıs',
      'Haziran',
      'Temmuz',
      'Ağustos',
      'Eylül',
      'Ekim',
      'Kasım',
      'Aralık',
    ],
  },
  {
    id: 'yiu-scenario-25',
    question: 'Mezuniyet töreni nerede yapılacak?',
    language: 'tr',
    category: 'scenario_unsupported',
    unsupported: true,
    mustNotContain: ['Basın', 'Halkla İlişkiler'],
  },
]

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const outPath = path.resolve(
    args.out ?? path.join('tmp', 'rag-evals', 'yiu-link-pdfs', 'scenario-cases.json')
  )
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, JSON.stringify(CASES, null, 2), 'utf8')
  console.log(`CASES ${CASES.length}`)
  console.log(`OUTPUT ${outPath}`)
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
