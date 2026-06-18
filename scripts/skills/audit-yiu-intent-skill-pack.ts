import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { buildYiuActiveIntentUnion } from './push-yiu-intent-skill-pack'
import { buildYiuProgramFactIntents } from './yiu-program-fact-skills'

const DEFAULT_PACK = 'docs/evaluations/yiu-intent-skill-pack-v2-2026-06-13.md'
const DEFAULT_BROCHURE = 'src/lib/knowledge-base/provider-data/yiu-2025-brochure-verified.md'
const SOURCE_CLERK_PATTERN = /\b(kaynakta|broşürde|tabloda|dokümanda|satırda|markdown(?:da)?)\b/iu

function normalizeTrigger(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR')
}

export function auditYiuIntentSkillPack(markdown: string, brochureMarkdown: string) {
  const intents = buildYiuActiveIntentUnion(markdown, brochureMarkdown)
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
  const knownFactMismatches = buildYiuProgramFactIntents(brochureMarkdown)
    .filter((expected) => bySlug.get(expected.slug) !== expected.responseText)
    .map((expected) => ({ slug: expected.slug, missing: 'generated program facts' }))

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
  const brochurePath = path.resolve(
    process.env.YIU_BROCHURE_VERIFIED_PATH?.trim() || DEFAULT_BROCHURE
  )
  const [packMarkdown, brochureMarkdown] = await Promise.all([
    readFile(packPath, 'utf8'),
    readFile(brochurePath, 'utf8'),
  ])
  const audit = auditYiuIntentSkillPack(packMarkdown, brochureMarkdown)
  console.log(JSON.stringify(audit, null, 2))
  if (
    audit.intentCount < 65 ||
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
