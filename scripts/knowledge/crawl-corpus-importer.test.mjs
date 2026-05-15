import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
    buildDryRunReport,
    createWebsiteChunks,
    importCrawlCorpus,
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

    it('imports crawler pages into a collection with processing documents, embedded chunks, and ready status', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawl-corpus-'))
        const calls = {
            createdCollections: [],
            insertedDocuments: [],
            insertedChunks: [],
            statusUpdates: [],
            usageRows: []
        }
        const repository = {
            getOrganization: async (organizationId) => ({ id: organizationId, name: 'Test Org' }),
            findCollection: async () => null,
            createCollection: async (row) => {
                calls.createdCollections.push(row)
                return { id: 'collection-1', name: row.name }
            },
            deleteDocumentsByCollection: async () => {},
            insertDocuments: async (rows) => {
                calls.insertedDocuments.push(...rows)
                return rows.map((row, index) => ({
                    id: `doc-${index + 1}`,
                    title: row.title
                }))
            },
            insertChunks: async (rows) => {
                calls.insertedChunks.push(...rows)
            },
            updateDocumentsStatus: async (documentIds, status) => {
                calls.statusUpdates.push({ documentIds, status })
            },
            recordEmbeddingUsage: async (row) => {
                calls.usageRows.push(row)
            }
        }

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
Crawled At: 2026-05-14T09:00:00.000Z

## Content

2025-2026 Akademik Takvimi

Kayit tarihleri ve ders baslangic bilgileri.
`, 'utf8')

            const report = await importCrawlCorpus({
                crawlOutputDir: tempDir,
                organizationId: 'org-1',
                repository,
                embedTexts: async (texts) => ({
                    embeddings: texts.map(() => [0.1, 0.2, 0.3]),
                    promptTokens: 42
                }),
                maxTokens: 45,
                overlapTokens: 6,
                batchSize: 10,
                embeddingBatchSize: 10
            })

            expect(report.dryRun).toBe(false)
            expect(report.organizationId).toBe('org-1')
            expect(report.collectionId).toBe('collection-1')
            expect(report.pagesImported).toBe(1)
            expect(report.chunksImported).toBe(1)
            expect(report.databaseWrites).toBe(3)
            expect(calls.createdCollections[0]).toMatchObject({
                organization_id: 'org-1',
                name: 'Website Crawl - example.edu.tr',
                icon: 'file-text'
            })
            expect(calls.insertedDocuments[0]).toMatchObject({
                organization_id: 'org-1',
                collection_id: 'collection-1',
                title: 'Akademik Takvim',
                type: 'article',
                source: 'website_crawl',
                status: 'processing'
            })
            expect(calls.insertedDocuments[0].content).toContain('Source URL: https://example.edu.tr/akademik-takvim')
            expect(calls.insertedChunks[0]).toMatchObject({
                document_id: 'doc-1',
                organization_id: 'org-1',
                chunk_index: 0,
                embedding: '[0.1,0.2,0.3]'
            })
            expect(calls.statusUpdates).toEqual([{
                documentIds: ['doc-1'],
                status: 'ready'
            }])
            expect(calls.usageRows[0]).toMatchObject({
                organization_id: 'org-1',
                category: 'embedding',
                model: 'text-embedding-3-small',
                input_tokens: 42,
                total_tokens: 42
            })
        } finally {
            await rm(tempDir, { recursive: true, force: true })
        }
    })

    it('refuses to import into an existing collection unless replace is explicit', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawl-corpus-'))
        const repository = {
            getOrganization: async (organizationId) => ({ id: organizationId, name: 'Test Org' }),
            findCollection: async () => ({ id: 'collection-1', name: 'Website Crawl - example.edu.tr' }),
            createCollection: async () => {
                throw new Error('should not create collection')
            },
            deleteDocumentsByCollection: async () => {
                throw new Error('should not delete collection documents')
            },
            insertDocuments: async () => [],
            insertChunks: async () => {},
            updateDocumentsStatus: async () => {}
        }

        try {
            await mkdir(path.join(tempDir, 'corpus'), { recursive: true })
            await writeFile(path.join(tempDir, 'corpus-report.json'), JSON.stringify({
                corpusPages: [{
                    url: 'https://example.edu.tr/a',
                    title: 'Page A',
                    corpusPath: 'corpus/a.md'
                }]
            }), 'utf8')
            await writeFile(path.join(tempDir, 'corpus', 'a.md'), `# Page A

Source URL: https://example.edu.tr/a

## Content

Admissions detail.
`, 'utf8')

            await expect(importCrawlCorpus({
                crawlOutputDir: tempDir,
                organizationId: 'org-1',
                repository,
                embedTexts: async () => ({ embeddings: [], promptTokens: 0 })
            })).rejects.toThrow('already exists')
        } finally {
            await rm(tempDir, { recursive: true, force: true })
        }
    })

    it('deletes prior documents when replacing an existing crawl collection', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawl-corpus-'))
        const deletedCollections = []
        const repository = {
            getOrganization: async (organizationId) => ({ id: organizationId, name: 'Test Org' }),
            findCollection: async () => ({ id: 'collection-1', name: 'Website Crawl - example.edu.tr' }),
            createCollection: async () => {
                throw new Error('should reuse collection')
            },
            deleteDocumentsByCollection: async (input) => {
                deletedCollections.push(input)
            },
            insertDocuments: async (rows) => rows.map((row, index) => ({ id: `doc-${index + 1}`, title: row.title })),
            insertChunks: async () => {},
            updateDocumentsStatus: async () => {},
            recordEmbeddingUsage: async () => {}
        }

        try {
            await mkdir(path.join(tempDir, 'corpus'), { recursive: true })
            await writeFile(path.join(tempDir, 'corpus-report.json'), JSON.stringify({
                corpusPages: [{
                    url: 'https://example.edu.tr/a',
                    title: 'Page A',
                    corpusPath: 'corpus/a.md'
                }]
            }), 'utf8')
            await writeFile(path.join(tempDir, 'corpus', 'a.md'), `# Page A

Source URL: https://example.edu.tr/a

## Content

Admissions detail.
`, 'utf8')

            await importCrawlCorpus({
                crawlOutputDir: tempDir,
                organizationId: 'org-1',
                repository,
                replace: true,
                embedTexts: async (texts) => ({
                    embeddings: texts.map(() => [0.1]),
                    promptTokens: 3
                })
            })

            expect(deletedCollections).toEqual([{
                organizationId: 'org-1',
                collectionId: 'collection-1'
            }])
        } finally {
            await rm(tempDir, { recursive: true, force: true })
        }
    })
})
