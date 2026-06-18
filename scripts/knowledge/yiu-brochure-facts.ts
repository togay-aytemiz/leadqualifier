export type YiuBrochureFact = {
  program: string
  variant: string
  scoreType: string | null
  quota: number | null
  priorRank: number | null
  priorScore: number | null
  priceTl: number | null
  quotaYear: 2025
  priceYear: 2025
  placementYear: 2024
  sourceConflict: boolean
}

function parseInteger(value: string, field: string) {
  const trimmed = value.trim()
  if (trimmed === '-') return null
  if (!/^\d{1,3}(?:\.\d{3})*$|^\d+$/.test(trimmed)) {
    throw new Error(`Invalid ${field}: ${value}`)
  }
  return Number(trimmed.replace(/\./g, ''))
}

function parseScore(value: string) {
  const trimmed = value.trim()
  if (trimmed === '-') return null
  if (!/^\d+(?:,\d+)?$/.test(trimmed)) throw new Error(`Invalid prior score: ${value}`)
  return Number(trimmed.replace(',', '.'))
}

function normalizeVariant(value: string) {
  if (/^%50 İnd(?:irimli)?\.?$/i.test(value)) return '%50 İndirimli'
  return value
}

function splitProgramAndVariant(value: string) {
  const cleaned = value.replace(/\s+Yeni\s*$/i, '').trim()
  const match = cleaned.match(/^(.*?)\s*\((Ücretli|Burslu|%50 İnd(?:irimli)?\.?|Hazırlık)\)\s*$/i)
  if (!match) throw new Error(`Program row has no supported variant: ${value}`)
  return {
    program: match[1]!.trim(),
    variant: normalizeVariant(match[2]!.trim()),
  }
}

export function parseYiuBrochureFacts(markdown: string) {
  const facts: Record<string, YiuBrochureFact> = {}
  const sections = markdown.split(/^##\s+/m).slice(1)

  for (const section of sections) {
    const [heading = '', ...bodyLines] = section.split(/\r?\n/)
    if (!heading.includes('2025 Kontenjan ve Fiyat Tablosu')) continue

    const rows = bodyLines.filter((line) => /^\|/.test(line.trim()))
    for (const row of rows.slice(2)) {
      const cells = row
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim())
      if (cells.length !== 7) throw new Error(`Expected 7 brochure columns: ${row}`)

      const [, programCell, scoreTypeCell, quotaCell, rankCell, scoreCell, priceCell] = cells
      const { program, variant } = splitProgramAndVariant(programCell!)
      const fact: YiuBrochureFact = {
        program,
        variant,
        scoreType: scoreTypeCell === '-' ? null : scoreTypeCell!,
        quota: parseInteger(quotaCell!, 'quota'),
        priorRank: parseInteger(rankCell!, 'prior rank'),
        priorScore: parseScore(scoreCell!),
        priceTl: parseInteger(priceCell!, 'price'),
        quotaYear: 2025,
        priceYear: 2025,
        placementYear: 2024,
        sourceConflict: program === 'Tıbbi Tanıtım ve Pazarlama' && variant === 'Burslu',
      }
      facts[`${program}|${variant}`] = fact
    }
  }

  if (Object.keys(facts).length === 0) throw new Error('No brochure price facts found')
  return facts
}
