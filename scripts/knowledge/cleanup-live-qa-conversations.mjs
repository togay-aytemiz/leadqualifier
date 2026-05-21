import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

export const QA_TAGS = ['codex_live_qa', 'codex_yiu_demo_qa', 'codex_yiu_mevzuat_qa']
export const QA_CONTACT_NAME_PREFIX = 'Codex YIU Demo QA'
export const QA_MEVZUAT_CONTACT_NAME_PREFIX = 'Codex YIU Mevzuat QA'
export const QA_CONTACT_PHONE_PREFIX = 'codex-live-yiu-demo-qa-'
export const QA_MEVZUAT_CONTACT_PHONE_PREFIX = 'codex-live-yiu-mevzuat-qa-'
export const QA_DEMO_CHAT_CODEX_SESSION_MARKER = ':codex-'
export const QA_CONTACT_NAME_PREFIXES = [
  QA_CONTACT_NAME_PREFIX,
  QA_MEVZUAT_CONTACT_NAME_PREFIX,
  'Codex Live QA',
]
export const QA_CONTACT_PHONE_PREFIXES = [
  QA_CONTACT_PHONE_PREFIX,
  QA_MEVZUAT_CONTACT_PHONE_PREFIX,
  'codex-live-rag-qa-',
]

const DEFAULT_ORG_ID = '37222032-c2e8-4125-a027-be39eb6603f8'

function parseEnvValue(value) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

async function loadEnvFile(filePath, protectedKeys) {
  try {
    const content = await readFile(filePath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const equalsIndex = trimmed.indexOf('=')
      if (equalsIndex === -1) continue

      const key = trimmed.slice(0, equalsIndex).trim()
      const value = parseEnvValue(trimmed.slice(equalsIndex + 1))
      if (!key || protectedKeys.has(key)) continue
      process.env[key] = value
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

async function loadProjectEnv() {
  const protectedKeys = new Set(Object.keys(process.env))
  const cwd = process.cwd()
  await loadEnvFile(path.join(cwd, '.env'), protectedKeys)
  await loadEnvFile(path.join(cwd, '.env.local'), protectedKeys)
  await loadEnvFile(path.join(cwd, '.env.development.local'), protectedKeys)
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function normalizeCleanupArgs(args) {
  const options = {
    execute: false,
    organizationId: process.env.QA_ORG_ID?.trim() || DEFAULT_ORG_ID,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--execute') {
      options.execute = true
      continue
    }
    if (arg === '--org-id') {
      const next = args[index + 1]?.trim()
      if (!next) throw new Error('--org-id requires a value')
      options.organizationId = next
      index += 1
      continue
    }
    if (arg?.startsWith('--org-id=')) {
      options.organizationId = arg.slice('--org-id='.length).trim()
      continue
    }
    if (arg === '--dry-run') {
      options.execute = false
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.organizationId) throw new Error('organization id is required')
  return options
}

export function isLiveQaConversation(conversation) {
  const tags = Array.isArray(conversation.tags) ? conversation.tags : []
  const normalizedTags = tags
    .filter((tag) => typeof tag === 'string')
    .map((tag) => tag.trim().toLowerCase())

  if (QA_TAGS.some((tag) => normalizedTags.includes(tag))) return true

  const contactName =
    typeof conversation.contact_name === 'string' ? conversation.contact_name.trim() : ''
  if (QA_CONTACT_NAME_PREFIXES.some((prefix) => contactName.startsWith(prefix))) return true

  const contactPhone =
    typeof conversation.contact_phone === 'string' ? conversation.contact_phone.trim() : ''
  if (contactPhone.includes(QA_DEMO_CHAT_CODEX_SESSION_MARKER)) return true

  return QA_CONTACT_PHONE_PREFIXES.some((prefix) => contactPhone.startsWith(prefix))
}

async function fetchQaConversations(supabase, organizationId) {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, contact_name, contact_phone, tags, created_at, last_message_at')
    .eq('organization_id', organizationId)
    .or(
      [
        `tags.cs.{${QA_TAGS.join(',')}}`,
        ...QA_CONTACT_NAME_PREFIXES.map((prefix) => `contact_name.ilike.${prefix}%`),
        ...QA_CONTACT_PHONE_PREFIXES.map((prefix) => `contact_phone.ilike.${prefix}%`),
        'contact_phone.ilike.demo:%:codex-%',
      ].join(',')
    )
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data ?? []).filter(isLiveQaConversation)
}

async function deleteConversations(supabase, conversationIds) {
  if (conversationIds.length === 0) return
  const { error } = await supabase.from('conversations').delete().in('id', conversationIds)

  if (error) throw error
}

async function main() {
  await loadProjectEnv()
  const options = normalizeCleanupArgs(process.argv.slice(2))
  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  const conversations = await fetchQaConversations(supabase, options.organizationId)
  const ids = conversations.map((conversation) => conversation.id)

  console.log(`Organization: ${options.organizationId}`)
  console.log(`Matched QA conversations: ${conversations.length}`)
  for (const conversation of conversations) {
    console.log(
      `- ${conversation.id} | ${conversation.contact_name} | ${conversation.contact_phone ?? ''}`
    )
  }

  if (!options.execute) {
    console.log('\nDry run only. Re-run with --execute to delete these QA conversations.')
    return
  }

  await deleteConversations(supabase, ids)
  const remaining = await fetchQaConversations(supabase, options.organizationId)
  console.log(`\nDeleted: ${ids.length}`)
  console.log(`Remaining QA conversations: ${remaining.length}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
