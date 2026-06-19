import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { createClient } from '@supabase/supabase-js'

import { buildSkillEmbeddingTexts } from '@/lib/skills/embeddings'

import { buildYiuActiveIntentUnion } from './push-yiu-intent-skill-pack'
import { buildYiuProgramFactIntents } from './yiu-program-fact-skills'

const DEMO_SLUG = process.env.PUBLIC_DEMO_SLUG?.trim() || 'yiu-tanitim-gunleri-2026'
const BASE_PACK = 'docs/evaluations/yiu-intent-skill-pack-v2-2026-06-13.md'
const BROCHURE = 'src/lib/knowledge-base/provider-data/yiu-2025-brochure-verified.md'
const PREFIX = 'YİÜ Intent - '

function parseEnvValue(value: string) {
  const trimmed = value.trim()
  return ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ? trimmed.slice(1, -1)
    : trimmed
}

async function loadProjectEnv() {
  for (const filename of ['.env', '.env.local']) {
    const content = await readFile(path.join(process.cwd(), filename), 'utf8').catch(() => '')
    for (const line of content.split(/\r?\n/u)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separator = trimmed.indexOf('=')
      if (separator < 1) continue
      const key = trimmed.slice(0, separator).trim()
      if (!process.env[key]) process.env[key] = parseEnvValue(trimmed.slice(separator + 1))
    }
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

async function main() {
  await loadProjectEnv()
  const [baseMarkdown, brochureMarkdown] = await Promise.all([
    readFile(path.resolve(BASE_PACK), 'utf8'),
    readFile(path.resolve(BROCHURE), 'utf8'),
  ])
  const expected = buildYiuActiveIntentUnion(baseMarkdown, brochureMarkdown)
  const expectedPrograms = buildYiuProgramFactIntents(brochureMarkdown)
  const client = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: channel, error: channelError } = await client
    .from('demo_chat_channels')
    .select('organization_id')
    .eq('slug', DEMO_SLUG)
    .single()
  if (channelError || !channel?.organization_id) {
    throw new Error(channelError?.message ?? `Demo channel ${DEMO_SLUG} not found`)
  }

  const { data: skills, error: skillsError } = await client
    .from('skills')
    .select('id, title, trigger_examples, response_text, routing_description, coverage_facets, enabled')
    .eq('organization_id', channel.organization_id)
    .like('title', `${PREFIX}%`)
  if (skillsError) throw new Error(skillsError.message)

  const expectedByTitle = new Map(expected.map((intent) => [intent.title, intent]))
  const active = (skills ?? []).filter((skill) => skill.enabled)
  const activeByTitle = new Map(active.map((skill) => [skill.title, skill]))
  const mismatches = expected.flatMap((intent) => {
    const row = activeByTitle.get(intent.title)
    if (!row) return [`missing:${intent.title}`]
    if (row.response_text !== intent.responseText) return [`response:${intent.title}`]
    if (row.routing_description !== intent.routingDescription) {
      return [`routing_description:${intent.title}`]
    }
    if (JSON.stringify(row.coverage_facets ?? []) !== JSON.stringify(intent.coverageFacets)) {
      return [`coverage_facets:${intent.title}`]
    }
    if (JSON.stringify(row.trigger_examples) !== JSON.stringify(intent.triggerExamples)) {
      return [`triggers:${intent.title}`]
    }
    return []
  })
  const unexpectedActive = active
    .filter((skill) => !expectedByTitle.has(skill.title))
    .map((skill) => skill.title)

  const activeIds = active.map((skill) => skill.id)
  const { count: embeddingCount, error: embeddingError } = await client
    .from('skill_embeddings')
    .select('id', { count: 'exact', head: true })
    .in('skill_id', activeIds)
  if (embeddingError) throw new Error(embeddingError.message)

  const expectedEmbeddingCount = expected.reduce(
    (sum, intent) => sum + buildSkillEmbeddingTexts(
      intent.title,
      intent.triggerExamples,
      intent.responseText,
      intent.routingDescription,
      intent.coverageFacets
    ).length,
    0
  )
  const result = {
    demoSlug: DEMO_SLUG,
    activeSkills: active.length,
    verifiedPrograms: expectedPrograms.filter((intent) => activeByTitle.has(intent.title)).length,
    activeEmbeddings: embeddingCount ?? 0,
    expectedEmbeddings: expectedEmbeddingCount,
    mismatches,
    unexpectedActive,
  }
  console.log(JSON.stringify(result, null, 2))

  if (
    active.length !== expected.length ||
    result.verifiedPrograms !== expectedPrograms.length ||
    result.activeEmbeddings !== expectedEmbeddingCount ||
    mismatches.length > 0 ||
    unexpectedActive.length > 0
  ) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
