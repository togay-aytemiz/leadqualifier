import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
    buildDryRunReport,
    createWebsiteChunks,
    parseCrawlMarkdown,
    renderImportReport
} from './crawl-corpus-importer.mjs'

describe('crawl corpus importer', () => {
    it('parses crawler markdown into source metadata and clean content', () => {
        const page = parseCrawlMarkdown(`# Akademik Takvim

Source URL: https://example.edu.tr/akademik-takvim
Crawled At: 2026-05-14T09:00:00.000Z

## Content

2025-2026 Akademik Takvimi

Guz donemi dersleri 22 Eylul tarihinde baslar.
`)

        expect(page.title).toBe('Akademik Takvim')
        expect(page.sourceUrl).toBe('https://example.edu.tr/akademik-takvim')
        expect(page.content).toContain('2025-2026 Akademik Takvimi')
        expect(page.content).not.toContain('Source URL:')
    })

    it('removes repeated crawler chrome before chunking university pages', () => {
        const page = parseCrawlMarkdown(`# Akademik Takvim

Source URL: https://example.edu.tr/akademik-takvim

## Content

Kapat

Web Asistan Menü

Kayıt İşlemleri

Tanıtım Videosu

Ücretler ve Burslar

Tıp Fak. Whatsapp Destek Hattı

Akademik Takvim

2025-2026 egitim ogretim yili baslangic tarihleri.
`)

        expect(page.content).not.toContain('Web Asistan Menü')
        expect(page.content).not.toContain('Tıp Fak. Whatsapp Destek Hattı')
        expect(page.content).toContain('2025-2026 egitim ogretim yili')
    })

    it('creates source-aware chunks that keep headings with nearby text', () => {
        const chunks = createWebsiteChunks({
            title: 'Akademik Takvim',
            sourceUrl: 'https://example.edu.tr/akademik-takvim',
            content: `## Lisans

Kayit yenileme tarihleri ve ders baslangic bilgileri.

## Lisansustu

Tez teslim tarihleri ve danisman atama surecleri.`
        }, {
            maxTokens: 28,
            overlapTokens: 4
        })

        expect(chunks.length).toBeGreaterThan(1)
        expect(chunks[0]).toMatchObject({
            pageTitle: 'Akademik Takvim',
            sourceUrl: 'https://example.edu.tr/akademik-takvim',
            sectionTitle: 'Lisans',
            chunkIndex: 1
        })
        expect(chunks[0].content).toContain('Page Title: Akademik Takvim')
        expect(chunks[0].content).toContain('Source URL: https://example.edu.tr/akademik-takvim')
        expect(chunks[0].content).toContain('Section: Lisans')
        expect(chunks.at(-1).sectionTitle).toBe('Lisansustu')
    })

    it('builds a dry-run report from a copied crawler output without database writes', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawl-corpus-'))

        try {
            await mkdir(path.join(tempDir, 'corpus'), { recursive: true })
            await writeFile(path.join(tempDir, 'corpus-report.json'), JSON.stringify({
                corpusPages: [{
                    url: 'https://example.edu.tr/akademik-takvim',
                    title: 'Akademik Takvim',
                    corpusPath: 'corpus/akademik-takvim.md',
                    wordCount: 12
                }]
            }), 'utf8')
            await writeFile(path.join(tempDir, 'corpus', 'akademik-takvim.md'), `# Akademik Takvim

Source URL: https://example.edu.tr/akademik-takvim

## Content

## On Lisans

Kayit tarihleri, ders secimi ve sinav haftasi bilgileri.
`, 'utf8')

            const report = await buildDryRunReport({
                crawlOutputDir: tempDir,
                maxTokens: 45,
                overlapTokens: 6
            })

            expect(report.dryRun).toBe(true)
            expect(report.pagesRead).toBe(1)
            expect(report.pagesWithChunks).toBe(1)
            expect(report.totalChunks).toBe(1)
            expect(report.databaseWrites).toBe(0)
            expect(report.sampleChunks[0].sourceUrl).toBe('https://example.edu.tr/akademik-takvim')
            expect(renderImportReport(report)).toContain('Dry run: yes')
        } finally {
            await rm(tempDir, { recursive: true, force: true })
        }
    })

    it('drops short lines that repeat across many pages before building chunks', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawl-corpus-'))

        try {
            await mkdir(path.join(tempDir, 'corpus'), { recursive: true })
            await writeFile(path.join(tempDir, 'corpus-report.json'), JSON.stringify({
                corpusPages: [
                    {
                        url: 'https://example.edu.tr/a',
                        title: 'Page A',
                        corpusPath: 'corpus/a.md'
                    },
                    {
                        url: 'https://example.edu.tr/b',
                        title: 'Page B',
                        corpusPath: 'corpus/b.md'
                    }
                ]
            }), 'utf8')
            await writeFile(path.join(tempDir, 'corpus', 'a.md'), `# Page A

Source URL: https://example.edu.tr/a

## Content

Kurumsal Bilgiler

Only page A has this admissions detail.
`, 'utf8')
            await writeFile(path.join(tempDir, 'corpus', 'b.md'), `# Page B

Source URL: https://example.edu.tr/b

## Content

Kurumsal Bilgiler

Only page B has this scholarship detail.
`, 'utf8')

            const report = await buildDryRunReport({
                crawlOutputDir: tempDir,
                commonLineMinPages: 2,
                commonLineMinRatio: 0.5
            })

            const rendered = renderImportReport(report)
            expect(report.commonBoilerplateLines).toContain('kurumsal bilgiler')
            expect(rendered).not.toContain('Kurumsal Bilgiler')
            expect(rendered).toContain('Only page A has this admissions detail.')
        } finally {
            await rm(tempDir, { recursive: true, force: true })
        }
    })
})
