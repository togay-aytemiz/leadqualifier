import type { MvpResponseLanguage } from '@/lib/ai/language'
import type { RagChunk } from '@/lib/knowledge-base/rag'

import type { LlmFirstGroundedAnswer } from './evidence'

type MetricKey =
  | 'quota'
  | 'success_rank'
  | 'base_score'
  | 'price'
  | 'point_type'
  | 'program_code'
  | 'duration'
type VariantKey = 'paid' | 'scholarship' | 'discount' | 'prep'

type ParsedTable = {
  headers: string[]
  rows: string[][]
  chunk: RagChunk
  chunkIndex: number
}

type SelectedRow = {
  program: string
  variant: string
  value: string
  chunk: RagChunk
  evidenceId: string
}

const ADMISSIONS_TABLE_HEADERS = [
  'Puan Kodu',
  'Bölüm Adı',
  'Puan Türü',
  '2025 Kontenjanı',
  '2024 Başarı Sırası',
  '2024 Taban Puanı',
  '2025 Fiyat',
]

const TURKISH_CHAR_MAP: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  ğ: 'g',
  Ğ: 'g',
  ü: 'u',
  Ü: 'u',
  ş: 's',
  Ş: 's',
  ö: 'o',
  Ö: 'o',
  ç: 'c',
  Ç: 'c',
}

const SUBJECT_STOPWORDS = new Set([
  'acaba',
  'adet',
  'aday',
  'alıyor',
  'alir',
  'alıyor',
  'basari',
  'bana',
  'bolum',
  'bolumu',
  'burs',
  'burslu',
  'fakulte',
  'fakultesi',
  'fiyat',
  'fiyati',
  'icin',
  'egitim',
  'ingilizce',
  'ind',
  'indirim',
  'indirimli',
  'kac',
  'kisi',
  'kod',
  'kodu',
  'kontenjan',
  'kontenjani',
  'nedir',
  'program',
  'programi',
  'programinin',
  'puan',
  'puani',
  'sirasi',
  'siralama',
  'soyle',
  'sure',
  'suresi',
  'taban',
  'tl',
  'tr',
  'turkce',
  'turu',
  'universite',
  'universitesi',
  'ucret',
  'ucreti',
  'ucretli',
  'var',
  'yuksek',
  'ihtisas',
  'year',
  'years',
  'yil',
  'yillik',
  'yuzde',
])

const METRICS: Array<{
  key: MetricKey
  queryPatterns: RegExp[]
  headerPatterns: RegExp[]
}> = [
  {
    key: 'quota',
    queryPatterns: [/\bkontenjan/, /\bkac kisi\b/, /\bkac ogrenci\b/, /\bkac aday\b/],
    headerPatterns: [/\bkontenjan/],
  },
  {
    key: 'success_rank',
    queryPatterns: [/\bbasari sirasi\b/, /\bsiralama/, /\bsirasi\b/],
    headerPatterns: [/\bbasari sirasi\b/, /\bsiralama/],
  },
  {
    key: 'base_score',
    queryPatterns: [/\btaban puan/, /\btaban puani/],
    headerPatterns: [/\btaban puan/, /\btaban puani/],
  },
  {
    key: 'price',
    queryPatterns: [/\bfiyat/, /\bucret/, /\bkac para\b/, /\bne kadar\b/, /\btl\b/],
    headerPatterns: [/\bfiyat/, /\bucret/],
  },
  {
    key: 'point_type',
    queryPatterns: [/\bpuan turu\b/, /\bsayisal\b/, /\btyt\b/, /\bea\b/],
    headerPatterns: [/\bpuan turu\b/],
  },
  {
    key: 'program_code',
    queryPatterns: [/\bprogram kodu\b/, /\bpuan kodu\b/],
    headerPatterns: [/\bprogram kodu\b/, /\bpuan kodu\b/],
  },
  {
    key: 'duration',
    queryPatterns: [/\begitim suresi\b/, /\bsuresi\b/, /\bkac yil\b/, /\bkac yillik\b/],
    headerPatterns: [/\begitim suresi\b/, /\beducation time\b/, /\bsure\b/],
  },
]

function normalize(value: string) {
  return value
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function splitMarkdownRow(line: string) {
  const trimmed = line.trim()
  if (!trimmed.includes('|')) return []
  return trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isSeparatorRow(cells: string[]) {
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

function isHeaderLikeRow(cells: string[]) {
  const normalized = cells.map((cell) => normalize(cell)).join(' ')
  return /\b(bolum|program).*\badi\b/.test(normalized) || /\bpuan turu\b/.test(normalized)
}

function isLikelyAdmissionDataRow(cells: string[]) {
  if (cells.length !== ADMISSIONS_TABLE_HEADERS.length) return false
  if (isSeparatorRow(cells) || isHeaderLikeRow(cells)) return false

  const program = normalize(cells[1] ?? '')
  const pointType = normalize(cells[2] ?? '')
  const hasProgramName = /[a-z]/.test(program)
  const hasPointType = /^(say|ea|tyt|-)$/.test(pointType)
  return hasProgramName && hasPointType
}

function extractTables(chunks: RagChunk[]): ParsedTable[] {
  const tables: ParsedTable[] = []

  chunks.forEach((chunk, chunkIndex) => {
    const lines = chunk.content.split(/\r?\n/)
    for (let index = 0; index < lines.length - 1; index += 1) {
      const headers = splitMarkdownRow(lines[index] ?? '')
      const separator = splitMarkdownRow(lines[index + 1] ?? '')
      if (headers.length < 2 || !isSeparatorRow(separator)) continue

      const rows: string[][] = []
      let cursor = index + 2
      while (cursor < lines.length) {
        const cells = splitMarkdownRow(lines[cursor] ?? '')
        if (cells.length !== headers.length) break
        rows.push(cells)
        cursor += 1
      }

      if (rows.length > 0) {
        tables.push({ headers, rows, chunk, chunkIndex })
      }
      index = cursor
    }

    let orphanRows: string[][] = []
    for (const line of lines) {
      const cells = splitMarkdownRow(line)
      if (isLikelyAdmissionDataRow(cells)) {
        orphanRows.push(cells)
        continue
      }

      if (orphanRows.length > 0) {
        tables.push({
          headers: ADMISSIONS_TABLE_HEADERS,
          rows: orphanRows,
          chunk,
          chunkIndex,
        })
        orphanRows = []
      }
    }

    if (orphanRows.length > 0) {
      tables.push({
        headers: ADMISSIONS_TABLE_HEADERS,
        rows: orphanRows,
        chunk,
        chunkIndex,
      })
    }
  })

  return tables
}

function detectMetric(question: string): MetricKey | null {
  const normalized = normalize(question)
  if (/\b(siralamam|puanim|puanım|girebilir|tutar mi|tutar mı|yerles|tercih edebilir|gelir mi)\b/.test(normalized)) {
    return null
  }

  return (
    METRICS.find((metric) =>
      metric.queryPatterns.some((pattern) => pattern.test(normalized))
    )?.key ?? null
  )
}

function metricDefinition(metricKey: MetricKey) {
  return METRICS.find((metric) => metric.key === metricKey)!
}

function findMetricColumn(headers: string[], metricKey: MetricKey) {
  const metric = metricDefinition(metricKey)
  return headers.findIndex((header) =>
    metric.headerPatterns.some((pattern) => pattern.test(normalize(header)))
  )
}

function findProgramColumn(headers: string[]) {
  const index = headers.findIndex((header) => {
    const normalized = normalize(header)
    return /\b(program|bolum|fakulte).*\badi\b/.test(normalized) || /\badi\b/.test(normalized)
  })
  return index >= 0 ? index : 0
}

function subjectTokens(question: string) {
  return normalize(question)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !SUBJECT_STOPWORDS.has(token))
}

function rowMatchesSubject(program: string, tokens: string[]) {
  if (tokens.length === 0) return false
  const normalizedProgram = normalize(program)
  const matchingTokens = tokens.filter((token) => normalizedProgram.includes(token))
  if (matchingTokens.length === 0) return false
  return matchingTokens.length === tokens.length || matchingTokens.some((token) => token.length >= 5)
}

function durationValue(line: string) {
  const match = line.match(/\b(?:[1-9]|1[0-2])\s*(?:yıl|yil|years?|sene)\b(?:\s*\([^)]+\))?/i)
  return match?.[0]?.trim() ?? ''
}

function cleanDurationValue(value: string) {
  return value.replace(/\s*\((?:years?|yil|yıl)\)\s*/gi, '').trim()
}

function requestedLanguage(question: string) {
  const normalized = normalize(question)
  return {
    english: /\bingilizce\b|\benglish\b/.test(normalized),
    turkish: /\bturkce\b|\bturkish\b|\btr\b/.test(normalized),
  }
}

function requestedVariant(question: string): VariantKey | null {
  const normalized = normalize(question)
  if (/%\s*50|\b50 ind|\bindirim/.test(normalized)) return 'discount'
  if (/\bburslu\b|\bburs\b/.test(normalized)) return 'scholarship'
  if (/\bucretli\b/.test(normalized)) return 'paid'
  if (/\bhazirlik\b/.test(normalized)) return 'prep'
  return null
}

function rowVariant(program: string): VariantKey | null {
  const normalized = normalize(program)
  if (/%\s*50|\b50 ind|\bindirim/.test(normalized)) return 'discount'
  if (/\bburslu\b/.test(normalized)) return 'scholarship'
  if (/\bucretli\b/.test(normalized)) return 'paid'
  if (/\bhazirlik\b/.test(normalized)) return 'prep'
  return null
}

function variantLabel(program: string) {
  switch (rowVariant(program)) {
    case 'paid':
      return 'Ücretli'
    case 'scholarship':
      return 'Burslu'
    case 'discount':
      return '%50 İndirimli'
    case 'prep':
      return 'Hazırlık'
    default:
      return program.trim()
  }
}

function baseProgramLabel(program: string) {
  return program
    .replace(
      /\s*\((?:Ücretli|Burslu|%50\s*İnd\.?|%50\s*İndirimli|Hazırlık|Türkçe|İngilizce|English)\)\s*/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()
}

function hasUsableValue(metricKey: MetricKey, value: string) {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (metricKey !== 'price' && trimmed === '-') return false
  return true
}

function formatValue(metricKey: MetricKey, value: string) {
  const trimmed = value.trim()
  if (metricKey === 'price') {
    if (trimmed === '-') return 'ücret belirtilmemiş'
    return /\btl\b/i.test(trimmed) ? trimmed : `${trimmed} TL`
  }
  if (metricKey === 'duration') return cleanDurationValue(trimmed)
  return trimmed
}

function metricLabel(metricKey: MetricKey, header: string, plural: boolean) {
  const year = header.match(/\b20\d{2}\b/)?.[0]
  const prefix = year ? `${year} ` : ''

  if (metricKey === 'quota') return `${prefix}${plural ? 'kontenjanları' : 'kontenjanı'}`
  if (metricKey === 'success_rank') return `${prefix}${plural ? 'başarı sıraları' : 'başarı sırası'}`
  if (metricKey === 'base_score') return `${prefix}${plural ? 'taban puanları' : 'taban puanı'}`
  if (metricKey === 'price') return `${prefix}${plural ? 'ücretleri' : 'ücreti'}`
  if (metricKey === 'point_type') return plural ? 'puan türleri' : 'puan türü'
  if (metricKey === 'duration') return plural ? 'eğitim süreleri' : 'eğitim süresi'
  return plural ? 'program kodları' : 'program kodu'
}

function commonBaseProgram(rows: SelectedRow[]) {
  const bases = rows.map((row) => baseProgramLabel(row.program)).filter(Boolean)
  const [first] = bases
  if (!first) return ''
  return bases.every((base) => normalize(base) === normalize(first)) ? first : ''
}

function itemLabel(row: SelectedRow, hasCommonBase: boolean) {
  return hasCommonBase ? row.variant : row.program
}

function dedupeRows(rows: SelectedRow[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = [normalize(row.program), normalize(row.value)].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function extractLineMetricRows(input: {
  metricKey: MetricKey
  chunks: RagChunk[]
  tokens: string[]
}): SelectedRow[] {
  if (input.metricKey !== 'duration') return []

  const rows: SelectedRow[] = []
  input.chunks.forEach((chunk, chunkIndex) => {
    const lines = chunk.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const subjectLine = lines.find(
      (line) => line.length <= 160 && rowMatchesSubject(line, input.tokens)
    )

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? ''
      if (line.length <= 160 && rowMatchesSubject(line, input.tokens)) {
        const nearbyDuration =
          durationValue(line) ||
          durationValue(lines[index + 1] ?? '') ||
          durationValue(lines[index + 2] ?? '') ||
          durationValue(lines[index + 3] ?? '')
        if (nearbyDuration) {
          rows.push({
            program: line.replace(durationValue(line), '').trim() || line,
            variant: variantLabel(line),
            value: nearbyDuration,
            chunk,
            evidenceId: `E${chunkIndex + 1}`,
          })
        }
      }

      if (
        subjectLine &&
        metricDefinition(input.metricKey).headerPatterns.some((pattern) =>
          pattern.test(normalize(line))
        )
      ) {
        const nearbyDuration =
          durationValue(lines[index + 1] ?? '') ||
          durationValue(lines[index + 2] ?? '') ||
          durationValue(lines[index + 3] ?? '')
        if (nearbyDuration) {
          rows.push({
            program: subjectLine,
            variant: variantLabel(subjectLine),
            value: nearbyDuration,
            chunk,
            evidenceId: `E${chunkIndex + 1}`,
          })
        }
      }
    }
  })

  return rows
}

function buildAnswer(input: {
  rows: SelectedRow[]
  metricKey: MetricKey
  metricHeader: string
  responseLanguage: MvpResponseLanguage
}) {
  const plural = input.rows.length > 1
  const label = metricLabel(input.metricKey, input.metricHeader, plural)

  if (input.responseLanguage === 'en') {
    if (!plural) {
      const row = input.rows[0]
      if (!row) return ''
      return `${row.program}'s ${label} is ${formatValue(input.metricKey, row.value)}.`
    }
    const base = commonBaseProgram(input.rows)
    const hasCommonBase = Boolean(base)
    const items = input.rows
      .map((row) => `${itemLabel(row, hasCommonBase)} ${formatValue(input.metricKey, row.value)}`)
      .join(', ')
    return `${base || 'The matching programs'} ${label}: ${items}.`
  }

  if (!plural) {
    const row = input.rows[0]
    if (!row) return ''
    return `${row.program} için ${label} ${formatValue(input.metricKey, row.value)}.`
  }

  const base = commonBaseProgram(input.rows)
  const hasCommonBase = Boolean(base)
  const items = input.rows
    .map((row) => `${itemLabel(row, hasCommonBase)} ${formatValue(input.metricKey, row.value)}`)
    .join(', ')
  return `${base || 'Eşleşen programlar'} için ${label}: ${items}.`
}

export function composeLlmFirstTableFactAnswer(input: {
  resolvedQuestion: string
  answerGoal: string
  responseLanguage: MvpResponseLanguage
  chunks: RagChunk[]
}): LlmFirstGroundedAnswer | null {
  const metricKey = detectMetric(`${input.resolvedQuestion}\n${input.answerGoal}`)
  if (!metricKey) return null

  const tokens = subjectTokens(input.resolvedQuestion)
  if (tokens.length === 0) return null

  const language = requestedLanguage(input.resolvedQuestion)
  const variant = requestedVariant(input.resolvedQuestion)
  const selectedRows: SelectedRow[] = []
  let metricHeader = ''

  for (const table of extractTables(input.chunks)) {
    const metricColumn = findMetricColumn(table.headers, metricKey)
    if (metricColumn < 0) continue
    const programColumn = findProgramColumn(table.headers)
    metricHeader = metricHeader || table.headers[metricColumn] || ''

    for (const row of table.rows) {
      const program = row[programColumn]?.trim() ?? ''
      const value = row[metricColumn]?.trim() ?? ''
      const normalizedProgram = normalize(program)
      if (!program || !hasUsableValue(metricKey, value)) continue
      if (!rowMatchesSubject(program, tokens)) continue
      if (language.english && !/\bingilizce\b|\benglish\b/.test(normalizedProgram)) continue
      if (language.turkish && /\bingilizce\b|\benglish\b/.test(normalizedProgram)) continue
      if (variant && rowVariant(program) !== variant) continue

      selectedRows.push({
        program,
        variant: variantLabel(program),
        value,
        chunk: table.chunk,
        evidenceId: `E${table.chunkIndex + 1}`,
      })
    }
  }

  selectedRows.push(
    ...extractLineMetricRows({
      metricKey,
      chunks: input.chunks,
      tokens,
    })
  )
  if (!metricHeader && metricKey === 'duration') {
    metricHeader = input.responseLanguage === 'en' ? 'Education Time' : 'Eğitim Süresi'
  }

  const uniqueRows = dedupeRows(selectedRows)
  if (uniqueRows.length === 0 || !metricHeader) return null

  const sourceChunks = Array.from(
    new Map(uniqueRows.map((row) => [row.evidenceId, row.chunk])).values()
  )
  const usedEvidenceIds = Array.from(new Set(uniqueRows.map((row) => row.evidenceId)))

  return {
    answer: buildAnswer({
      rows: uniqueRows,
      metricKey,
      metricHeader,
      responseLanguage: input.responseLanguage,
    }),
    usedEvidenceIds,
    sourceChunks,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    model: 'deterministic_table_fact_extractor',
  }
}
