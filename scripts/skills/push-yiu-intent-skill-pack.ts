import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { createClient } from '@supabase/supabase-js'

import { generateEmbeddings, formatEmbeddingForPgvector } from '@/lib/ai/embeddings'
import { buildSkillEmbeddingTexts } from '@/lib/skills/embeddings'

import { buildYiuProgramFactIntents, PROGRAM_REPLACED_BASE_SLUGS } from './yiu-program-fact-skills'

export type ParsedIntent = {
  order: string
  slug: string
  title: string
  triggerExamples: string[]
  routingDescription: string
  coverageFacets: string[]
  responseText: string
}

type SkillRow = {
  id: string
  title: string
  trigger_examples: string[]
  response_text: string
  routing_description: string
  coverage_facets: string[]
  enabled: boolean
  requires_human_handover: boolean
}

const DEFAULT_DRAFT_PATH = 'docs/evaluations/yiu-intent-skill-pack-v2-2026-06-13.md'
const DEFAULT_BROCHURE_PATH = 'src/lib/knowledge-base/provider-data/yiu-2025-brochure-verified.md'
const DEFAULT_DEMO_SLUG = 'yiu-tanitim-gunleri-2026'
const SKILL_TITLE_PREFIX = 'YİÜ Intent - '
const EMBEDDING_BATCH_SIZE = 128
const EMBEDDING_INSERT_BATCH_SIZE = 40
const TRANSIENT_RETRY_DELAYS_MS = [1000, 2500, 5000]

export function chunkItems<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error('Chunk size must be a positive integer')
  }

  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function parseEnvValue(value: string) {
  const trimmed = value.trim()
  return (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ? trimmed.slice(1, -1)
    : trimmed
}

async function loadProjectEnv() {
  for (const filename of ['.env', '.env.local']) {
    const content = await readFile(path.join(process.cwd(), filename), 'utf8').catch(() => '')
    for (const line of content.split(/\r?\n/)) {
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

function extractBlock(section: string, startLabel: string, endLabel: string) {
  const start = section.indexOf(startLabel)
  if (start < 0) return ''
  const afterStart = section.slice(start + startLabel.length)
  const end = afterStart.indexOf(endLabel)
  return (end >= 0 ? afterStart.slice(0, end) : afterStart).trim()
}

const FACET_KEYWORDS: Array<[string, RegExp]> = [
  ['identity', /\b(kimsin|bot|asistan|chatgpt|kimlik|görev)\b/iu],
  ['program_existence', /\b(var mı|bölüm|program|fakülte|myo|yüksekokul)\b/iu],
  ['program_overview', /\b(nedir|tanıt|hakkında|nasıl bir)\b/iu],
  ['academic_unit', /\b(akademik birim|fakülte|yüksekokul|myo|bünyesinde)\b/iu],
  ['degree_level', /\b(lisans|ön lisans|kaç yıllık|süre)\b/iu],
  ['fee', /\b(ücret|fiyat|para|tl|ödeme)\b/iu],
  ['quota', /\b(kontenjan|kaç kişi)\b/iu],
  ['scholarship', /\b(burs|burslu|indirim|%50|yüzde 50)\b/iu],
  ['base_score', /\b(taban puan|puanı|puan türü)\b/iu],
  ['success_rank', /\b(başarı sırası|sıralama|sırası)\b/iu],
  ['campus', /\b(kampüs|yerleşke|adres|nerede|ulaşım)\b/iu],
  ['registration', /\b(kayıt|admission|başvuru|tercih)\b/iu],
  ['document_policy', /\b(yönerge|yönetmelik|mevzuat|belge|dilekçe)\b/iu],
  ['education_model', /\b(eğitim modeli|müfredat|ders|klinik|uygulama|laboratuvar|kadavra|staj)\b/iu],
  ['contact', /\b(telefon|e-?posta|mail|iletişim)\b/iu],
  ['boundary', /\b(kapsam dışı|insan desteği|şikayet|acil|gizlilik)\b/iu],
]

function buildCoverageFacets(slug: string, triggerExamples: string[], responseText: string) {
  const haystack = [slug.replace(/_/g, ' '), ...triggerExamples, responseText].join('\n')
  const facets = FACET_KEYWORDS
    .filter(([, pattern]) => pattern.test(haystack))
    .map(([facet]) => facet)

  return [...new Set(facets.length > 0 ? facets : ['general_info'])]
}

function buildRoutingDescription(input: {
  slug: string
  title: string
  goal: string
  triggerExamples: string[]
  responseText: string
}) {
  const sampleQuestions = input.triggerExamples.slice(0, 6).join(' | ')
  const responsePreview = input.responseText.replace(/\s+/g, ' ').trim().slice(0, 520)
  const goal = input.goal.replace(/\s+/g, ' ').trim()
  return [
    `${input.title} Skill kapsamı.`,
    goal || 'Bu intent, kullanıcı sorusunu hazır YİÜ aday öğrenci cevabına yönlendirmek için kullanılır.',
    `Tipik sorular: ${sampleQuestions}.`,
    `Yanıtın kapsadığı bilgi: ${responsePreview}`,
  ].join(' ').replace(/\s+/g, ' ').trim()
}

export function parseIntentPack(markdown: string): ParsedIntent[] {
  const sections = markdown.split(/\n---\n/g).filter((section) => /^## \d{2}\. /m.test(section))

  return sections.map((section) => {
    const heading = section.match(/^## (\d{2})\. ([^\n]+)$/m)
    if (!heading) {
      throw new Error(`Could not parse intent heading: ${section.slice(0, 80)}`)
    }
    const [, order, slug] = heading
    if (!order || !slug) {
      throw new Error(`Could not parse intent heading values: ${section.slice(0, 80)}`)
    }
    const trimmedSlug = slug.trim()

    const goal = extractBlock(section, 'Amaç:', '\n\nKullanıcı örnekleri:')
    const examplesBlock = extractBlock(section, 'Kullanıcı örnekleri:', '\n\nInstructed cevap:')
    const triggerExamples = examplesBlock
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim())
      .filter(Boolean)

    const responseText = extractBlock(section, 'Instructed cevap:', '\n\nKaynak notu:')

    if (triggerExamples.length < 5) {
      throw new Error(`${order}.${trimmedSlug} has fewer than 5 examples`)
    }
    if (!responseText) {
      throw new Error(`${order}.${trimmedSlug} is missing response text`)
    }

    return {
      order,
      slug: trimmedSlug,
      title: `${SKILL_TITLE_PREFIX}${order} ${trimmedSlug}`,
      triggerExamples,
      routingDescription: buildRoutingDescription({
        slug: trimmedSlug,
        title: `${SKILL_TITLE_PREFIX}${order} ${trimmedSlug}`,
        goal,
        triggerExamples,
        responseText,
      }),
      coverageFacets: buildCoverageFacets(trimmedSlug, triggerExamples, responseText),
      responseText,
    }
  })
}

export function buildYiuActiveIntentUnion(baseMarkdown: string, brochureMarkdown: string) {
  const replacedSlugs = new Set<string>(PROGRAM_REPLACED_BASE_SLUGS)
  const programIntents = buildYiuProgramFactIntents(brochureMarkdown)
  const programTriggers = new Set(
    programIntents.flatMap((intent) =>
      intent.triggerExamples.map((trigger) =>
        trigger.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR')
      )
    )
  )
  const generalIntents = parseIntentPack(baseMarkdown)
    .filter((intent) => !replacedSlugs.has(intent.slug))
    .map((intent) => ({
      ...intent,
      triggerExamples: intent.triggerExamples.filter(
        (trigger) =>
          !programTriggers.has(
            trigger.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR')
          )
      ),
    }))
  const intents = [...generalIntents, ...programIntents].sort(
    (left, right) => Number(left.order) - Number(right.order)
  )

  const titles = new Set(intents.map((intent) => intent.title))
  if (titles.size !== intents.length) {
    throw new Error('YIU active Skill union contains duplicate titles')
  }
  return intents
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

async function retryTransient<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= TRANSIENT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      const delay = TRANSIENT_RETRY_DELAYS_MS[attempt]
      if (!delay) break
      console.warn(
        `${label} failed, retrying in ${delay}ms: ${error instanceof Error ? error.message : String(error)}`
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

function skillNeedsUpdate(existing: SkillRow | undefined, intent: ParsedIntent) {
  if (!existing) return true
  return (
    existing.response_text !== intent.responseText ||
    existing.routing_description !== intent.routingDescription ||
    !arraysEqual(existing.coverage_facets ?? [], intent.coverageFacets) ||
    !arraysEqual(existing.trigger_examples ?? [], intent.triggerExamples) ||
    existing.enabled !== true ||
    existing.requires_human_handover !== false
  )
}

async function main() {
  await loadProjectEnv()

  const args = new Set(process.argv.slice(2))
  const dryRun = args.has('--dry-run')
  const draftPath = process.env.YIU_INTENT_PACK_PATH?.trim() || DEFAULT_DRAFT_PATH
  const brochurePath = process.env.YIU_BROCHURE_VERIFIED_PATH?.trim() || DEFAULT_BROCHURE_PATH
  const demoSlug = process.env.PUBLIC_DEMO_SLUG?.trim() || DEFAULT_DEMO_SLUG
  const [markdown, brochureMarkdown] = await Promise.all([
    readFile(path.resolve(process.cwd(), draftPath), 'utf8'),
    readFile(path.resolve(process.cwd(), brochurePath), 'utf8'),
  ])
  const intents = buildYiuActiveIntentUnion(markdown, brochureMarkdown)

  if (intents.length < 65) {
    throw new Error(`Expected at least 65 active intents, parsed ${intents.length}`)
  }

  if (dryRun) {
    console.log(`DRY_RUN intents=${intents.length} draft=${draftPath} brochure=${brochurePath}`)
    for (const intent of intents.slice(0, 5)) {
      console.log(`${intent.title} examples=${intent.triggerExamples.length}`)
    }
    return
  }

  const supabase = createClient(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: channel, error: channelError } = await supabase
    .from('demo_chat_channels')
    .select('organization_id, display_name, slug')
    .eq('slug', demoSlug)
    .single()

  if (channelError || !channel?.organization_id) {
    throw new Error(
      `Could not resolve demo channel ${demoSlug}: ${channelError?.message ?? 'missing row'}`
    )
  }

  const titles = intents.map((intent) => intent.title)
  const { data: existingSkills, error: existingError } = await supabase
    .from('skills')
    .select('id, title, trigger_examples, response_text, routing_description, coverage_facets, enabled, requires_human_handover')
    .eq('organization_id', channel.organization_id)
    .like('title', `${SKILL_TITLE_PREFIX}%`)

  if (existingError) throw new Error(existingError.message)

  const existingByTitle = new Map(
    ((existingSkills ?? []) as SkillRow[]).map((skill) => [skill.title, skill])
  )
  const staleSkills = ((existingSkills ?? []) as SkillRow[]).filter(
    (skill) => skill.enabled && !titles.includes(skill.title)
  )
  const touchedSkills: Array<{
    id: string
    title: string
    triggerExamples: string[]
    responseText: string
    routingDescription: string
    coverageFacets: string[]
  }> = []
  let inserted = 0
  let updated = 0
  let unchanged = 0
  let disabledStale = 0

  if (staleSkills.length > 0) {
    const { error } = await supabase
      .from('skills')
      .update({ enabled: false })
      .in(
        'id',
        staleSkills.map((skill) => skill.id)
      )

    if (error) {
      throw new Error(`Failed to disable stale YIU intent skills: ${error.message}`)
    }
    disabledStale = staleSkills.length
  }

  for (const intent of intents) {
    const existing = existingByTitle.get(intent.title)
    if (!skillNeedsUpdate(existing, intent)) {
      unchanged += 1
      touchedSkills.push({
        id: existing!.id,
        title: intent.title,
        triggerExamples: intent.triggerExamples,
        routingDescription: intent.routingDescription,
        coverageFacets: intent.coverageFacets,
        responseText: intent.responseText,
      })
      continue
    }

    if (existing) {
      const { data, error } = await supabase
        .from('skills')
        .update({
          trigger_examples: intent.triggerExamples,
          response_text: intent.responseText,
          routing_description: intent.routingDescription,
          coverage_facets: intent.coverageFacets,
          enabled: true,
          requires_human_handover: false,
          skill_actions: [],
        })
        .eq('id', existing.id)
        .select('id')
        .single()

      if (error || !data?.id) {
        throw new Error(`Failed to update ${intent.title}: ${error?.message ?? 'missing id'}`)
      }
      updated += 1
      touchedSkills.push({
        id: data.id,
        title: intent.title,
        triggerExamples: intent.triggerExamples,
        routingDescription: intent.routingDescription,
        coverageFacets: intent.coverageFacets,
        responseText: intent.responseText,
      })
      continue
    }

    const { data, error } = await supabase
      .from('skills')
      .insert({
        organization_id: channel.organization_id,
        title: intent.title,
        trigger_examples: intent.triggerExamples,
        routing_description: intent.routingDescription,
        coverage_facets: intent.coverageFacets,
        response_text: intent.responseText,
        enabled: true,
        requires_human_handover: false,
        skill_actions: [],
      })
      .select('id')
      .single()

    if (error || !data?.id) {
      throw new Error(`Failed to insert ${intent.title}: ${error?.message ?? 'missing id'}`)
    }
    inserted += 1
    touchedSkills.push({
      id: data.id,
      title: intent.title,
      triggerExamples: intent.triggerExamples,
      routingDescription: intent.routingDescription,
      coverageFacets: intent.coverageFacets,
      responseText: intent.responseText,
    })
  }

  const touchedIds = touchedSkills.map((skill) => skill.id)
  const { error: deleteEmbeddingError } = await supabase
    .from('skill_embeddings')
    .delete()
    .in('skill_id', touchedIds)

  if (deleteEmbeddingError) {
    throw new Error(`Failed to clear existing embeddings: ${deleteEmbeddingError.message}`)
  }

  const embeddingInputs = touchedSkills.flatMap((skill) =>
    buildSkillEmbeddingTexts(
      skill.title,
      skill.triggerExamples,
      skill.responseText,
      skill.routingDescription,
      skill.coverageFacets
    ).map(
      (text) => ({
        skillId: skill.id,
        triggerText: text,
      })
    )
  )

  let embeddingRows: Array<{ skill_id: string; trigger_text: string; embedding: string }> = []

  for (let index = 0; index < embeddingInputs.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = embeddingInputs.slice(index, index + EMBEDDING_BATCH_SIZE)
    const batchNumber = Math.floor(index / EMBEDDING_BATCH_SIZE) + 1
    const embeddings = await retryTransient(`embedding generation batch ${batchNumber}`, () =>
      generateEmbeddings(
        batch.map((input) => input.triggerText),
        {
          organizationId: channel.organization_id,
          supabase: supabase as never,
          usageMetadata: {
            source: 'yiu_intent_skill_pack_push',
            demo_slug: demoSlug,
          },
        }
      )
    )

    embeddingRows = embeddingRows.concat(
      batch.map((input, batchIndex) => ({
        skill_id: input.skillId,
        trigger_text: input.triggerText,
        embedding: formatEmbeddingForPgvector(embeddings[batchIndex] ?? []),
      }))
    )
  }

  for (const [batchIndex, rows] of chunkItems(
    embeddingRows,
    EMBEDDING_INSERT_BATCH_SIZE
  ).entries()) {
    const insertResult = await retryTransient(
      `embedding insert batch ${batchIndex + 1}`,
      async () => {
        const { error } = await supabase.from('skill_embeddings').insert(rows)
        return { error }
      }
    )
    const insertEmbeddingError = insertResult.error

    if (insertEmbeddingError) {
      throw new Error(
        `Failed to insert embedding batch ${batchIndex + 1}: ${insertEmbeddingError.message}`
      )
    }
  }

  const { count: skillCount, error: verifySkillError } = await supabase
    .from('skills')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', channel.organization_id)
    .eq('enabled', true)
    .like('title', `${SKILL_TITLE_PREFIX}%`)

  if (verifySkillError) throw new Error(verifySkillError.message)

  const { count: embeddingCount, error: verifyEmbeddingError } = await supabase
    .from('skill_embeddings')
    .select('id', { count: 'exact', head: true })
    .in('skill_id', touchedIds)

  if (verifyEmbeddingError) throw new Error(verifyEmbeddingError.message)

  console.log(
    JSON.stringify(
      {
        demoSlug,
        organizationId: channel.organization_id,
        displayName: channel.display_name,
        parsed: intents.length,
        inserted,
        updated,
        unchanged,
        disabledStale,
        yiuIntentSkillCount: skillCount ?? 0,
        refreshedEmbeddingRows: embeddingCount ?? 0,
      },
      null,
      2
    )
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
