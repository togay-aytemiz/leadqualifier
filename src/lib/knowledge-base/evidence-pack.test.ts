import { describe, expect, it } from 'vitest'
import {
    buildRagEvidencePack,
    buildEvidencePackContext,
    collectEvidenceSourceChunks
} from '@/lib/knowledge-base/evidence-pack'

const sourceUrl = 'https://example.edu.tr/tlt.pdf'

describe('buildRagEvidencePack', () => {
    it('extracts compact contact and duration evidence with critical values', () => {
        const pack = buildRagEvidencePack({
            userMessage: 'TLT program sorumlusunun iletişim bilgisi ve yaz stajı kaç gün?',
            chunks: [{
                chunk_id: 'chunk-tlt',
                document_id: 'doc-tlt',
                document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
                source_url: sourceUrl,
                similarity: 0.7,
                content: [
                    'Program: Tıbbi Laboratuvar Teknikleri',
                    'E-posta: tlt@yiu.edu.tr',
                    'Yaz Stajı süresi 20 iş günüdür.'
                ].join('\n')
            }]
        })

        expect(pack.items.map((item) => item.kind)).toEqual(expect.arrayContaining(['contact', 'duration']))
        expect(pack.items.some((item) => item.criticalValues.includes('tlt@yiu.edu.tr'))).toBe(true)
        expect(pack.items.some((item) => item.criticalValues.includes('20 iş günü'))).toBe(true)
        expect(pack.items.every((item) => item.sourceUrl === sourceUrl)).toBe(true)
    })

    it('deduplicates repeated evidence rows while preserving separate source facts', () => {
        const pack = buildRagEvidencePack({
            userMessage: 'Ders içerikleri nereden paylaşılır?',
            chunks: [
                {
                    chunk_id: 'chunk-medu-a',
                    document_id: 'doc-medu',
                    document_title: 'Ders İçerikleri',
                    source_url: 'https://example.edu.tr/medu.pdf',
                    similarity: 0.8,
                    content: 'Ders içerikleri MEDU Öğrenme Yönetim Sistemi üzerinden paylaşılır.'
                },
                {
                    chunk_id: 'chunk-medu-b',
                    document_id: 'doc-medu',
                    document_title: 'Ders İçerikleri',
                    source_url: 'https://example.edu.tr/medu.pdf',
                    similarity: 0.6,
                    content: 'Ders içerikleri MEDU Öğrenme Yönetim Sistemi üzerinden paylaşılır.'
                },
                {
                    chunk_id: 'chunk-obs',
                    document_id: 'doc-obs',
                    document_title: 'Öğrenci Bilgi Sistemi',
                    source_url: 'https://example.edu.tr/obs.pdf',
                    similarity: 0.7,
                    content: 'Ders içerikleri ÖBS üzerinden öğrencilerle paylaşılır.'
                }
            ]
        })

        expect(pack.items.filter((item) => item.quote.includes('MEDU'))).toHaveLength(1)
        expect(pack.items.some((item) => item.quote.includes('ÖBS'))).toBe(true)
        expect(pack.diagnostics.droppedDuplicateCount).toBe(1)
    })

    it('keeps all critical values found in the selected quote', () => {
        const pack = buildRagEvidencePack({
            userMessage: 'MEDU bağlantısı ve devam şartı nedir?',
            chunks: [{
                chunk_id: 'chunk-medu-link',
                document_id: 'doc-medu-link',
                document_title: 'MEDU Kullanım Kılavuzu',
                source_url: 'https://example.edu.tr/medu-guide.pdf',
                content: 'MEDU erişimi https://medu.example.edu.tr adresinden yapılır ve devam şartı %70 olarak uygulanır.'
            }]
        })

        const item = pack.items[0]

        expect(item?.criticalValues).toEqual(expect.arrayContaining([
            'https://medu.example.edu.tr',
            'MEDU',
            '%70'
        ]))
    })

    it('extracts Turkish word-number durations with unicode boundaries', () => {
        const pack = buildRagEvidencePack({
            userMessage: 'Uygulama kaç hafta sürer?',
            chunks: [{
                chunk_id: 'chunk-turkish-duration',
                document_id: 'doc-turkish-duration',
                document_title: 'Uygulama Takvimi',
                source_url: sourceUrl,
                content: 'Mesleki uygulama üç hafta boyunca devam eder.'
            }]
        })

        expect(pack.items[0]?.kind).toBe('duration')
        expect(pack.items[0]?.criticalValues).toContain('üç hafta')
    })

    it('deduplicates evidence with normalized source and document identity', () => {
        const pack = buildRagEvidencePack({
            userMessage: 'MEDU nereden kullanılır?',
            chunks: [
                {
                    chunk_id: 'chunk-medu-uppercase-source',
                    document_id: ' DOC-MEDU ',
                    document_title: 'Ders İçerikleri',
                    source_url: ' HTTPS://EXAMPLE.EDU.TR/MEDU.PDF ',
                    similarity: 0.8,
                    content: 'Ders içerikleri MEDU Öğrenme Yönetim Sistemi üzerinden paylaşılır.'
                },
                {
                    chunk_id: 'chunk-medu-normalized-source',
                    document_id: 'doc-medu',
                    document_title: 'Ders İçerikleri',
                    source_url: 'https://example.edu.tr/medu.pdf',
                    similarity: 0.7,
                    content: 'Ders içerikleri MEDU Öğrenme Yönetim Sistemi üzerinden paylaşılır.'
                }
            ]
        })

        expect(pack.items.filter((item) => item.quote.includes('MEDU'))).toHaveLength(1)
        expect(pack.diagnostics.droppedDuplicateCount).toBe(1)
    })

    it('builds a source-labeled evidence context for the answerer', () => {
        const pack = buildRagEvidencePack({
            userMessage: 'TLT yaz stajı kaç gün?',
            chunks: [{
                chunk_id: 'chunk-tlt',
                document_id: 'doc-tlt',
                document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
                source_url: sourceUrl,
                content: 'Yaz Stajı süresi 20 iş günüdür.'
            }]
        })

        const context = buildEvidencePackContext(pack)

        expect(context).toContain('Evidence ID: ev_1')
        expect(context).toContain('Kind: duration')
        expect(context).toContain('Source URL: https://example.edu.tr/tlt.pdf')
        expect(context).toContain('Yaz Stajı süresi 20 iş günüdür.')
    })

    it('returns source chunks only for selected evidence ids', () => {
        const pack = buildRagEvidencePack({
            userMessage: 'TLT yaz stajı kaç gün?',
            chunks: [
                {
                    chunk_id: 'chunk-tlt',
                    document_id: 'doc-tlt',
                    document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
                    source_url: sourceUrl,
                    content: 'Yaz Stajı süresi 20 iş günüdür.'
                },
                {
                    chunk_id: 'chunk-generic',
                    document_id: 'doc-generic',
                    document_title: 'Genel Akademik Bilgi',
                    source_url: 'https://example.edu.tr/generic.pdf',
                    content: 'Staj uygulamaları ilgili programlarda açıklanır.'
                }
            ]
        })
        const selected = pack.items.find((item) => item.criticalValues.includes('20 iş günü'))
        expect(selected).toBeTruthy()

        const chunks = collectEvidenceSourceChunks(pack, selected ? [selected.id] : [])

        expect(chunks).toHaveLength(1)
        expect(chunks[0]?.chunk_id).toBe('chunk-tlt')
    })
})
