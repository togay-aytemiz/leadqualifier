import { describe, expect, it } from 'vitest'
import {
  buildVectorStoreFileAttributes,
  buildWebsiteMarkdownPackages,
  buildYiuApprovedCorpusManifest,
} from './rag-build-yiu-approved-corpus-manifest'

describe('YIU approved corpus manifest builder', () => {
  it('packages non-PDF website crawl pages into source-indexed markdown bundles', () => {
    const packages = buildWebsiteMarkdownPackages({
      outputDir: 'tmp/rag-evals/yiu-approved-corpus/website-packages',
      generatedAt: '2026-06-04T00:00:00.000Z',
      maxPackageBytes: 10000,
      websitePages: [
        {
          localPath: 'tmp/crawl-output/yuksek-ihtisas/corpus/aday-ogrenci.md',
          markdown: [
            '# Aday Öğrenci',
            '',
            'Source URL: https://yuksekihtisasuniversitesi.edu.tr/aday-ogrenci',
            'Crawled At: 2026-05-14T14:09:28.597Z',
            '',
            '## Content',
            '',
            'Tıp Fakültesi',
          ].join('\n'),
        },
        {
          localPath: 'tmp/crawl-output/yuksek-ihtisas/corpus/duyuru-2026.md',
          markdown: [
            '# Tanıtım Duyurusu',
            '',
            'Source URL: https://yuksekihtisasuniversitesi.edu.tr/duyuru/tanitim-duyurusu',
            '',
            '## Content',
            '',
            'Tanıtım günleri duyurusu.',
          ].join('\n'),
        },
        {
          localPath: 'tmp/crawl-output/yuksek-ihtisas/corpus/pdf-link.md',
          markdown: [
            '# PDF Sayfası',
            '',
            'Source URL: https://yuksekihtisasuniversitesi.edu.tr/uploads/ornek.pdf',
            '',
            '## Content',
            '',
            'PDF content',
          ].join('\n'),
        },
      ],
    })

    expect(packages).toHaveLength(2)
    expect(packages[0]).toMatchObject({
      label: 'YİÜ Website - Admissions - 001',
      localPath: 'tmp/rag-evals/yiu-approved-corpus/website-packages/yiu-website-admissions-001.md',
      sourceGroup: 'admissions',
      contentType: 'website_package',
      expectedTopics: ['Aday Öğrenci'],
    })
    expect(packages[0]?.markdown).toContain('## Source Index')
    expect(packages[0]?.markdown).toContain(
      '- [1] Aday Öğrenci - https://yuksekihtisasuniversitesi.edu.tr/aday-ogrenci'
    )
    expect(packages[0]?.markdown).toContain('Tıp Fakültesi')
  })

  it('combines packaged website markdown files with approved link PDFs', () => {
    const websitePackages = buildWebsiteMarkdownPackages({
      outputDir: 'tmp/rag-evals/yiu-approved-corpus/website-packages',
      generatedAt: '2026-06-04T00:00:00.000Z',
      maxPackageBytes: 10000,
      websitePages: [
        {
          localPath: 'tmp/crawl-output/yuksek-ihtisas/corpus/aday-ogrenci.md',
          markdown: [
            '# Aday Öğrenci',
            '',
            'Source URL: https://yuksekihtisasuniversitesi.edu.tr/aday-ogrenci',
            'Crawled At: 2026-05-14T14:09:28.597Z',
            '',
            '## Content',
            '',
            'Tıp Fakültesi',
          ].join('\n'),
        },
        {
          localPath: 'tmp/crawl-output/yuksek-ihtisas/corpus/pdf-link.md',
          markdown: [
            '# PDF Sayfası',
            '',
            'Source URL: https://yuksekihtisasuniversitesi.edu.tr/uploads/ornek.pdf',
            '',
            '## Content',
            '',
            'PDF content',
          ].join('\n'),
        },
      ],
    })

    const manifest = buildYiuApprovedCorpusManifest({
      websitePackages,
      pdfManifest: {
        story: 'yiu-link-pdfs',
        files: [
          {
            label: 'Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği',
            localPath:
              'tmp/rag-evals/yiu-link-pdfs/files/011-on-lisans-ve-lisans-egitim-ogretim-ve-sinav-yonetmeligi.pdf',
            sourceUrl:
              'https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/fd739ffee9e505aa32e57c7980dfcb7f.pdf',
            sourcePage:
              'https://yuksekihtisasuniversitesi.edu.tr/sayfa/kurumsal/kurumsal-bilgiler/mevzuat',
            expectedTopics: ['Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği'],
          },
        ],
      },
    })

    expect(manifest).toMatchObject({
      story: 'yiu-approved-corpus-pre-brochure',
      files: [
        {
          label: 'YİÜ Website - Admissions - 001',
          localPath:
            'tmp/rag-evals/yiu-approved-corpus/website-packages/yiu-website-admissions-001.md',
          contentType: 'website_package',
          expectedTopics: ['Aday Öğrenci'],
        },
        {
          label: 'Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği',
          localPath:
            'tmp/rag-evals/yiu-link-pdfs/files/011-on-lisans-ve-lisans-egitim-ogretim-ve-sinav-yonetmeligi.pdf',
          sourceUrl:
            'https://yuksekihtisasuniversitesi.edu.tr/Uploads/icerik_yonetimi_view/fd739ffee9e505aa32e57c7980dfcb7f.pdf',
          sourcePage:
            'https://yuksekihtisasuniversitesi.edu.tr/sayfa/kurumsal/kurumsal-bilgiler/mevzuat',
          contentType: 'approved_pdf',
          expectedTopics: ['Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği'],
        },
      ],
    })
    expect(manifest.files).toHaveLength(2)
  })

  it('builds compact vector store attributes for future metadata filtering', () => {
    expect(
      buildVectorStoreFileAttributes({
        story: 'yiu-approved-corpus-pre-brochure',
        label: 'YİÜ Website - Admissions - 001',
        basename: 'yiu-website-admissions-001.md',
        contentType: 'website_package',
        sourceGroup: 'admissions',
        sourceUrl: 'https://yuksekihtisasuniversitesi.edu.tr/aday-ogrenci',
      })
    ).toEqual({
      story: 'yiu-approved-corpus-pre-brochure',
      label: 'YİÜ Website - Admissions - 001',
      basename: 'yiu-website-admissions-001.md',
      content_type: 'website_package',
      source_group: 'admissions',
      source_url: 'https://yuksekihtisasuniversitesi.edu.tr/aday-ogrenci',
    })
  })
})
