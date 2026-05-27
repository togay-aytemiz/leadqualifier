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

    it('normalizes URL line-break artifacts before website chunking', () => {
        const chunks = createWebsiteChunks({
            title: 'Başvuru Rehberi',
            sourceUrl: 'https://example.edu.tr/basvuru',
            content: `Başvuru bağlantıları:

https://example.edu.tr/kayit.
 com/form

https://example.edu.tr/duyuru
 .html`
        }, {
            maxTokens: 80,
            overlapTokens: 8
        })

        const content = chunks.map((chunk) => chunk.content).join('\n')

        expect(content).toContain('https://example.edu.tr/kayit.com/form')
        expect(content).toContain('https://example.edu.tr/duyuru.html')
        expect(content).not.toMatch(/https?:\/\/[^\s]*\s+\.[a-z]{2,}|https?:\/\/[^\s]+\.\s+[a-z]{2,}/i)
    })

    it('creates separate chunks for legal article headings without cross-section overlap', () => {
        const chunks = createWebsiteChunks({
            title: 'İzin Kullanımı Yönergesi',
            sourceUrl: 'https://example.edu.tr/izin.pdf',
            content: `MADDE 9 - Mazeret İzni
Personelin eşinin anne, baba veya kardeşinin ölümünde 3 (üç) iş günü mazeret izni verilir.

MADDE 10 - Yıllık İzin
Yıllık izin talepleri ilgili amirin onayı ile kullanılır.

MADDE 11 - Ücretsiz İzin
Ücretsiz izin süresi en fazla 1 (bir) yıldır.`
        }, {
            maxTokens: 80,
            overlapTokens: 8
        })

        expect(chunks).toHaveLength(3)
        expect(chunks[0].sectionTitle).toBe('MADDE 9 - Mazeret İzni')
        expect(chunks[2].sectionTitle).toBe('MADDE 11 - Ücretsiz İzin')
        expect(chunks[2].content).toContain('Ücretsiz izin süresi en fazla 1 (bir) yıldır.')
        expect(chunks[2].content).not.toContain('3 (üç) iş günü')
    })

    it('uses strong standalone headings as reusable section boundaries for non-regulation pages', () => {
        const chunks = createWebsiteChunks({
            title: 'Aday Öğrenci Bilgilendirme',
            sourceUrl: 'https://example.edu.tr/aday',
            content: `BAŞVURU ŞARTLARI
Aday öğrenciler başvuru formunu eksiksiz doldurmalıdır.

İLETİŞİM BİLGİLERİ
Aday öğrenci ofisine telefon ve e-posta ile ulaşılabilir.`
        }, {
            maxTokens: 80,
            overlapTokens: 8
        })

        expect(chunks).toHaveLength(2)
        expect(chunks[0].sectionTitle).toBe('BAŞVURU ŞARTLARI')
        expect(chunks[1].sectionTitle).toBe('İLETİŞİM BİLGİLERİ')
    })

    it('creates standalone evidence chunks for table rows in crawled pages', () => {
        const chunks = createWebsiteChunks({
            title: 'Tıbbi Laboratuvar Teknikleri Ders Planı',
            sourceUrl: 'https://example.edu.tr/tlt.pdf',
            content: `YAZ STAJI
| Ders Kodu | Ders Adı | Süre | AKTS |
| --- | --- | --- | --- |
| TLT 216 | Yaz Stajı | 20 iş günü | 4 |
| TLT 214 | Klinik Uygulama | 10 iş günü | 3 |`
        }, {
            maxTokens: 120,
            overlapTokens: 8
        })

        const tableRowChunk = chunks.find((chunk) => (
            chunk.content.includes('Evidence Type: table-row')
            && chunk.content.includes('Evidence Label: TLT 216')
        ))

        expect(tableRowChunk).toBeTruthy()
        expect(tableRowChunk.content).toContain('Page Title: Tıbbi Laboratuvar Teknikleri Ders Planı')
        expect(tableRowChunk.content).toContain('Section: YAZ STAJI')
        expect(tableRowChunk.content).toContain('Ders Kodu: TLT 216')
        expect(tableRowChunk.content).toContain('Ders Adı: Yaz Stajı')
        expect(tableRowChunk.content).toContain('Süre: 20 iş günü')
        expect(tableRowChunk.content).not.toContain('TLT 214')
    })

    it('creates standalone evidence chunks for high-signal contact rows in crawled pages', () => {
        const chunks = createWebsiteChunks({
            title: 'Program Bilgi Notu',
            sourceUrl: 'https://example.edu.tr/program.pdf',
            content: `İLETİŞİM BİLGİLERİ
Tıbbi Laboratuvar Teknikleri Programı Telefon: +90 312 329 10 10 E-posta: tlt@yiu.edu.tr

Program hakkında genel açıklamalar burada yer alır.`
        }, {
            maxTokens: 120,
            overlapTokens: 8
        })

        const evidenceRowChunk = chunks.find((chunk) => (
            chunk.content.includes('Evidence Type: evidence-row')
            && chunk.content.includes('tlt@yiu.edu.tr')
        ))

        expect(evidenceRowChunk).toBeTruthy()
        expect(evidenceRowChunk.content).toContain('Page Title: Program Bilgi Notu')
        expect(evidenceRowChunk.content).toContain('Section: İLETİŞİM BİLGİLERİ')
        expect(evidenceRowChunk.content).toContain('+90 312 329 10 10')
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
            expect(report.chunksImported).toBe(2)
            expect(report.databaseWrites).toBe(4)
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

    it('marks crawled PDF pages as pdf documents during import', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawl-corpus-'))
        const calls = {
            insertedDocuments: [],
            insertedChunks: [],
            usageRows: []
        }
        const repository = {
            getOrganization: async (organizationId) => ({ id: organizationId, name: 'Test Org' }),
            findCollection: async () => null,
            createCollection: async () => ({ id: 'collection-1', name: 'Website Crawl - example.edu.tr' }),
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
            updateDocumentsStatus: async () => {},
            recordEmbeddingUsage: async (row) => {
                calls.usageRows.push(row)
            }
        }

        try {
            await mkdir(path.join(tempDir, 'corpus'), { recursive: true })
            await writeFile(path.join(tempDir, 'corpus-report.json'), JSON.stringify({
                corpusPages: [{
                    url: 'https://example.edu.tr/uploads/izin-kullanimi.pdf',
                    title: 'İzin Kullanımı Yönergesi',
                    corpusPath: 'corpus/izin-kullanimi.md',
                    wordCount: 16
                }]
            }), 'utf8')
            await writeFile(path.join(tempDir, 'corpus', 'izin-kullanimi.md'), `# İzin Kullanımı Yönergesi

Source URL: https://example.edu.tr/uploads/izin-kullanimi.pdf

## Content

Madde 6- Yıllık ücretli izin süreleri personel için düzenlenir.
`, 'utf8')

            await importCrawlCorpus({
                crawlOutputDir: tempDir,
                organizationId: 'org-1',
                repository,
                embedTexts: async (texts) => ({
                    embeddings: texts.map(() => [0.1, 0.2, 0.3]),
                    promptTokens: 42
                }),
                batchSize: 10,
                embeddingBatchSize: 10
            })

            expect(calls.insertedDocuments[0]).toMatchObject({
                title: 'İzin Kullanımı Yönergesi',
                type: 'pdf',
                source: 'website_crawl'
            })
        } finally {
            await rm(tempDir, { recursive: true, force: true })
        }
    })

    it('records one compact embedding usage row per completed crawl import', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawl-corpus-'))
        const calls = {
            insertedDocuments: [],
            insertedChunks: [],
            usageRows: []
        }
        const repository = {
            getOrganization: async (organizationId) => ({ id: organizationId, name: 'Test Org' }),
            findCollection: async () => null,
            createCollection: async (row) => ({ id: 'collection-1', name: row.name }),
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
            updateDocumentsStatus: async () => {},
            recordEmbeddingUsage: async (row) => {
                calls.usageRows.push(row)
            }
        }

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

Admissions detail for page A.
`, 'utf8')
            await writeFile(path.join(tempDir, 'corpus', 'b.md'), `# Page B

Source URL: https://example.edu.tr/b

## Content

Scholarship detail for page B.
`, 'utf8')

            const report = await importCrawlCorpus({
                crawlOutputDir: tempDir,
                organizationId: 'org-1',
                repository,
                embedTexts: async (texts) => ({
                    embeddings: texts.map(() => [0.1, 0.2, 0.3]),
                    promptTokens: texts.length * 10
                }),
                maxTokens: 45,
                overlapTokens: 6,
                batchSize: 2,
                embeddingBatchSize: 1
            })

            expect(calls.insertedDocuments).toHaveLength(2)
            expect(calls.insertedChunks).toHaveLength(2)
            expect(calls.usageRows).toHaveLength(1)
            expect(calls.usageRows[0]).toMatchObject({
                organization_id: 'org-1',
                category: 'embedding',
                model: 'text-embedding-3-small',
                input_tokens: 20,
                total_tokens: 20,
                metadata: {
                    source: 'crawl_corpus_import',
                    page_count: 2,
                    chunk_count: 2,
                    embedding_batch_count: 2,
                    usage_compaction: 'crawl_import_total'
                }
            })
            expect(report.databaseWrites).toBe(5)
        } finally {
            await rm(tempDir, { recursive: true, force: true })
        }
    })

    it('splits embedded chunk inserts into bounded database batches', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawl-corpus-'))
        const insertedChunkBatchSizes = []
        const repository = {
            getOrganization: async (organizationId) => ({ id: organizationId, name: 'Test Org' }),
            findCollection: async () => null,
            createCollection: async () => ({ id: 'collection-1', name: 'Website Crawl - example.edu.tr' }),
            deleteDocumentsByCollection: async () => {},
            insertDocuments: async (rows) => rows.map((row, index) => ({
                id: `doc-${index + 1}`,
                title: row.title
            })),
            insertChunks: async (rows) => {
                insertedChunkBatchSizes.push(rows.length)
            },
            updateDocumentsStatus: async () => {},
            recordEmbeddingUsage: async () => {}
        }

        try {
            await mkdir(path.join(tempDir, 'corpus'), { recursive: true })
            await writeFile(path.join(tempDir, 'corpus-report.json'), JSON.stringify({
                corpusPages: Array.from({ length: 5 }, (_, index) => ({
                    url: `https://example.edu.tr/page-${index + 1}`,
                    title: `Page ${index + 1}`,
                    corpusPath: `corpus/page-${index + 1}.md`
                }))
            }), 'utf8')
            for (let index = 1; index <= 5; index += 1) {
                await writeFile(path.join(tempDir, 'corpus', `page-${index}.md`), `# Page ${index}

Source URL: https://example.edu.tr/page-${index}

## Content

Page ${index} content for import batching.
`, 'utf8')
            }

            await importCrawlCorpus({
                crawlOutputDir: tempDir,
                organizationId: 'org-1',
                repository,
                embedTexts: async (texts) => ({
                    embeddings: texts.map(() => [0.1, 0.2, 0.3]),
                    promptTokens: 5
                }),
                maxTokens: 80,
                overlapTokens: 6,
                batchSize: 10,
                embeddingBatchSize: 10,
                chunkInsertBatchSize: 2
            })

            expect(insertedChunkBatchSizes).toEqual([2, 2, 1])
        } finally {
            await rm(tempDir, { recursive: true, force: true })
        }
    })

    it('bisects chunk insert batches when the database rejects a large vector insert', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawl-corpus-'))
        const insertedChunkBatchSizes = []
        const repository = {
            getOrganization: async (organizationId) => ({ id: organizationId, name: 'Test Org' }),
            findCollection: async () => null,
            createCollection: async () => ({ id: 'collection-1', name: 'Website Crawl - example.edu.tr' }),
            deleteDocumentsByCollection: async () => {},
            insertDocuments: async (rows) => rows.map((row, index) => ({
                id: `doc-${index + 1}`,
                title: row.title
            })),
            insertChunks: async (rows) => {
                if (rows.length > 2) {
                    throw new Error('canceling statement due to statement timeout')
                }
                insertedChunkBatchSizes.push(rows.length)
            },
            updateDocumentsStatus: async () => {},
            recordEmbeddingUsage: async () => {}
        }

        try {
            await mkdir(path.join(tempDir, 'corpus'), { recursive: true })
            await writeFile(path.join(tempDir, 'corpus-report.json'), JSON.stringify({
                corpusPages: Array.from({ length: 5 }, (_, index) => ({
                    url: `https://example.edu.tr/retry-${index + 1}`,
                    title: `Retry ${index + 1}`,
                    corpusPath: `corpus/retry-${index + 1}.md`
                }))
            }), 'utf8')
            for (let index = 1; index <= 5; index += 1) {
                await writeFile(path.join(tempDir, 'corpus', `retry-${index}.md`), `# Retry ${index}

Source URL: https://example.edu.tr/retry-${index}

## Content

Retry ${index} content.
`, 'utf8')
            }

            await importCrawlCorpus({
                crawlOutputDir: tempDir,
                organizationId: 'org-1',
                repository,
                embedTexts: async (texts) => ({
                    embeddings: texts.map(() => [0.1, 0.2, 0.3]),
                    promptTokens: 5
                }),
                maxTokens: 80,
                overlapTokens: 6,
                batchSize: 10,
                embeddingBatchSize: 10,
                chunkInsertBatchSize: 5
            })

            expect(insertedChunkBatchSizes).toEqual([2, 1, 2])
        } finally {
            await rm(tempDir, { recursive: true, force: true })
        }
    })

    it('falls back to lexical-only chunks when a single vector row times out', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'crawl-corpus-'))
        const insertedRows = []
        const repository = {
            getOrganization: async (organizationId) => ({ id: organizationId, name: 'Test Org' }),
            findCollection: async () => null,
            createCollection: async () => ({ id: 'collection-1', name: 'Website Crawl - example.edu.tr' }),
            deleteDocumentsByCollection: async () => {},
            insertDocuments: async (rows) => rows.map((row, index) => ({
                id: `doc-${index + 1}`,
                title: row.title
            })),
            insertChunks: async (rows) => {
                if (rows.some((row) => row.embedding !== null)) {
                    throw new Error('canceling statement due to statement timeout')
                }
                insertedRows.push(...rows)
            },
            updateDocumentsStatus: async () => {},
            recordEmbeddingUsage: async () => {}
        }

        try {
            await mkdir(path.join(tempDir, 'corpus'), { recursive: true })
            await writeFile(path.join(tempDir, 'corpus-report.json'), JSON.stringify({
                corpusPages: [{
                    url: 'https://example.edu.tr/vector-timeout',
                    title: 'Vector Timeout',
                    corpusPath: 'corpus/vector-timeout.md'
                }]
            }), 'utf8')
            await writeFile(path.join(tempDir, 'corpus', 'vector-timeout.md'), `# Vector Timeout

Source URL: https://example.edu.tr/vector-timeout

## Content

This chunk should survive as lexical-only evidence if vector insert times out.
`, 'utf8')

            await importCrawlCorpus({
                crawlOutputDir: tempDir,
                organizationId: 'org-1',
                repository,
                embedTexts: async (texts) => ({
                    embeddings: texts.map(() => [0.1, 0.2, 0.3]),
                    promptTokens: 5
                }),
                maxTokens: 80,
                overlapTokens: 6,
                batchSize: 10,
                embeddingBatchSize: 10,
                chunkInsertBatchSize: 1
            })

            expect(insertedRows).toHaveLength(1)
            expect(insertedRows[0]).toMatchObject({
                embedding: null,
                content: expect.stringContaining('lexical-only evidence')
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
