import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { parseIntentPack } from './push-yiu-intent-skill-pack'

const DEFAULT_PACK = 'docs/evaluations/yiu-intent-skill-pack-v2-2026-06-13.md'
const SOURCE_CLERK_PATTERN = /\b(kaynakta|broşürde|tabloda|dokümanda|satırda|markdown(?:da)?)\b/iu

const REQUIRED_FACTS: Record<string, string[]> = {
  hemsirelik_ucret_kontenjan: [
    'kontenjan 2, ücret 490.000 TL',
    'kontenjan 7, ücret tutarı verilmez',
    'kontenjan 45, ücret 245.000 TL',
  ],
  fizyoterapi_rehabilitasyon_ucret_kontenjan: [
    'taban puanı 252,411, başarı sırası 510.665',
    'taban puanı 310,627, başarı sırası 233.156',
    'taban puanı 253,403, başarı sırası 504.403',
  ],
  ergoterapi_ebelik_ucret_kontenjan: [
    'Ücretli: kontenjan 6, ücret 460.000 TL',
    'Burslu: kontenjan 4, ücret tutarı verilmez',
    '%50 İndirimli: kontenjan 19, ücret 230.000 TL',
  ],
  anestezi_ucret_kontenjan: [
    'kontenjan 10, ücret 330.000 TL',
    'kontenjan 10, ücret tutarı verilmez',
    'kontenjan 50, ücret 165.000 TL',
  ],
  ameliyathane_hizmetleri_ucret_kontenjan: [
    'kontenjan 5, ücret 330.000 TL',
    'kontenjan 10, ücret tutarı verilmez',
    'kontenjan 55, ücret 165.000 TL',
  ],
  myo_ucretler: [
    'Bilgisayar Programcılığı (Ücretli): kontenjan 5, ücret 330.000 TL',
    'Eczane Hizmetleri (Ücretli): kontenjan 2, ücret 330.000 TL',
    'Elektrik (Ücretli): kontenjan 7, ücret 300.000 TL',
    'Grafik Tasarım (Ücretli): kontenjan 7, ücret 300.000 TL',
  ],
  shmyo_diger_programlar_ucret_kontenjan: [
    'Biyomedikal Cihaz Teknolojisi: ücretli kontenjan 5',
    'Elektronörofizyoloji: ücretli kontenjan 5',
    'Optisyenlik: ücretli kontenjan 5',
    'Tıbbi Dokümantasyon ve Sekreterlik: ücretli kontenjan 5',
  ],
}

function normalizeTrigger(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR')
}

export function auditYiuIntentSkillPack(markdown: string) {
  const intents = parseIntentPack(markdown)
  const seenTriggers = new Map<string, string>()
  const duplicateTriggers: Array<{ trigger: string; firstSlug: string; secondSlug: string }> = []

  for (const intent of intents) {
    for (const trigger of intent.triggerExamples) {
      const normalized = normalizeTrigger(trigger)
      const firstSlug = seenTriggers.get(normalized)
      if (firstSlug && firstSlug !== intent.slug) {
        duplicateTriggers.push({ trigger, firstSlug, secondSlug: intent.slug })
      } else {
        seenTriggers.set(normalized, intent.slug)
      }
    }
  }

  const sourceClerkResponses = intents
    .filter((intent) => SOURCE_CLERK_PATTERN.test(intent.responseText))
    .map((intent) => intent.slug)
  const bySlug = new Map(intents.map((intent) => [intent.slug, intent.responseText]))
  const knownFactMismatches = Object.entries(REQUIRED_FACTS).flatMap(([slug, snippets]) => {
    const response = bySlug.get(slug) ?? ''
    return snippets
      .filter((snippet) => !response.includes(snippet))
      .map((snippet) => ({ slug, missing: snippet }))
  })

  return {
    intentCount: intents.length,
    exampleCount: intents.reduce((sum, intent) => sum + intent.triggerExamples.length, 0),
    duplicateTriggers,
    sourceClerkResponses,
    knownFactMismatches,
  }
}

async function main() {
  const packPath = path.resolve(process.env.YIU_INTENT_PACK_PATH?.trim() || DEFAULT_PACK)
  const audit = auditYiuIntentSkillPack(await readFile(packPath, 'utf8'))
  console.log(JSON.stringify(audit, null, 2))
  if (
    audit.intentCount < 50 ||
    audit.duplicateTriggers.length > 0 ||
    audit.sourceClerkResponses.length > 0 ||
    audit.knownFactMismatches.length > 0
  ) {
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error((error as Error).message)
    process.exitCode = 1
  })
}
