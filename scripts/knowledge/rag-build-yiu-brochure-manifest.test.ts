import { describe, expect, it } from 'vitest'
import {
  buildCategorizedBrochureMarkdownFiles,
  buildYiuBrochureApprovedCorpusManifest,
} from './rag-build-yiu-brochure-manifest'

describe('YIU brochure manifest builder', () => {
  const verifiedMarkdown = [
    '# Verified Brochure',
    '',
    '## Ingest Notları',
    '',
    '- Internal note that should not be uploaded.',
    '',
    '## Kontrol Gerektiren Kaynak Tutarsızlığı',
    '',
    '- Tıbbi Tanıtım ve Pazarlama (Burslu) row needs confirmation.',
    '',
    '## Kapak',
    '',
    'Yüksek İhtisas Üniversitesi.',
    '',
    '## Tanıtım Metni',
    '',
    'Tanıtım metni.',
    '',
    '## Tıp Fakültesi 2025 Kontenjan ve Fiyat Tablosu',
    '',
    '| Puan Kodu | Bölüm Adı |',
    '|---|---|',
    '| 207910033 | Tıp Fakültesi (Ücretli) |',
    '',
    '## Sağlık Bilimleri Fakültesi 2025 Kontenjan ve Fiyat Tablosu',
    '',
    'Beslenme ve Diyetetik.',
    '',
    '## Spor Bilimleri Fakültesi 2025 Kontenjan ve Fiyat Tablosu',
    '',
    'Antrenörlük Eğitimi.',
    '',
    '## Sağlık Hizmetleri Meslek Yüksekokulu 2025 Kontenjan ve Fiyat Tablosu',
    '',
    'Tıbbi Tanıtım ve Pazarlama.',
    '',
    '## Meslek Yüksekokulu 2025 Kontenjan ve Fiyat Tablosu',
    '',
    'Bilgisayar Programcılığı.',
    '',
    '## Çift Anadal Programı',
    '',
    'Çift anadal.',
    '',
    '## Burs İmkanları',
    '',
    'YKS Üstün Başarı Bursu.',
    '',
    '## Fakülte, Program ve Yerleşke Eşleşmeleri',
    '',
    'Balgat Yerleşkesi.',
    '',
    '## Program Listeleri',
    '',
    'Program listeleri.',
    '',
    '## Yerleşke ve İletişim Bilgileri',
    '',
    'İletişim: 0 (312) 329 10 10',
    '',
  ].join('\n')

  it('splits the verified brochure into categorized markdown files without internal ingest notes', () => {
    const files = buildCategorizedBrochureMarkdownFiles({
      verifiedMarkdown,
      outputDir: 'tmp/rag-evals/yiu-approved-corpus/brochure-packages',
      generatedAt: '2026-06-04T00:00:00.000Z',
    })

    expect(files).toHaveLength(8)
    expect(files.map((file) => file.localPath)).toContain(
      'tmp/rag-evals/yiu-approved-corpus/brochure-packages/brochure-04-shmyo.md'
    )
    expect(files.every((file) => file.contentType === 'brochure_verified_markdown')).toBe(true)
    expect(files[0]?.markdown).toContain('İletişim: 0 (312) 329 10 10')
    expect(files[0]?.markdown).not.toContain('Internal note')

    const shmyo = files.find((file) => file.localPath.endsWith('brochure-04-shmyo.md'))
    expect(shmyo?.markdown).toContain('Kontrol Gerektiren Kaynak Tutarsızlığı')
    expect(shmyo?.markdown).toContain('Tıbbi Tanıtım ve Pazarlama')
  })

  it('combines the base approved corpus with categorized brochure files', () => {
    const brochureFiles = buildCategorizedBrochureMarkdownFiles({
      verifiedMarkdown,
      outputDir: 'tmp/rag-evals/yiu-approved-corpus/brochure-packages',
      generatedAt: '2026-06-04T00:00:00.000Z',
    })

    const manifest = buildYiuBrochureApprovedCorpusManifest({
      baseManifest: {
        story: 'yiu-approved-corpus-pre-brochure',
        files: [
          {
            label: 'YİÜ Website - Admissions - 001',
            localPath: 'tmp/rag-evals/yiu-approved-corpus/website-packages/yiu-website-admissions-001.md',
            contentType: 'website_package',
          },
        ],
      },
      brochureFiles,
    })

    expect(manifest.story).toBe('yiu-tanitim-gunleri-2026-approved-corpus')
    expect(manifest.scope.brochure).toBe('verified_customer_brochure_markdown')
    expect(manifest.files).toHaveLength(9)
    expect(manifest.files.at(-1)).toMatchObject({
      contentType: 'brochure_verified_markdown',
      sourceGroup: 'brochure-campus-program-map',
    })
  })
})
