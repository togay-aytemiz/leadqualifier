import { describe, expect, it } from 'vitest'
import {
  buildCitationSourcesByFilename,
  buildCitationSourcesByFilenameFromManifestJson,
  buildBrochureSourceManifestFromIndexedFiles,
  evaluateBrochureVectorStoreReadiness,
  parseBrochureSourceManifest,
} from './brochure-readiness'

describe('brochure readiness', () => {
  const approvedManifestJson = JSON.stringify({
    corpus_scope: 'yiu-tanitim-gunleri-2026',
    sources: [
      {
        openai_file_id: 'file_brochure',
        filename: 'brochure.pdf',
        approved_source_title: 'YIU Tanitim Gunleri Brosuru',
        approved_source_url: 'https://example.edu.tr/brochure.pdf',
        display_label: 'Tanitim Gunleri Brosuru',
        content_type: 'brochure_pdf',
        customer_approved: true,
      },
    ],
  })

  it('accepts a completed vector store with a complete approved source manifest', () => {
    const manifest = parseBrochureSourceManifest(approvedManifestJson)

    const result = evaluateBrochureVectorStoreReadiness({
      expectedFileCount: 1,
      sourceManifest: manifest,
      vectorStore: {
        id: 'vs_ready',
        status: 'completed',
        usage_bytes: 12345,
        expires_after: { anchor: 'last_active_at', days: 30 },
        file_counts: {
          total: 1,
          completed: 1,
          failed: 0,
          cancelled: 0,
          in_progress: 0,
        },
      },
    })

    expect(result.ready).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.usageBytes).toBe(12345)
  })

  it('blocks preview when vector store processing or source approval is incomplete', () => {
    const manifest = parseBrochureSourceManifest(
      JSON.stringify({
        corpus_scope: 'yiu-tanitim-gunleri-2026',
        sources: [
          {
            openai_file_id: 'file_brochure',
            filename: 'brochure.pdf',
            approved_source_title: 'YIU Tanitim Gunleri Brosuru',
            display_label: 'Tanitim Gunleri Brosuru',
            content_type: 'brochure_pdf',
            customer_approved: false,
          },
        ],
      })
    )

    const result = evaluateBrochureVectorStoreReadiness({
      expectedFileCount: 1,
      sourceManifest: manifest,
      vectorStore: {
        id: 'vs_processing',
        status: 'in_progress',
        usage_bytes: 0,
        file_counts: {
          total: 1,
          completed: 0,
          failed: 0,
          cancelled: 0,
          in_progress: 1,
        },
      },
    })

    expect(result.ready).toBe(false)
    expect(result.failures).toContain('Vector store status must be completed')
    expect(result.failures).toContain('Source manifest has unapproved visitor-visible rows')
  })

  it('builds visitor-safe citation mapping from approved rows only', () => {
    const manifest = parseBrochureSourceManifest(
      JSON.stringify({
        corpus_scope: 'yiu-tanitim-gunleri-2026',
        sources: [
          {
            openai_file_id: 'file_brochure',
            filename: 'brochure.pdf',
            approved_source_title: 'YIU Tanitim Gunleri Brosuru',
            approved_source_url: 'https://example.edu.tr/brochure.pdf',
            display_label: 'Tanitim Gunleri Brosuru',
            content_type: 'brochure_pdf',
            customer_approved: true,
          },
          {
            openai_file_id: 'file_draft',
            filename: 'draft.pdf',
            approved_source_title: 'Draft',
            display_label: 'Draft',
            content_type: 'approved_question_sheet',
            customer_approved: false,
          },
        ],
      })
    )

    expect(buildCitationSourcesByFilename(manifest)).toEqual({
      'brochure.pdf': {
        title: 'Tanitim Gunleri Brosuru',
        url: 'https://example.edu.tr/brochure.pdf',
      },
    })
  })

  it('builds citation mapping from approved brochure and legacy story manifests', () => {
    expect(buildCitationSourcesByFilenameFromManifestJson(approvedManifestJson)).toEqual({
      'brochure.pdf': {
        title: 'Tanitim Gunleri Brosuru',
        url: 'https://example.edu.tr/brochure.pdf',
      },
    })

    expect(
      buildCitationSourcesByFilenameFromManifestJson(
        JSON.stringify({
          story: 'legacy',
          files: [
            {
              label: 'Legacy Brochure',
              localPath: 'tmp/approved/legacy.pdf',
              sourceUrl: 'https://example.edu.tr/legacy.pdf',
            },
          ],
        })
      )
    ).toEqual({
      'legacy.pdf': {
        title: 'Legacy Brochure',
        url: 'https://example.edu.tr/legacy.pdf',
      },
    })
  })

  it('builds an approved source manifest skeleton from indexed ingest files', () => {
    expect(
      buildBrochureSourceManifestFromIndexedFiles({
        corpusScope: 'yiu-tanitim-gunleri-2026',
        files: [
          {
            label: 'Tanitim Brosuru',
            localPath: '/tmp/yiu/brochure.pdf',
            openaiFileId: 'file_brochure',
            sourceUrl: 'https://example.edu.tr/brochure.pdf',
          },
        ],
      })
    ).toEqual({
      corpus_scope: 'yiu-tanitim-gunleri-2026',
      sources: [
        {
          openai_file_id: 'file_brochure',
          filename: 'brochure.pdf',
          approved_source_title: 'Tanitim Brosuru',
          approved_source_url: 'https://example.edu.tr/brochure.pdf',
          display_label: 'Tanitim Brosuru',
          content_type: 'brochure_pdf',
          customer_approved: true,
        },
      ],
    })
  })

  it('preserves approved corpus source type and URL metadata from indexed files', () => {
    const sourceManifest = buildBrochureSourceManifestFromIndexedFiles({
        corpusScope: 'yiu-approved-corpus-pre-brochure',
        files: [
          {
            label: 'Aday Öğrenci',
            localPath: '/tmp/yiu/aday-ogrenci.md',
            openaiFileId: 'file_page',
            sourceUrl: 'https://yuksekihtisasuniversitesi.edu.tr/aday-ogrenci',
            contentType: 'website_package',
          },
          {
            label: 'Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği',
            localPath: '/tmp/yiu/on-lisans-ve-lisans-egitim-ogretim-ve-sinav-yonetmeligi.pdf',
            openaiFileId: 'file_pdf',
            sourceUrl:
              'https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/fd739ffee9e505aa32e57c7980dfcb7f.pdf',
            contentType: 'approved_pdf',
          },
        ],
      })

    expect(sourceManifest).toMatchObject({
      corpus_scope: 'yiu-approved-corpus-pre-brochure',
      sources: [
        {
          filename: 'aday-ogrenci.md',
          approved_source_url: 'https://yuksekihtisasuniversitesi.edu.tr/aday-ogrenci',
          content_type: 'website_package',
          customer_approved: true,
        },
        {
          filename: 'on-lisans-ve-lisans-egitim-ogretim-ve-sinav-yonetmeligi.pdf',
          approved_source_url:
            'https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/fd739ffee9e505aa32e57c7980dfcb7f.pdf',
          content_type: 'approved_pdf',
          customer_approved: true,
        },
      ],
    })
    expect(parseBrochureSourceManifest(JSON.stringify(sourceManifest)).sources[0]).toMatchObject({
      contentType: 'website_package',
    })
  })

  it('accepts categorized verified brochure markdown as a visitor-safe source type', () => {
    const sourceManifest = buildBrochureSourceManifestFromIndexedFiles({
      corpusScope: 'yiu-tanitim-gunleri-2026-approved-corpus',
      files: [
        {
          label: 'YİÜ Tanıtım Broşürü - Tıp Fakültesi Kontenjan ve Ücretler',
          localPath: '/tmp/yiu/brochure-01-tip.md',
          openaiFileId: 'file_brochure_tip',
          contentType: 'brochure_verified_markdown',
        },
      ],
    })

    expect(sourceManifest.sources[0]).toMatchObject({
      filename: 'brochure-01-tip.md',
      content_type: 'brochure_verified_markdown',
      customer_approved: true,
    })
    expect(parseBrochureSourceManifest(JSON.stringify(sourceManifest)).sources[0]).toMatchObject({
      contentType: 'brochure_verified_markdown',
    })
  })
})
