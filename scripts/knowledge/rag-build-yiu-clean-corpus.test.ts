import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  deduplicateApprovedFiles,
  selectWebsiteSource,
  type CleanCorpusManifestFile,
} from './rag-build-yiu-clean-corpus'

describe('YIU clean corpus builder', () => {
  it('keeps durable pages and approved prospective-student root pages', () => {
    expect(selectWebsiteSource({
      title: 'Tıp Fakültesi',
      sourceUrl: 'https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi',
      content: 'Tıp Fakültesinin eğitim modeli ve program bilgileri.',
      localPath: 'tip.md',
    })).toMatchObject({ keep: true, reason: 'durable_page' })

    expect(selectWebsiteSource({
      title: 'Aday Öğrenci',
      sourceUrl: 'https://yuksekihtisasuniversitesi.edu.tr/aday-ogrenci',
      content: 'Aday öğrenciler için tercih ve program bilgileri.',
      localPath: 'aday.md',
    })).toMatchObject({ keep: true, reason: 'approved_root_page' })
  })

  it('drops transient history, listing pages, and navigation-only crawl bodies', () => {
    expect(selectWebsiteSource({
      title: '2020-2021 Eğitim Ücretleri',
      sourceUrl: 'https://yuksekihtisasuniversitesi.edu.tr/duyuru/2020-2021-egitim-ucretleri',
      content: '2020-2021 Eğitim Ücretleri. 06 Temmuz 2020',
      localPath: 'old-fee.md',
    })).toEqual({ keep: false, reason: 'transient_history' })

    expect(selectWebsiteSource({
      title: 'Tüm Haberler',
      sourceUrl: 'https://yuksekihtisasuniversitesi.edu.tr/haberler/index/105',
      content: 'Tüm haberlerin sayfalı listesi.',
      localPath: 'news-index.md',
    })).toEqual({ keep: false, reason: 'listing_page' })

    expect(selectWebsiteSource({
      title: 'Raporlar',
      sourceUrl: 'https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/raporlar',
      content: 'Introduction Video Fees and Scholarships Frequently Asked Questions Clarification Text',
      localPath: 'empty.md',
    })).toEqual({ keep: false, reason: 'navigation_only' })
  })

  it('prefers the faculty-page source for exact duplicate PDFs', async () => {
    const bytes = Buffer.from('same pdf bytes')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const institutionalCopy: CleanCorpusManifestFile = {
      label: 'Tıp Fakültesi Klinik Beceri Eğitimi Yönergesi',
      localPath: 'institutional.pdf',
      sourceUrl: 'https://example.edu/Uploads/icerik_yonetimi_view/a.pdf',
      contentType: 'approved_pdf',
      expectedTopics: ['klinik beceri'],
    }
    const facultyCopy: CleanCorpusManifestFile = {
      ...institutionalCopy,
      localPath: 'faculty.pdf',
      sourceUrl: 'https://example.edu/Uploads/akademik_view/icerik_yonetimi_view/b.pdf',
    }

    const result = await deduplicateApprovedFiles(
      [institutionalCopy, facultyCopy],
      async () => ({ sha256, sizeBytes: bytes.length })
    )

    expect(result.files).toEqual([facultyCopy])
    expect(result.duplicates).toEqual([
      expect.objectContaining({ kept: 'faculty.pdf', removed: 'institutional.pdf', sha256 }),
    ])
  })

  it('keeps similarly named PDFs when their bytes differ', async () => {
    const first: CleanCorpusManifestFile = {
      label: 'Tıp Fakültesi Ölçme ve Değerlendirme Yönergesi',
      localPath: 'measure.pdf',
      contentType: 'approved_pdf',
      expectedTopics: [],
    }
    const second: CleanCorpusManifestFile = {
      label: 'Tıp Fakültesi Eğitim Öğretim ve Sınav Uygulamaları Yönergesi',
      localPath: 'exam.pdf',
      contentType: 'approved_pdf',
      expectedTopics: [],
    }

    const result = await deduplicateApprovedFiles(
      [first, second],
      async (filePath) => ({ sha256: filePath, sizeBytes: filePath.length })
    )

    expect(result.files).toHaveLength(2)
    expect(result.duplicates).toHaveLength(0)
  })
})
