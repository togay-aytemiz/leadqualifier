import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  buildYiuProgramFactIntents,
  renderYiuProgramFactSkillPack,
} from './yiu-program-fact-skills'

const sourcePath = path.resolve(
  process.cwd(),
  'src/lib/knowledge-base/provider-data/yiu-2025-brochure-verified.md'
)
const outputPath = path.resolve(
  process.cwd(),
  'docs/evaluations/yiu-program-fact-skill-pack-2026-06-18.md'
)

async function main() {
  const intents = buildYiuProgramFactIntents(await readFile(sourcePath, 'utf8'))
  await writeFile(outputPath, renderYiuProgramFactSkillPack(intents), 'utf8')
  console.log(`Generated ${intents.length} program Skills at ${outputPath}`)
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
