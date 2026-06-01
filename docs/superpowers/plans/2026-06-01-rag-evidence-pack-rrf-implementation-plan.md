# RAG Evidence Pack and Hybrid RRF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate source-backed evidence selection from LLM answer writing, then move Knowledge Base retrieval to explicit hybrid RRF ranking.

**Architecture:** Retrieval returns candidate chunks, `evidence-pack.ts` extracts compact typed evidence items, and `rag-answer-generate.ts` asks the model to answer only from selected evidence ids. Source-link appending in Demo Chat and shared inbound flows uses evidence-selected chunks. Retrieval then moves to named vector, keyword, title/source, and focused-evidence channels merged with Reciprocal Rank Fusion.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres/pgvector, Vitest, OpenAI chat completions, existing public-demo canary tooling.

---

## File Structure

- Create `src/lib/knowledge-base/evidence-pack.ts`: runtime evidence extraction, scoring, dedupe, selected-source helpers.
- Create `src/lib/knowledge-base/evidence-pack.test.ts`: focused unit coverage for evidence selection and source chunks.
- Modify `src/lib/knowledge-base/rag-answer-generate.ts`: answerer accepts/builds evidence pack and validates `used_evidence_ids`.
- Modify `src/lib/knowledge-base/rag-answer-generate.test.ts`: prompt, selected evidence, engagement, and unsupported value regressions.
- Modify `src/app/api/demo/[slug]/chat/route.ts`: generated RAG sources and metadata use evidence-selected chunks.
- Modify `src/app/api/demo/[slug]/chat/route.test.ts`: generated answer path uses selected evidence sources.
- Modify `src/lib/channels/inbound-ai-pipeline.ts`: shared channel generated RAG sources use selected evidence chunks.
- Modify `src/lib/channels/inbound-ai-pipeline.test.ts`: shared channel generated answer path uses selected evidence sources.
- Create `src/lib/knowledge-base/hybrid-retrieval.ts`: generic RRF channel merge helper.
- Create `src/lib/knowledge-base/hybrid-retrieval.test.ts`: RRF math, dedupe, and boost behavior.
- Modify `src/lib/knowledge-base/actions.ts`: replace broad two-list merging with named hybrid channels.
- Modify `src/lib/knowledge-base/actions.test.ts`: regression coverage for exact lexical/title/focused results beating broad vector matches.
- Update `docs/ROADMAP.md`, `docs/PRD.md`, and `docs/RELEASE.md` after implementation.

---

## Task 1: Evidence Pack Tests

**Files:**
- Create: `src/lib/knowledge-base/evidence-pack.test.ts`
- Test target: `src/lib/knowledge-base/evidence-pack.ts`

- [ ] **Step 1: Write the failing test file**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run src/lib/knowledge-base/evidence-pack.test.ts
```

Expected: FAIL because `@/lib/knowledge-base/evidence-pack` does not exist.

- [ ] **Step 3: Commit the failing test**

```bash
git add src/lib/knowledge-base/evidence-pack.test.ts
git commit -m "test(phase-9): cover rag evidence pack extraction"
```

---

## Task 2: Evidence Pack Implementation

**Files:**
- Create: `src/lib/knowledge-base/evidence-pack.ts`
- Test: `src/lib/knowledge-base/evidence-pack.test.ts`

- [ ] **Step 1: Add the evidence pack module**

```ts
import type { RagChunk } from './rag'

export type RagEvidenceKind =
    | 'contact'
    | 'address'
    | 'duration'
    | 'policy'
    | 'platform'
    | 'document_code'
    | 'link'
    | 'generic'

export type RagEvidenceItem = {
    id: string
    kind: RagEvidenceKind
    fact: string
    quote: string
    sourceUrl: string | null
    documentId?: string
    documentTitle?: string | null
    chunkId?: string
    score: number
    criticalValues: string[]
}

export type RagEvidencePack<T extends RagChunk = RagChunk> = {
    items: RagEvidenceItem[]
    chunks: T[]
    diagnostics: {
        itemCount: number
        selectedChunkCount: number
        droppedDuplicateCount: number
        droppedUnsupportedCount: number
    }
}

type BuildRagEvidencePackInput<T extends RagChunk> = {
    userMessage: string
    chunks: T[]
    maxItems?: number
}

const DEFAULT_MAX_EVIDENCE_ITEMS = 10
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu
const URL_RE = /https?:\/\/[^\s)]+/giu
const PERCENT_RE = /%\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*%/gu
const DURATION_RE = /\b(?:\d+|bir|iki|üç|uc|dört|dort|beş|bes|altı|alti|yedi|sekiz|dokuz|on|yirmi|otuz)\s+(?:iş\s+günü|is\s+gunu|gün|gun|yıl|yil|ay|hafta)\b/giu
const PHONE_RE = /(?:\+?90\s*)?(?:0\s*)?\(?\d{3}\)?[\s./-]*\d{3}[\s./-]*\d{2}[\s./-]*\d{2}/gu
const DOCUMENT_CODE_RE = /\b[A-ZÇĞİÖŞÜ]{1,6}[.-][A-ZÇĞİÖŞÜ]{1,8}[.-]\d{3,5}\b/gu
const PLATFORM_RE = /\b(?:MEDU|UZEM|ÖBS|OBS|LMS|Moodle|Teams|Zoom)\b/giu
const ADDRESS_RE = /\b(?:mahallesi|mah\.|bulvarı|bulvari|cadde|caddesi|sokak|no:?\s*\d+|yerleşkesi|yerleskesi|kampüsü|kampusu|ankara|keçiören|kecioren|balgat|bağlıca|baglica|bağlum|baglum)\b/iu

function normalizeText(value: string) {
    return value
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('tr-TR')
}

function unique(values: string[]) {
    const seen = new Set<string>()
    const result: string[] = []
    for (const value of values) {
        const normalized = value.replace(/\s+/g, ' ').trim()
        const key = normalizeText(normalized)
        if (!normalized || seen.has(key)) continue
        seen.add(key)
        result.push(normalized)
    }
    return result
}

function matches(pattern: RegExp, text: string) {
    return unique(Array.from(text.matchAll(pattern), (match) => match[0]))
}

function splitCandidateQuotes(content: string) {
    const lines = content
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length >= 8)

    if (lines.length > 0) return lines

    return content
        .split(/(?<=[.!?])\s+/u)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter((line) => line.length >= 8)
}

function criticalValuesForQuote(quote: string) {
    return unique([
        ...matches(EMAIL_RE, quote),
        ...matches(URL_RE, quote),
        ...matches(PERCENT_RE, quote),
        ...matches(DURATION_RE, quote),
        ...matches(PHONE_RE, quote),
        ...matches(DOCUMENT_CODE_RE, quote),
        ...matches(PLATFORM_RE, quote)
    ])
}

function kindForQuote(quote: string, criticalValues: string[]): RagEvidenceKind {
    if (criticalValues.some((value) => EMAIL_RE.test(value) || PHONE_RE.test(value))) return 'contact'
    if (criticalValues.some((value) => URL_RE.test(value))) return 'link'
    if (criticalValues.some((value) => DURATION_RE.test(value) || PERCENT_RE.test(value))) return 'duration'
    if (criticalValues.some((value) => DOCUMENT_CODE_RE.test(value))) return 'document_code'
    if (criticalValues.some((value) => PLATFORM_RE.test(value))) return 'platform'
    if (ADDRESS_RE.test(quote)) return 'address'
    if (/\b(?:madde|yönetmelik|yonetmelik|yönerge|yonerge|sınav|sinav|başvuru|basvuru|hak|koşul|kosul)\b/iu.test(quote)) return 'policy'
    return 'generic'
}

function lexicalOverlapScore(query: string, quote: string) {
    const queryTerms = new Set(normalizeText(query).match(/[\p{L}\p{N}]{2,}/gu) || [])
    const quoteTerms = new Set(normalizeText(quote).match(/[\p{L}\p{N}]{2,}/gu) || [])
    if (queryTerms.size === 0 || quoteTerms.size === 0) return 0

    let overlap = 0
    for (const term of queryTerms) {
        if (quoteTerms.has(term)) overlap += 1
    }

    return overlap / queryTerms.size
}

function scoreEvidence(input: {
    userMessage: string
    quote: string
    criticalValues: string[]
    kind: RagEvidenceKind
    chunk: RagChunk
}) {
    const similarity = typeof input.chunk.similarity === 'number' && Number.isFinite(input.chunk.similarity)
        ? input.chunk.similarity
        : 0
    const overlap = lexicalOverlapScore(input.userMessage, `${input.chunk.document_title || ''} ${input.quote}`)
    const valueBonus = input.criticalValues.length > 0 ? 0.45 : 0
    const kindBonus = input.kind === 'generic' ? 0 : 0.25

    return similarity + overlap + valueBonus + kindBonus
}

function factFromQuote(kind: RagEvidenceKind, quote: string) {
    return `${kind}: ${quote}`.slice(0, 260)
}

export function buildRagEvidencePack<T extends RagChunk>(
    input: BuildRagEvidencePackInput<T>
): RagEvidencePack<T> {
    const maxItems = Math.max(1, input.maxItems || DEFAULT_MAX_EVIDENCE_ITEMS)
    const items: RagEvidenceItem[] = []
    const seen = new Set<string>()
    let droppedDuplicateCount = 0
    let droppedUnsupportedCount = 0

    for (const chunk of input.chunks) {
        const sourceUrl = chunk.source_url || chunk.sourceUrl || null
        const quotes = splitCandidateQuotes(chunk.content)
        for (const quote of quotes) {
            const criticalValues = criticalValuesForQuote(quote)
            const kind = kindForQuote(quote, criticalValues)
            const hasSignal = criticalValues.length > 0 || kind !== 'generic' || lexicalOverlapScore(input.userMessage, quote) >= 0.34
            if (!hasSignal) {
                droppedUnsupportedCount += 1
                continue
            }

            const key = `${sourceUrl || chunk.document_id || 'unknown'}:${normalizeText(quote)}`
            if (seen.has(key)) {
                droppedDuplicateCount += 1
                continue
            }
            seen.add(key)

            items.push({
                id: `ev_${items.length + 1}`,
                kind,
                fact: factFromQuote(kind, quote),
                quote,
                sourceUrl,
                documentId: chunk.document_id,
                documentTitle: chunk.document_title,
                chunkId: chunk.chunk_id,
                score: scoreEvidence({ userMessage: input.userMessage, quote, criticalValues, kind, chunk }),
                criticalValues
            })
        }
    }

    const selectedItems = items
        .sort((left, right) => right.score - left.score)
        .slice(0, maxItems)
        .map((item, index) => ({ ...item, id: `ev_${index + 1}` }))

    const selectedChunkKeys = new Set(selectedItems.map((item) => item.chunkId || `${item.documentId}:${item.quote}`))
    const selectedChunks = input.chunks.filter((chunk) => {
        const key = chunk.chunk_id || `${chunk.document_id}:${chunk.content}`
        return selectedItems.some((item) => item.chunkId === chunk.chunk_id || item.documentId === chunk.document_id)
            || selectedChunkKeys.has(key)
    })

    return {
        items: selectedItems,
        chunks: selectedChunks.length > 0 ? selectedChunks : input.chunks.slice(0, maxItems),
        diagnostics: {
            itemCount: selectedItems.length,
            selectedChunkCount: selectedChunks.length,
            droppedDuplicateCount,
            droppedUnsupportedCount
        }
    }
}

export function buildEvidencePackContext(pack: RagEvidencePack) {
    return pack.items
        .map((item) => [
            `Evidence ID: ${item.id}`,
            `Kind: ${item.kind}`,
            item.documentTitle ? `Document Title: ${item.documentTitle}` : '',
            item.sourceUrl ? `Source URL: ${item.sourceUrl}` : '',
            item.criticalValues.length > 0 ? `Critical Values: ${item.criticalValues.join(', ')}` : '',
            `Quote: ${item.quote}`
        ].filter(Boolean).join('\n'))
        .join('\n---\n')
}

export function collectEvidenceSourceChunks<T extends RagChunk>(
    pack: RagEvidencePack<T>,
    evidenceIds: string[],
    fallbackLimit = 2
) {
    const selectedIds = new Set(evidenceIds)
    const selectedItems = pack.items.filter((item) => selectedIds.has(item.id))
    const selectedKeys = new Set(selectedItems.map((item) => item.chunkId).filter(Boolean))
    const selectedDocumentIds = new Set(selectedItems.map((item) => item.documentId).filter(Boolean))
    const chunks = pack.chunks.filter((chunk) => {
        if (chunk.chunk_id && selectedKeys.has(chunk.chunk_id)) return true
        if (chunk.document_id && selectedDocumentIds.has(chunk.document_id)) return true
        return false
    })

    return chunks.length > 0 ? chunks : pack.chunks.slice(0, fallbackLimit)
}
```

- [ ] **Step 2: Run evidence-pack tests**

Run:

```bash
npm test -- --run src/lib/knowledge-base/evidence-pack.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit evidence-pack implementation**

```bash
git add src/lib/knowledge-base/evidence-pack.ts src/lib/knowledge-base/evidence-pack.test.ts
git commit -m "feat(phase-9): add rag evidence pack extraction"
```

---

## Task 3: Answerer Evidence Contract Tests

**Files:**
- Modify: `src/lib/knowledge-base/rag-answer-generate.test.ts`
- Test target: `src/lib/knowledge-base/rag-answer-generate.ts`

- [ ] **Step 1: Add failing tests for evidence ids**

Append these tests inside the existing `describe('generateGroundedRagAnswer', ...)` block:

```ts
    it('asks the model to answer from evidence ids and returns selected source chunks', async () => {
        const createCompletion = vi.fn(async (args: Record<string, unknown>) => {
            const messages = args.messages as Array<{ role: string; content: string }>
            const systemPrompt = messages.find((message) => message.role === 'system')?.content ?? ''

            expect(systemPrompt).toContain('Evidence ID: ev_1')
            expect(systemPrompt).toContain('Use only the evidence ids listed below')
            expect(systemPrompt).toContain('used_evidence_ids')
            expect(systemPrompt).toContain('Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.')

            return {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            answer: 'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; süresi 20 iş günü.',
                            used_evidence_ids: ['ev_1'],
                            engagement_question: '',
                            engagement_evidence_id: ''
                        })
                    }
                }],
                usage: { prompt_tokens: 130, completion_tokens: 35, total_tokens: 165 }
            }
        })

        const result = await generateGroundedRagAnswer({
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks,
            createCompletion
        })

        expect(result.usedGeneration).toBe(true)
        expect(result.usedEvidenceIds).toEqual(['ev_1'])
        expect(result.sourceChunks?.map((chunk) => chunk.document_id)).toEqual(['doc-tlt'])
    })

    it('rejects answers whose selected evidence ids do not exist', async () => {
        const createCompletion = vi.fn(async () => ({
            choices: [{
                message: {
                    content: JSON.stringify({
                        answer: 'Yaz stajı 20 iş günüdür.',
                        used_evidence_ids: ['ev_404'],
                        engagement_question: '',
                        engagement_evidence_id: ''
                    })
                }
            }],
            usage: { prompt_tokens: 90, completion_tokens: 20, total_tokens: 110 }
        }))

        const result = await generateGroundedRagAnswer({
            userMessage: 'TLT yaz stajı kaç gün?',
            responseLanguage: 'tr',
            chunks,
            createCompletion
        })

        expect(result.usedGeneration).toBe(false)
        expect(result.answer).toBe('')
    })

    it('drops engagement when the engagement evidence id is missing from the pack', async () => {
        const createCompletion = vi.fn(async () => ({
            choices: [{
                message: {
                    content: JSON.stringify({
                        answer: 'Ders içerikleri MEDU Öğrenme Yönetim Sistemi üzerinden paylaşılır.',
                        used_evidence_ids: ['ev_1'],
                        engagement_question: 'İstersen sınav takvimini de gösterebilirim.',
                        engagement_evidence_id: 'ev_99'
                    })
                }
            }],
            usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 }
        }))

        const result = await generateGroundedRagAnswer({
            userMessage: 'Ders içerikleri nereden paylaşılır?',
            responseLanguage: 'tr',
            chunks: [{
                content: 'Ders içerikleri MEDU Öğrenme Yönetim Sistemi üzerinden paylaşılır.',
                document_id: 'doc-medu',
                document_title: 'Ders İçerikleri',
                source_url: 'https://example.edu.tr/medu.pdf'
            }],
            createCompletion
        })

        expect(result.answer).toBe('Ders içerikleri MEDU Öğrenme Yönetim Sistemi üzerinden paylaşılır.')
        expect(result.addedEngagement).toBe(false)
    })
```

- [ ] **Step 2: Run answerer tests to verify failure**

Run:

```bash
npm test -- --run src/lib/knowledge-base/rag-answer-generate.test.ts
```

Expected: FAIL because the answerer still expects `support_quotes` and does not return `usedEvidenceIds` or `sourceChunks`.

- [ ] **Step 3: Commit failing tests**

```bash
git add src/lib/knowledge-base/rag-answer-generate.test.ts
git commit -m "test(phase-9): cover evidence-id rag generation"
```

---

## Task 4: Answerer Evidence Contract Implementation

**Files:**
- Modify: `src/lib/knowledge-base/rag-answer-generate.ts`
- Test: `src/lib/knowledge-base/rag-answer-generate.test.ts`

- [ ] **Step 1: Import evidence-pack helpers and extend result types**

Add imports near the top of `rag-answer-generate.ts`:

```ts
import {
    buildEvidencePackContext,
    buildRagEvidencePack,
    collectEvidenceSourceChunks,
    type RagEvidencePack
} from '@/lib/knowledge-base/evidence-pack'
```

Extend the generation result type:

```ts
export type RagAnswerGenerateResult = {
    answer: string
    usedGeneration: boolean
    addedEngagement: boolean
    usage: RagAnswerGenerateUsage | null
    model: string
    evidencePack?: RagEvidencePack
    usedEvidenceIds?: string[]
    sourceChunks?: RagChunk[]
}
```

- [ ] **Step 2: Accept both old support-quote payloads and new evidence-id payloads**

Update the internal payload type and parser:

```ts
type GeneratePayload = {
    answer: string
    supportQuotes: string[]
    usedEvidenceIds: string[]
    engagementQuestion: string
    engagementEvidence: string
    engagementEvidenceId: string
}

function parseGeneratePayload(raw: string): GeneratePayload | null {
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : ''
        const supportQuotes = Array.isArray(parsed.support_quotes)
            ? parsed.support_quotes.filter((quote): quote is string => typeof quote === 'string').map((quote) => quote.trim()).filter(Boolean)
            : []
        const usedEvidenceIds = Array.isArray(parsed.used_evidence_ids)
            ? parsed.used_evidence_ids.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean)
            : []
        const engagementQuestion = typeof parsed.engagement_question === 'string'
            ? parsed.engagement_question.trim()
            : ''
        const engagementEvidence = typeof parsed.engagement_evidence === 'string'
            ? parsed.engagement_evidence.trim()
            : ''
        const engagementEvidenceId = typeof parsed.engagement_evidence_id === 'string'
            ? parsed.engagement_evidence_id.trim()
            : ''

        if (!answer) return null

        return {
            answer,
            supportQuotes,
            usedEvidenceIds,
            engagementQuestion,
            engagementEvidence,
            engagementEvidenceId
        }
    } catch {
        return null
    }
}
```

- [ ] **Step 3: Build prompt from evidence context**

Inside `generateGroundedRagAnswer`, replace the direct `buildRagContext(input.chunks, ...)` path with:

```ts
    const evidencePack = input.evidencePack || buildRagEvidencePack({
        userMessage: input.userMessage,
        chunks: input.chunks
    })
    const context = buildEvidencePackContext(evidencePack)
    if (!context.trim() || evidencePack.items.length === 0) return fallbackResult(model)
```

Extend the function input type:

```ts
    evidencePack?: RagEvidencePack
```

Update the prompt instructions so the JSON contract includes:

```txt
Use only the evidence ids listed below. Do not answer from memory.
Return JSON with:
{
  "answer": "grounded answer without source URLs",
  "used_evidence_ids": ["one or more Evidence ID values supporting the answer"],
  "engagement_question": "optional short grounded follow-up question or offer",
  "engagement_evidence_id": "Evidence ID supporting the engagement question"
}
```

- [ ] **Step 4: Validate selected evidence ids and selected critical values**

Add helpers near existing validation helpers:

```ts
function selectedEvidenceText(pack: RagEvidencePack, evidenceIds: string[]) {
    const ids = new Set(evidenceIds)
    return pack.items
        .filter((item) => ids.has(item.id))
        .map((item) => `${item.fact}\n${item.quote}\n${item.criticalValues.join('\n')}`)
        .join('\n')
}

function hasValidEvidenceSelection(pack: RagEvidencePack, evidenceIds: string[]) {
    if (evidenceIds.length === 0) return false
    const validIds = new Set(pack.items.map((item) => item.id))
    return evidenceIds.every((id) => validIds.has(id))
}

function isEngagementEvidenceIdSafe(input: {
    pack: RagEvidencePack
    answer: string
    userMessage: string
    engagementQuestion: string
    engagementEvidenceId: string
}) {
    if (!input.engagementQuestion || !input.engagementEvidenceId) return false
    const item = input.pack.items.find((candidate) => candidate.id === input.engagementEvidenceId)
    if (!item) return false

    return isEngagementSafe({
        answer: input.answer,
        userMessage: input.userMessage,
        engagementQuestion: input.engagementQuestion,
        engagementEvidence: item.quote,
        context: item.quote
    })
}
```

Use them after payload parsing:

```ts
    if (!hasValidEvidenceSelection(evidencePack, payload.usedEvidenceIds)) {
        if (!hasAnySupportQuote(context, payload.supportQuotes)) {
            return fallbackResult(model, usage)
        }
    }

    const selectedText = payload.usedEvidenceIds.length > 0
        ? selectedEvidenceText(evidencePack, payload.usedEvidenceIds)
        : context

    if (!criticalFactsSupported(payload.answer, selectedText)) {
        return fallbackResult(model, usage)
    }

    const shouldAddEngagement = payload.engagementEvidenceId
        ? isEngagementEvidenceIdSafe({
            pack: evidencePack,
            answer: payload.answer,
            userMessage: input.userMessage,
            engagementQuestion: payload.engagementQuestion,
            engagementEvidenceId: payload.engagementEvidenceId
        })
        : isEngagementSafe({
            answer: payload.answer,
            userMessage: input.userMessage,
            engagementQuestion: payload.engagementQuestion,
            engagementEvidence: payload.engagementEvidence,
            context
        })

    const sourceChunks = payload.usedEvidenceIds.length > 0
        ? collectEvidenceSourceChunks(evidencePack, payload.usedEvidenceIds)
        : evidencePack.chunks
```

Return:

```ts
    return {
        answer: composeAnswer(payload.answer, payload.engagementQuestion, shouldAddEngagement),
        usedGeneration: true,
        addedEngagement: shouldAddEngagement,
        usage,
        model,
        evidencePack,
        usedEvidenceIds: payload.usedEvidenceIds,
        sourceChunks
    }
```

- [ ] **Step 5: Run answerer and evidence-pack tests**

Run:

```bash
npm test -- --run src/lib/knowledge-base/evidence-pack.test.ts src/lib/knowledge-base/rag-answer-generate.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit answerer implementation**

```bash
git add src/lib/knowledge-base/evidence-pack.ts src/lib/knowledge-base/rag-answer-generate.ts src/lib/knowledge-base/evidence-pack.test.ts src/lib/knowledge-base/rag-answer-generate.test.ts
git commit -m "feat(phase-9): answer rag from selected evidence"
```

---

## Task 5: Wire Evidence-Selected Sources Into Demo and Shared Pipeline

**Files:**
- Modify: `src/app/api/demo/[slug]/chat/route.ts`
- Modify: `src/app/api/demo/[slug]/chat/route.test.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.test.ts`

- [ ] **Step 1: Add failing route test for selected source chunks**

In `src/app/api/demo/[slug]/chat/route.test.ts`, add a generated-answer test that configures `generateGroundedRagAnswerMock` to return:

```ts
generateGroundedRagAnswerMock.mockResolvedValueOnce({
    answer: 'TLT yaz stajı 20 iş günüdür.',
    usedGeneration: true,
    addedEngagement: false,
    usage: null,
    model: 'gpt-4o-mini',
    usedEvidenceIds: ['ev_1'],
    sourceChunks: [{
        content: 'Yaz Stajı süresi 20 iş günüdür.',
        document_id: 'doc-tlt',
        document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
        chunk_id: 'chunk-tlt',
        source_url: 'https://example.edu.tr/tlt.pdf'
    }]
})
```

Assert the source appender receives only `sourceChunks`:

```ts
expect(appendCanonicalRagSourceLinksMock).toHaveBeenCalledWith(
    expect.stringContaining('20 iş günüdür'),
    [expect.objectContaining({ document_id: 'doc-tlt' })],
    expect.objectContaining({ force: true, limit: 2 })
)
```

- [ ] **Step 2: Add failing inbound-pipeline test for selected source chunks**

In `src/lib/channels/inbound-ai-pipeline.test.ts`, add the same generated answer mock shape and assert:

```ts
expect(appendCanonicalRagSourceLinksMock).toHaveBeenCalledWith(
    expect.stringContaining('20 iş günüdür'),
    [expect.objectContaining({ document_id: 'doc-tlt' })],
    expect.objectContaining({ force: true, limit: 2 })
)
```

- [ ] **Step 3: Run route and pipeline tests to verify failure**

Run:

```bash
npm test -- --run 'src/app/api/demo/[slug]/chat/route.test.ts' src/lib/channels/inbound-ai-pipeline.test.ts
```

Expected: FAIL because both call sites still pass the full `chunks` array.

- [ ] **Step 4: Pass selected source chunks in Demo Chat**

In `src/app/api/demo/[slug]/chat/route.ts`, inside the `generatedAnswer.usedGeneration` branch, add:

```ts
            const generatedSourceChunks = generatedAnswer.sourceChunks && generatedAnswer.sourceChunks.length > 0
                ? generatedAnswer.sourceChunks
                : chunks
```

Then change the generated return block:

```ts
                replyText: appendCanonicalRagSourceLinks(generatedAnswerForReply, generatedSourceChunks, {
                    force: true,
                    limit: 2
                }),
                skillImage: null,
                chunks: generatedSourceChunks,
```

- [ ] **Step 5: Pass selected source chunks in shared inbound RAG**

In `src/lib/channels/inbound-ai-pipeline.ts`, inside the generated RAG branch, add:

```ts
                    const generatedSourceChunks = groundedGeneratedRagResponse.sourceChunks && groundedGeneratedRagResponse.sourceChunks.length > 0
                        ? groundedGeneratedRagResponse.sourceChunks
                        : repairChunks
```

Then pass `generatedSourceChunks` into `appendCanonicalRagSourceLinks`.

- [ ] **Step 6: Run targeted route and pipeline tests**

Run:

```bash
npm test -- --run 'src/app/api/demo/[slug]/chat/route.test.ts' src/lib/channels/inbound-ai-pipeline.test.ts src/lib/knowledge-base/rag-answer-generate.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit integration**

```bash
git add 'src/app/api/demo/[slug]/chat/route.ts' 'src/app/api/demo/[slug]/chat/route.test.ts' src/lib/channels/inbound-ai-pipeline.ts src/lib/channels/inbound-ai-pipeline.test.ts src/lib/knowledge-base/rag-answer-generate.ts src/lib/knowledge-base/rag-answer-generate.test.ts
git commit -m "feat(phase-9): use selected rag evidence sources"
```

---

## Task 6: Hybrid RRF Helper Tests

**Files:**
- Create: `src/lib/knowledge-base/hybrid-retrieval.test.ts`
- Test target: `src/lib/knowledge-base/hybrid-retrieval.ts`

- [ ] **Step 1: Write failing RRF tests**

```ts
import { describe, expect, it } from 'vitest'
import { mergeHybridRagResults } from '@/lib/knowledge-base/hybrid-retrieval'

describe('mergeHybridRagResults', () => {
    it('fuses repeated chunks across channels with reciprocal rank fusion', () => {
        const results = mergeHybridRagResults({
            limit: 3,
            channels: [
                {
                    name: 'vector',
                    weight: 1,
                    results: [
                        { chunk_id: 'broad', content: 'Genel staj bilgisi', similarity: 0.95 },
                        { chunk_id: 'exact', content: 'TLT Yaz Stajı süresi 20 iş günüdür.', similarity: 0.7 }
                    ]
                },
                {
                    name: 'focused_evidence',
                    weight: 1.6,
                    results: [
                        { chunk_id: 'exact', content: 'TLT Yaz Stajı süresi 20 iş günüdür.', similarity: 0.7 }
                    ]
                }
            ],
            scoreBoost: (result) => result.content.includes('20 iş günü') ? 0.2 : 0
        })

        expect(results[0]?.chunk_id).toBe('exact')
        expect(results[0]?.rrf?.channels).toEqual(expect.arrayContaining(['vector', 'focused_evidence']))
        expect(results[0]?.rrf?.score).toBeGreaterThan(results[1]?.rrf?.score || 0)
    })

    it('dedupes by document and content when chunk id is missing', () => {
        const results = mergeHybridRagResults({
            limit: 5,
            channels: [
                {
                    name: 'keyword',
                    results: [{ document_id: 'doc-1', content: 'Ders içerikleri MEDU üzerinden paylaşılır.' }]
                },
                {
                    name: 'title_source',
                    results: [{ document_id: 'doc-1', content: 'Ders içerikleri MEDU üzerinden paylaşılır.' }]
                }
            ]
        })

        expect(results).toHaveLength(1)
        expect(results[0]?.rrf?.channels).toEqual(['keyword', 'title_source'])
    })
})
```

- [ ] **Step 2: Run RRF tests to verify failure**

Run:

```bash
npm test -- --run src/lib/knowledge-base/hybrid-retrieval.test.ts
```

Expected: FAIL because `hybrid-retrieval.ts` does not exist.

- [ ] **Step 3: Commit failing RRF tests**

```bash
git add src/lib/knowledge-base/hybrid-retrieval.test.ts
git commit -m "test(phase-9): cover hybrid rrf retrieval merge"
```

---

## Task 7: Hybrid RRF Helper Implementation

**Files:**
- Create: `src/lib/knowledge-base/hybrid-retrieval.ts`
- Test: `src/lib/knowledge-base/hybrid-retrieval.test.ts`

- [ ] **Step 1: Add RRF merge helper**

```ts
import type { RagChunk } from './rag'

export type HybridSearchChannelName =
    | 'vector'
    | 'keyword'
    | 'title_source'
    | 'focused_evidence'
    | 'planned'

export type HybridSearchChannel<T extends RagChunk> = {
    name: HybridSearchChannelName
    weight?: number
    results: T[]
}

export type HybridRagResult<T extends RagChunk> = T & {
    rrf?: {
        score: number
        channels: HybridSearchChannelName[]
    }
}

type MergeHybridRagResultsInput<T extends RagChunk> = {
    channels: Array<HybridSearchChannel<T>>
    limit: number
    rankConstant?: number
    scoreBoost?: (result: T) => number
}

function resultKey(result: RagChunk) {
    if (result.chunk_id) return `chunk:${result.chunk_id}`
    return `doc:${result.document_id || 'unknown'}:${result.content.replace(/\s+/g, ' ').trim().slice(0, 220)}`
}

export function mergeHybridRagResults<T extends RagChunk>(
    input: MergeHybridRagResultsInput<T>
): Array<HybridRagResult<T>> {
    const rankConstant = Math.max(1, input.rankConstant || 60)
    const byKey = new Map<string, {
        result: T
        score: number
        channels: HybridSearchChannelName[]
    }>()

    for (const channel of input.channels) {
        const weight = channel.weight || 1
        channel.results.forEach((result, index) => {
            const key = resultKey(result)
            const rank = index + 1
            const contribution = weight / (rankConstant + rank)
            const existing = byKey.get(key)
            if (existing) {
                existing.score += contribution
                if (!existing.channels.includes(channel.name)) existing.channels.push(channel.name)
                const existingSimilarity = typeof existing.result.similarity === 'number' ? existing.result.similarity : 0
                const nextSimilarity = typeof result.similarity === 'number' ? result.similarity : 0
                if (nextSimilarity > existingSimilarity) existing.result = result
            } else {
                byKey.set(key, {
                    result,
                    score: contribution,
                    channels: [channel.name]
                })
            }
        })
    }

    return Array.from(byKey.values())
        .map((entry) => ({
            ...entry.result,
            rrf: {
                score: entry.score + (input.scoreBoost ? input.scoreBoost(entry.result) : 0),
                channels: entry.channels
            }
        }))
        .sort((left, right) => {
            const leftScore = left.rrf?.score || 0
            const rightScore = right.rrf?.score || 0
            return rightScore - leftScore
        })
        .slice(0, Math.max(1, input.limit))
}
```

- [ ] **Step 2: Run RRF helper tests**

Run:

```bash
npm test -- --run src/lib/knowledge-base/hybrid-retrieval.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit RRF helper**

```bash
git add src/lib/knowledge-base/hybrid-retrieval.ts src/lib/knowledge-base/hybrid-retrieval.test.ts
git commit -m "feat(phase-9): add hybrid rrf merge helper"
```

---

## Task 8: Wire Hybrid RRF Into Knowledge Search

**Files:**
- Modify: `src/lib/knowledge-base/actions.ts`
- Modify: `src/lib/knowledge-base/actions.test.ts`
- Test: `src/lib/knowledge-base/hybrid-retrieval.test.ts`

- [ ] **Step 1: Add failing action regression**

In `src/lib/knowledge-base/actions.test.ts`, add a regression near existing Knowledge Base hybrid retrieval tests:

```ts
it('hybrid RRF lets focused evidence beat a broad vector neighbor for concrete values', async () => {
    const { supabase } = createHybridSearchSupabase({
        rpcRows: [{
            chunk_id: 'chunk-broad',
            document_id: 'doc-broad',
            document_title: 'Genel Staj Bilgisi',
            document_type: 'pdf',
            content: 'Staj uygulamaları ilgili programlarda açıklanır.',
            similarity: 0.94
        }],
        fallbackRows: [{
            id: 'chunk-tlt',
            document_id: 'doc-tlt',
            content: 'Yaz Stajı süresi 20 iş günüdür.',
            knowledge_documents: {
                title: 'Tıbbi Laboratuvar Teknikleri Programı',
                type: 'pdf',
                status: 'ready'
            }
        }]
    })

    const results = await searchKnowledgeBase('TLT yaz stajı kaç gün?', 'org-1', 0.5, 2, {
        supabase
    })

    expect(results[0]?.chunk_id).toBe('chunk-tlt')
})
```

- [ ] **Step 2: Run action regression to verify failure**

Run:

```bash
npm test -- --run src/lib/knowledge-base/actions.test.ts
```

Expected: FAIL if broad vector still outranks exact focused/keyword evidence.

- [ ] **Step 3: Import helper and replace merge internals**

In `src/lib/knowledge-base/actions.ts`, import:

```ts
import { mergeHybridRagResults, type HybridSearchChannel } from './hybrid-retrieval'
```

Replace `mergeSearchResults` with:

```ts
function mergeSearchResultChannels(
    query: string,
    channels: Array<HybridSearchChannel<KnowledgeSearchResult>>,
    limit: number
) {
    const filteredChannels = channels.map((channel) => ({
        ...channel,
        results: channel.results
            .map(enrichKnowledgeSearchResult)
            .filter((result) => !shouldSuppressAcademicSubjectMismatch(query, result))
    }))

    return mergeHybridRagResults({
        channels: filteredChannels,
        limit,
        scoreBoost: (result) => {
            const addressPriority = namedUnitAddressPriority(query, result)
            return addressPriority * 0.12 + Math.max(0, scoreKnowledgeResult(query, result)) * 0.08
        }
    })
}

function mergeSearchResults(
    query: string,
    vectorResults: KnowledgeSearchResult[],
    keywordResults: KnowledgeSearchResult[],
    limit: number
) {
    return mergeSearchResultChannels(query, [
        { name: 'vector', results: vectorResults, weight: 1 },
        { name: 'keyword', results: keywordResults, weight: 1.15 }
    ], limit)
}
```

- [ ] **Step 4: Convert single-query final merge to named channels**

In `searchKnowledgeBaseSingleQuery`, replace the final `lexicalResults` merge construction with:

```ts
    const keywordResults = [
        ...fallbackResults,
        ...focusedKeywordResults
    ]
    const titleSourceResults = [
        ...documentCodeResults,
        ...abbreviationResults,
        ...exactTitlePhraseResults,
        ...titleResults,
        ...sourceResults
    ]
    const focusedEvidenceResults = [
        ...policyDurationResults,
        ...focusedPolicyEvidenceResults
    ]

    return mergeSearchResultChannels(query, [
        { name: 'vector', results: data || [], weight: 1 },
        { name: 'keyword', results: keywordResults, weight: 1.1 },
        { name: 'title_source', results: titleSourceResults, weight: 1.25 },
        { name: 'focused_evidence', results: focusedEvidenceResults, weight: 1.55 }
    ], limit)
```

Remove final branches that return `mergeSearchResults(query, data, lexicalResults, limit)` so the named-channel path owns the final ranking. Keep branches that return an empty array when no channel has results.

- [ ] **Step 5: Run retrieval tests**

Run:

```bash
npm test -- --run src/lib/knowledge-base/hybrid-retrieval.test.ts src/lib/knowledge-base/actions.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit first RRF wiring**

```bash
git add src/lib/knowledge-base/actions.ts src/lib/knowledge-base/actions.test.ts src/lib/knowledge-base/hybrid-retrieval.ts src/lib/knowledge-base/hybrid-retrieval.test.ts
git commit -m "feat(phase-9): merge knowledge retrieval with hybrid rrf"
```

---

## Task 9: Remove Broad Early Returns That Bypass Hybrid Merge

**Files:**
- Modify: `src/lib/knowledge-base/actions.ts`
- Modify: `src/lib/knowledge-base/actions.test.ts`

- [ ] **Step 1: Add regression for vector plus focused evidence both contributing**

In `src/lib/knowledge-base/actions.test.ts`, add a regression that makes vector return one result and focused evidence return one result for the same concrete question. Assert the final top result carries the focused evidence content, and assert vector RPC was still called. Use existing Supabase RPC mock assertions already present in the file.

```ts
const { supabase, rpcMock } = createHybridSearchSupabase({
    rpcRows: [{
        chunk_id: 'chunk-broad',
        document_id: 'doc-broad',
        document_title: 'Genel Staj Bilgisi',
        document_type: 'pdf',
        content: 'Staj uygulamaları ilgili programlarda açıklanır.',
        similarity: 0.94
    }],
    fallbackRows: [{
        id: 'chunk-tlt',
        document_id: 'doc-tlt',
        content: 'Yaz Stajı süresi 20 iş günüdür.',
        knowledge_documents: {
            title: 'Tıbbi Laboratuvar Teknikleri Programı',
            type: 'pdf',
            status: 'ready'
        }
    }]
})

const results = await searchKnowledgeBase('TLT yaz stajı kaç gün?', 'org-1', 0.5, 2, {
    supabase
})

expect(rpcMock).toHaveBeenCalledWith('match_knowledge_chunks', expect.anything())
expect(results[0]?.content).toContain('20 iş günü')
```

- [ ] **Step 2: Refactor `searchKnowledgeBaseSingleQuery` to collect channels before returning**

In `searchKnowledgeBaseSingleQuery`, keep `lexicalFallbackResultsPromise` and `focusedPolicyEvidenceResultsPromise`, but remove these early return blocks:

```ts
if (shouldReturnPolicyDurationResultsEarly(query, policyDurationResults)) {
    return mergeSearchResults(query, [], policyDurationResults, limit)
}

if (shouldReturnFocusedEvidenceResultsEarly(query, focusedPolicyEvidenceResults)) {
    return mergeSearchResults(query, [], focusedPolicyEvidenceResults, limit)
}

if (lexicalEvidenceBeforeVector && shouldReturnLexicalEvidenceResultsEarly(query, lexicalEvidenceBeforeVector)) {
    return mergeSearchResults(query, [], lexicalEvidenceBeforeVector, limit)
}
```

Keep the lexical-before-vector helper only as a latency optimization if it warms a promise; do not let it skip vector when vector can still return inside the timeout.

- [ ] **Step 3: Preserve fallback behavior when vector is unavailable**

After all channel promises resolve, keep this empty guard:

```ts
    const hasAnyChannelResult = (data && data.length > 0)
        || keywordResults.length > 0
        || titleSourceResults.length > 0
        || focusedEvidenceResults.length > 0

    if (!hasAnyChannelResult) return []
```

- [ ] **Step 4: Run action tests**

Run:

```bash
npm test -- --run src/lib/knowledge-base/actions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit early-return cleanup**

```bash
git add src/lib/knowledge-base/actions.ts src/lib/knowledge-base/actions.test.ts
git commit -m "refactor(phase-9): keep rag retrieval channels in rrf merge"
```

---

## Task 10: Documentation and Regression Verification

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [ ] **Step 1: Update docs**

Add concise 2026-06-01 update notes:

- `docs/ROADMAP.md`: evidence pack is implemented, answerer uses selected evidence ids, retrieval uses hybrid RRF channels, prod deploy requires UI smoke.
- `docs/PRD.md`: RAG customer-facing answers must cite evidence-selected sources, and engagement requires selected evidence support.
- `docs/RELEASE.md`: Added/Changed entries for evidence pack, answerer contract, selected sources, and hybrid RRF retrieval.

- [ ] **Step 2: Run full targeted automated regression**

Run:

```bash
npm test -- --run src/lib/knowledge-base/evidence-pack.test.ts src/lib/knowledge-base/hybrid-retrieval.test.ts src/lib/knowledge-base/rag-answer-generate.test.ts src/lib/knowledge-base/actions.test.ts 'src/app/api/demo/[slug]/chat/route.test.ts' src/lib/channels/inbound-ai-pipeline.test.ts src/lib/knowledge-base/rag-source-links.test.ts src/lib/knowledge-base/rag-answer-repair.test.ts src/lib/ai/followup.test.ts src/lib/ai/response-guards.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run lint and build**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS. Existing `<img>` warnings are acceptable only if unchanged and still warnings.

- [ ] **Step 4: Commit implementation docs**

```bash
git add docs/ROADMAP.md docs/PRD.md docs/RELEASE.md
git commit -m "docs(phase-9): record evidence-pack rrf rag implementation"
```

---

## Task 11: Local or Test UI Smoke Before Production Deploy

**Files:**
- No source files changed in this task.
- Output artifacts: `tmp/crawl-output/public-demo-canary-*.md` and `.json`

- [ ] **Step 1: Start local production server**

Run:

```bash
npm run build
PORT=3000 npm run start
```

Expected: local app serves `http://127.0.0.1:3000`.

- [ ] **Step 2: Run public-demo canary against local server**

In a second terminal, run:

```bash
PUBLIC_DEMO_BASE_URL=http://127.0.0.1:3000 PUBLIC_DEMO_CANARY_CASES=1,2,3,4,5,6,7,8,9,10 npx tsx scripts/knowledge/qa-public-demo-canary.ts
```

Expected: `SUMMARY 10/10`, with report paths printed under `tmp/crawl-output`.

- [ ] **Step 3: Browser smoke the local Demo UI**

Open:

```txt
http://127.0.0.1:3000/demo/yiu-qualy-ai-demo
```

Ask at least these 10 questions through the UI:

1. `SBF kampüsü nerede?`
2. `SHMYO kampüsü nerede?`
3. `TLT program sorumlusunun iletişim bilgisi nedir?`
4. `TLT programında yaz stajı var mı, kaç gün?`
5. `TLT öğrencisi çift anadal yapabilir mi?`
6. `Tıp fakültesinde eğitim süresi ne kadar?`
7. `Tıp fakültesinde yaz stajı var mı?`
8. `Finale girmeden bütünlemeye girebilir miyim?`
9. `Sağlık raporu vermeden mazeret sınavına giremez miyim?`
10. `Ders içeriklerine nereden ulaşabilirim?`

Expected:

- No answer says `Bu konuda elimde net bilgi yok` when the corpus contains the answer.
- Each factual value is supported by the displayed source.
- Multiple-source answers show correct multiple sources.
- Engagement questions are present only when the answer contains a source-backed adjacent topic.
- The tone is warmer than the old terse deterministic answer while staying concise.

- [ ] **Step 4: Record smoke findings**

If all local/test UI checks pass, add the report path and a short result summary to the final response. Do not deploy to production in this task unless the user explicitly approves deployment after reviewing local/test smoke output.

---

## Task 12: Final Pre-Deploy Gate

**Files:**
- No source files changed in this task unless smoke reveals a bug.

- [ ] **Step 1: Check git status**

Run:

```bash
git status --short
```

Expected: no uncommitted source/doc changes except ignored smoke artifacts under `tmp`.

- [ ] **Step 2: Present deployment decision**

Report:

- automated test summary
- lint/build summary
- local/test canary summary
- UI smoke findings
- known residual risk

Ask for production deploy approval. Production deploy happens only after this gate.
