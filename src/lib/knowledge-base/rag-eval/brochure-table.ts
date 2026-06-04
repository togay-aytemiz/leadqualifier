import type { BrochureQueryPlan, BrochureTableField } from './brochure-query-plan'
import type { RagProviderCitation } from './types'

export type BrochureTableRow = {
  programCode: string
  programName: string
  pointType: string
  quota: string
  successRank: string
  baseScore: string
  price: string
  quote: string
}

export type BrochureTableFactResult = {
  answer: string
  row: BrochureTableRow
  rows: BrochureTableRow[]
  citation: RagProviderCitation
  requestedFields: BrochureTableField[]
}

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

function normalize(value: string) {
  return value
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function parseMarkdownCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isDividerRow(cells: string[]) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function isHeaderRow(cells: string[]) {
  const second = normalize(cells[1] ?? '')
  return second === 'bolum adi' || second === 'program adi'
}

export function parseBrochureTableRows(content: string): BrochureTableRow[] {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|') && line.trim().endsWith('|'))
    .map(parseMarkdownCells)
    .filter((cells) => cells.length === 7 && !isDividerRow(cells) && !isHeaderRow(cells))
    .map((cells) => ({
      programCode: cells[0] ?? '',
      programName: cells[1] ?? '',
      pointType: cells[2] ?? '',
      quota: cells[3] ?? '',
      successRank: cells[4] ?? '',
      baseScore: cells[5] ?? '',
      price: cells[6] ?? '',
      quote: `| ${cells.join(' | ')} |`,
    }))
    .filter((row) => Boolean(row.programName))
}

function rowHasVariant(rowName: string, variant: string | undefined) {
  if (!variant) return true

  const row = normalize(rowName)
  const normalizedVariant = normalize(variant)
  const needsEnglish = normalizedVariant.includes('ingilizce')
  const needsDiscount = normalizedVariant.includes('%50')
  const needsBurslu = normalizedVariant.includes('burslu')
  const needsPaid = normalizedVariant.includes('ucretli')
  const needsPreparation = normalizedVariant.includes('hazirlik')

  if (needsEnglish !== row.includes('ingilizce')) return false
  if (needsDiscount !== row.includes('%50')) return false
  if (needsBurslu !== row.includes('burslu')) return false
  if (needsPaid !== row.includes('ucretli')) return false
  if (needsPreparation !== row.includes('hazirlik')) return false
  return true
}

function matchingRows(rows: BrochureTableRow[], plan: BrochureQueryPlan) {
  const programs = (plan.programs.length > 0 ? plan.programs : plan.program ? [plan.program] : []).map(
    normalize
  )
  if (programs.length === 0) return []
  const variants = plan.variants.length > 0 ? plan.variants : plan.variant ? [plan.variant] : []
  return rows.filter(
    (row) =>
      programs.some((program) => normalize(row.programName).includes(program)) &&
      (variants.length === 0 || variants.some((variant) => rowHasVariant(row.programName, variant)))
  )
}

function fieldValue(row: BrochureTableRow, field: BrochureTableField) {
  if (field === 'price') return row.price
  if (field === 'quota') return row.quota
  if (field === 'success_rank') return row.successRank
  if (field === 'base_score') return row.baseScore
  if (field === 'point_type') return row.pointType
  return row.programCode
}

function missingFieldAnswer(field: BrochureTableField) {
  if (field === 'price') return '2025 fiyat alanı broşürde belirtilmemiştir'
  if (field === 'quota') return '2025 kontenjanı broşürde belirtilmemiştir'
  if (field === 'success_rank') return '2024 başarı sırası broşürde belirtilmemiştir'
  if (field === 'base_score') return '2024 taban puanı broşürde belirtilmemiştir'
  if (field === 'point_type') return 'puan türü broşürde belirtilmemiştir'
  return 'puan kodu broşürde belirtilmemiştir'
}

function supportedFieldAnswer(row: BrochureTableRow, field: BrochureTableField) {
  const value = fieldValue(row, field)
  if (!value || value === '-') return missingFieldAnswer(field)
  if (field === 'price') return `2025 fiyatı ${value} TL`
  if (field === 'quota') return `2025 kontenjanı ${value}`
  if (field === 'success_rank') return `2024 başarı sırası ${value}`
  if (field === 'base_score') return `2024 taban puanı ${value}`
  if (field === 'point_type') return `puan türü ${value}`
  return `puan kodu ${value}`
}

function isKnownInconsistentRow(row: BrochureTableRow) {
  return normalize(row.programName) === normalize('Tıbbi Tanıtım ve Pazarlama (Burslu)')
}

function renderAnswer(row: BrochureTableRow, fields: BrochureTableField[]) {
  const facts = fields.map((field) => supportedFieldAnswer(row, field))
  const factText =
    facts.length === 1
      ? facts[0]
      : `${facts.slice(0, -1).join(', ')} ve ${facts.at(-1)}`
  const warning = isKnownInconsistentRow(row)
    ? ' Bu burslu satırındaki fiyat diğer burslu satırlarla tutarsız göründüğü için kayıt öncesinde üniversiteyle teyit edilmesi önerilir.'
    : ''
  return `${row.programName} için ${factText} olarak broşürde gösterilmiştir.${warning}`
}

function renderAnswers(rows: BrochureTableRow[], fields: BrochureTableField[]) {
  if (rows.length === 1) return renderAnswer(rows[0]!, fields)
  return rows.map((row) => `- ${renderAnswer(row, fields)}`).join('\n')
}

export function resolveBrochureTableFact(input: {
  plan: BrochureQueryPlan
  citations: RagProviderCitation[]
}): BrochureTableFactResult | null {
  if (input.plan.intent !== 'brochure_table_fact' || input.plan.requestedFields.length === 0) {
    return null
  }

  for (const citation of input.citations) {
    const rows = parseBrochureTableRows(citation.quote ?? '')
    const matches = matchingRows(rows, input.plan)
    if (matches.length === 0) continue
    const row = matches[0]
    if (!row) continue
    return {
      answer: renderAnswers(matches, input.plan.requestedFields),
      row,
      rows: matches,
      citation,
      requestedFields: input.plan.requestedFields,
    }
  }

  return null
}
