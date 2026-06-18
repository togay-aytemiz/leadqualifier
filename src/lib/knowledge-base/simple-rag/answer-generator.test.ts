import { describe, expect, it, vi } from 'vitest'

import { generateSimpleRagAnswer } from './answer-generator'

const chunks = [
  {
    id: 'C1',
    fileId: 'file_1',
    filename: 'medicine.md',
    title: 'Tıp Programı',
    url: 'https://example.edu.tr/medicine',
    score: 0.94,
    content: 'Tıp Fakültesi eğitim süresi hazırlık sınıfı hariç 6 yıldır.',
  },
]

function completion(payload: Record<string, unknown>) {
  return {
    choices: [{ message: { content: JSON.stringify(payload) } }],
    usage: { prompt_tokens: 90, completion_tokens: 20, total_tokens: 110 },
  }
}

describe('generateSimpleRagAnswer', () => {
  it('answers from selected chunks and receives history only as continuity context', async () => {
    const createCompletion = vi.fn(async (_args: Record<string, unknown>) =>
      completion({
        status: 'answer',
        answer: 'Tıp Fakültesi eğitimi hazırlık sınıfı hariç 6 yıldır.',
        used_chunk_ids: ['C1'],
      })
    )

    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'Peki kaç yıl?',
      standaloneQuery: 'Tıp Fakültesi eğitim süresi kaç yıldır?',
      recentMessages: [{ role: 'user', content: 'Tıp Fakültesini soruyorum.' }],
      responseLanguage: 'tr',
      chunks,
      createCompletion,
    })

    expect(result).toMatchObject({
      status: 'answer',
      answer: 'Tıp Fakültesi eğitimi hazırlık sınıfı hariç 6 yıldır.',
      usedChunkIds: ['C1'],
      selectedChunks: chunks,
    })
    const request = createCompletion.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>
    }
    expect(request.messages[0]?.content).toContain('Retrieved chunks are the only factual authority')
    expect(request.messages[0]?.content).toContain('Answer only the requested facet')
    expect(request.messages[0]?.content).toContain(
      'Do not use audience-specific evidence such as international or YÖS fees'
    )
    expect(request.messages[0]?.content).toContain(
      'prefer a matching verified brochure table chunk over website prose'
    )
    expect(request.messages[0]?.content).toContain(
      'summarize the directly relevant supported facts from chunks'
    )
    expect(request.messages[0]?.content).toContain(
      'Prefer a useful grounded partial answer over no_info'
    )
    expect(request.messages[0]?.content).toContain(
      'Never infer an organization-specific program duration from general degree regulations'
    )
    expect(request.messages[1]?.content).toContain('Peki kaç yıl?')
    expect(request.messages[1]?.content).toContain('Tıp Fakültesini soruyorum.')
    expect(request.messages[1]?.content).toContain('[C1] Tıp Programı')
  })

  it('rejects an answer that invents a protected numeric value', async () => {
    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'Kaç yıl?',
      standaloneQuery: 'Tıp Fakültesi eğitim süresi kaç yıldır?',
      recentMessages: [],
      responseLanguage: 'tr',
      chunks,
      createCompletion: vi.fn(async () =>
        completion({
          status: 'answer',
          answer: 'Tıp Fakültesi eğitimi 4 yıldır.',
          used_chunk_ids: ['C1'],
        })
      ),
    })

    expect(result).toMatchObject({ status: 'no_info', reason: 'unsupported_protected_value' })
  })

  it('rejects an answer that attaches a supported price to the wrong requested program', async () => {
    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'Tıbbi Görüntüleme Teknikleri ücreti nedir?',
      standaloneQuery: 'Tıbbi Görüntüleme Teknikleri öğrenim ücreti ücret tablosu',
      recentMessages: [],
      responseLanguage: 'tr',
      chunks: [
        {
          id: 'C1',
          fileId: 'file_1',
          filename: 'brochure.md',
          title: 'Sağlık Hizmetleri Meslek Yüksekokulu Kontenjan ve Ücretler',
          score: 0.84,
          content:
            'Tıbbi Laboratuvar Teknikleri (Ücretli): kontenjan 10, ücret 330.000 TL. Anestezi (Ücretli): kontenjan 10, ücret 330.000 TL.',
        },
      ],
      createCompletion: vi.fn(async () =>
        completion({
          status: 'answer',
          answer: 'Tıbbi Görüntüleme Teknikleri programının öğrenim ücreti 330.000 TL’dir.',
          used_chunk_ids: ['C1'],
        })
      ),
    })

    expect(result).toMatchObject({
      status: 'no_info',
      reason: 'unsupported_requested_subject:Tıbbi Görüntüleme Teknikleri',
    })
  })

  it('rejects unknown chunk ids', async () => {
    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'Kaç yıl?',
      standaloneQuery: 'Tıp Fakültesi eğitim süresi kaç yıldır?',
      recentMessages: [],
      responseLanguage: 'tr',
      chunks,
      createCompletion: vi.fn(async () =>
        completion({
          status: 'answer',
          answer: 'Tıp Fakültesi eğitimi 6 yıldır.',
          used_chunk_ids: ['C99'],
        })
      ),
    })

    expect(result).toMatchObject({ status: 'no_info', reason: 'invalid_chunk_ids' })
  })

  it('rejects speculative facility availability inferred from related evidence', async () => {
    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'Röntgen cihazı var mı?',
      standaloneQuery: 'Üniversite röntgen cihazı var mı?',
      recentMessages: [],
      responseLanguage: 'tr',
      chunks: [
        {
          id: 'C1',
          fileId: 'file_1',
          filename: 'biomedical.md',
          title: 'Biyomedikal Cihaz Teknolojisi',
          score: 0.82,
          content: 'Biyomedikal cihaz teknikerleri röntgen cihazlarının bakım ve onarım süreçlerinde görev alabilir.',
        },
      ],
      createCompletion: vi.fn(async () =>
        completion({
          status: 'answer',
          answer: 'Bu kapsamda röntgen cihazlarının mevcut olduğu anlaşılmaktadır.',
          used_chunk_ids: ['C1'],
        })
      ),
    })

    expect(result).toMatchObject({
      status: 'no_info',
      reason: 'speculative_facility_availability',
    })
  })

  it('rejects positive facility availability when support only describes a related job role', async () => {
    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'Röntgen cihazı var mı?',
      standaloneQuery: 'Üniversite röntgen cihazı var mı?',
      recentMessages: [],
      responseLanguage: 'tr',
      chunks: [
        {
          id: 'C1',
          fileId: 'file_1',
          filename: 'biomedical.md',
          title: 'Biyomedikal Cihaz Teknolojisi',
          score: 0.82,
          content: 'Biyomedikal cihaz teknikerleri röntgen cihazlarının bakım, onarım, kurulum ve testinden sorumludur.',
        },
      ],
      createCompletion: vi.fn(async () =>
        completion({
          status: 'answer',
          answer: 'Yüksek İhtisas Üniversitesi bünyesinde röntgen cihazı bulunmaktadır.',
          used_chunk_ids: ['C1'],
        })
      ),
    })

    expect(result).toMatchObject({
      status: 'no_info',
      reason: 'unsupported_facility_availability:rontgen',
    })
  })

  it('rejects device training location inferred from only program campus evidence', async () => {
    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'Tıbbi Görüntüleme için cihaz eğitimi nerede veriliyor?',
      standaloneQuery: 'Tıbbi Görüntüleme cihaz eğitimi nerede veriliyor?',
      recentMessages: [],
      responseLanguage: 'tr',
      chunks: [
        {
          id: 'C1',
          fileId: 'file_1',
          filename: 'campuses.md',
          title: 'Program ve Yerleşke Eşleşmeleri',
          score: 0.88,
          content: 'Tıbbi Görüntüleme Teknikleri programı Balgat Yerleşkesinde yer almaktadır.',
        },
      ],
      createCompletion: vi.fn(async () =>
        completion({
          status: 'answer',
          answer: 'Tıbbi Görüntüleme cihaz eğitimi Balgat Yerleşkesinde verilmektedir.',
          used_chunk_ids: ['C1'],
        })
      ),
    })

    expect(result).toMatchObject({
      status: 'no_info',
      reason: 'unsupported_facility_availability:cihaz egitimi',
    })
  })

  it('allows positive facility availability when support directly states quantity or availability', async () => {
    const localChunks = [
      {
        id: 'C1',
        fileId: 'file_1',
        filename: 'anatomy.md',
        title: 'Laboratuvar Bilgileri',
        score: 0.9,
        content: 'Anatomi laboratuvarında iki adet kadavra ve maketlerle uygulamalar gerçekleştirilmektedir.',
      },
    ]
    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'Kadavra var mı?',
      standaloneQuery: 'Üniversite kadavra var mı?',
      recentMessages: [],
      responseLanguage: 'tr',
      chunks: localChunks,
      createCompletion: vi.fn(async () =>
        completion({
          status: 'answer',
          answer: 'Evet, anatomi laboratuvarında iki adet kadavra bulunmaktadır.',
          used_chunk_ids: ['C1'],
        })
      ),
    })

    expect(result).toMatchObject({
      status: 'answer',
      answer: 'Evet, anatomi laboratuvarında iki adet kadavra bulunmaktadır.',
      selectedChunks: localChunks,
    })
  })

  it('rejects ambulance practice claims inferred from job-role outcomes', async () => {
    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'İlk ve Acil Yardım öğrencileri ambulansta uygulama yapıyor mu?',
      standaloneQuery: 'İlk ve Acil Yardım öğrencileri ambulansta uygulama yapıyor mu?',
      recentMessages: [],
      responseLanguage: 'tr',
      chunks: [
        {
          id: 'C1',
          fileId: 'file_1',
          filename: 'first-aid.md',
          title: 'İlk ve Acil Yardım',
          score: 0.86,
          content: 'İlk ve Acil Yardım mezunları ambulans ekiplerinde görev alabilecek bilgi ve beceriyle yetiştirilir.',
        },
      ],
      createCompletion: vi.fn(async () =>
        completion({
          status: 'answer',
          answer: 'Evet, öğrenciler ambulansta uygulama yapar.',
          used_chunk_ids: ['C1'],
        })
      ),
    })

    expect(result).toMatchObject({
      status: 'no_info',
      reason: 'unsupported_operational_claim:ambulans',
    })
  })

  it('rejects patient volume claims inferred from generic hospital or center wording', async () => {
    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'Özel hastane olduğu için vaka az olmaz mı?',
      standaloneQuery: 'Yüksek İhtisas Üniversitesi Tıp Fakültesi vaka çeşitliliği hasta sayısı',
      recentMessages: [],
      responseLanguage: 'tr',
      chunks: [
        {
          id: 'C1',
          fileId: 'file_1',
          filename: 'medicine-center.md',
          title: 'Araştırma ve Uygulama Merkezi',
          score: 0.78,
          content: 'Merkez, sağlık alanında bilimsel araştırmalar yürütmeyi ve nitelikli insan gücü yetiştirmeyi amaçlar.',
        },
      ],
      createCompletion: vi.fn(async () =>
        completion({
          status: 'answer',
          answer: 'Vaka sayısının az olması söz konusu değildir; öğrenciler geniş hasta ve vaka çeşitliliği görür.',
          used_chunk_ids: ['C1'],
        })
      ),
    })

    expect(result).toMatchObject({
      status: 'no_info',
      reason: 'unsupported_operational_claim:hasta,vaka',
    })
  })

  it('rejects own hospital existence inferred from the founder foundation or health center wording', async () => {
    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'Yüksek İhtisas Üniversitesi Hastanesi var mı?',
      standaloneQuery: 'Yüksek İhtisas Üniversitesi Hastanesi var mı kendi hastanesi',
      recentMessages: [],
      responseLanguage: 'tr',
      chunks: [
        {
          id: 'C1',
          fileId: 'file_1',
          filename: 'foundation.md',
          title: 'Kurucu Vakıf',
          score: 0.86,
          content:
            'Yüksek İhtisas Üniversitesi, Türkiye Yüksek İhtisas Hastanesi Vakfı (TİVAK) tarafından kurulmuştur. Üniversitenin kurucusu olan bu vakıf tarafından hastane hizmeti sunulur.',
        },
        {
          id: 'C2',
          fileId: 'file_2',
          filename: 'suam.md',
          title: 'Sağlık Uygulama ve Araştırma Merkezi',
          score: 0.81,
          content:
            'Sağlık Uygulama ve Araştırma Merkezi, tıp ve sağlık bilimleri alanında eğitim, araştırma ve uygulama çalışmalarını destekler.',
        },
      ],
      createCompletion: vi.fn(async () =>
        completion({
          status: 'answer',
          answer:
            "Evet, Yüksek İhtisas Üniversitesi'nin Türkiye Yüksek İhtisas Hastanesi Vakfı tarafından kurulan bir hastanesi bulunmaktadır.",
          used_chunk_ids: ['C1', 'C2'],
        })
      ),
    })

    expect(result).toMatchObject({
      status: 'no_info',
      reason: 'unsupported_hospital_identity',
    })
  })

  it('allows operational claims when support directly states the practice', async () => {
    const localChunks = [
      {
        id: 'C1',
        fileId: 'file_1',
        filename: 'first-aid.md',
        title: 'İlk ve Acil Yardım Uygulama',
        score: 0.91,
        content: 'İlk ve Acil Yardım öğrencileri ambulans uygulamasına çıkar ve acil sağlık hizmetleri uygulamalarına katılır.',
      },
    ]
    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'İlk ve Acil Yardım öğrencileri ambulansta uygulama yapıyor mu?',
      standaloneQuery: 'İlk ve Acil Yardım öğrencileri ambulansta uygulama yapıyor mu?',
      recentMessages: [],
      responseLanguage: 'tr',
      chunks: localChunks,
      createCompletion: vi.fn(async () =>
        completion({
          status: 'answer',
          answer: 'Evet, İlk ve Acil Yardım öğrencileri ambulans uygulamasına çıkar.',
          used_chunk_ids: ['C1'],
        })
      ),
    })

    expect(result).toMatchObject({
      status: 'answer',
      answer: 'Evet, İlk ve Acil Yardım öğrencileri ambulans uygulamasına çıkar.',
      selectedChunks: localChunks,
    })
  })
})
