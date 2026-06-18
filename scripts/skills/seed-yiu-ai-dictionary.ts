import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { createClient } from '@supabase/supabase-js'

import { sanitizeAiDictionaryEntries, type AiDictionaryDraftEntry } from '@/lib/ai/dictionary-core'

const DEFAULT_DEMO_SLUG = 'yiu-tanitim-gunleri-2026'

export const YIU_AI_DICTIONARY_ENTRIES: AiDictionaryDraftEntry[] = [
  { term: 'YİÜ', meanings: ['Yüksek İhtisas Üniversitesi'], enabled: true },
  { term: 'YIU', meanings: ['Yüksek İhtisas Üniversitesi'], enabled: true },
  { term: 'Yüksek İhtisas', meanings: ['Yüksek İhtisas Üniversitesi'], enabled: true },
  { term: 'tip', meanings: ['Tıp Fakültesi'], enabled: true },
  { term: 'tıp tr', meanings: ['Tıp Fakültesi (Türkçe)'], enabled: true },
  { term: 'tip tr', meanings: ['Tıp Fakültesi (Türkçe)'], enabled: true },
  { term: 'tıp ing', meanings: ['Tıp Fakültesi (İngilizce)'], enabled: true },
  { term: 'tip ing', meanings: ['Tıp Fakültesi (İngilizce)'], enabled: true },
  { term: 'FTR', meanings: ['Fizyoterapi ve Rehabilitasyon'], enabled: true },
  { term: 'FZT', meanings: ['Fizyoterapi ön lisans programı'], enabled: true },
  { term: 'DKT', meanings: ['Dil ve Konuşma Terapisi'], enabled: true },
  { term: 'TLT', meanings: ['Tıbbi Laboratuvar Teknikleri'], enabled: true },
  { term: 'tıbbi lab', meanings: ['Tıbbi Laboratuvar Teknikleri'], enabled: true },
  { term: 'laboratuvar teknikerliği', meanings: ['Tıbbi Laboratuvar Teknikleri'], enabled: true },
  { term: 'TDS', meanings: ['Tıbbi Dokümantasyon ve Sekreterlik'], enabled: true },
  { term: 'TTP', meanings: ['Tıbbi Tanıtım ve Pazarlama'], enabled: true },
  { term: 'TVİT', meanings: ['Tıbbi Veri İşleme Teknikerliği'], enabled: true },
  { term: 'TST', meanings: ['Tele-Sağlık Teknikerliği'], enabled: true },
  { term: 'BCT', meanings: ['Biyomedikal Cihaz Teknolojisi'], enabled: true },
  { term: 'İAY', meanings: ['İlk ve Acil Yardım'], enabled: true },
  { term: 'paramedik', meanings: ['İlk ve Acil Yardım'], enabled: true },
  { term: 'SHMYO', meanings: ['Sağlık Hizmetleri Meslek Yüksekokulu'], enabled: true },
  { term: 'SMYO', meanings: ['Sağlık Hizmetleri Meslek Yüksekokulu'], enabled: true },
  { term: 'MYO', meanings: ['Meslek Yüksekokulu'], enabled: true },
  { term: 'SBF', meanings: ['Sağlık Bilimleri Fakültesi', 'Spor Bilimleri Fakültesi'], enabled: true },
  { term: 'ÇAP', meanings: ['Çift Anadal Programı'], enabled: true },
  { term: 'CAP', meanings: ['Çift Anadal Programı'], enabled: true },
  { term: 'YKS', meanings: ['Yükseköğretim Kurumları Sınavı'], enabled: true },
  { term: 'ÖSYM', meanings: ['Ölçme, Seçme ve Yerleştirme Merkezi'], enabled: true },
  { term: 'OSYM', meanings: ['Ölçme, Seçme ve Yerleştirme Merkezi'], enabled: true },
  { term: 'ÖSYS', meanings: ['Öğrenci Seçme ve Yerleştirme Sistemi'], enabled: true },
  { term: 'OSYS', meanings: ['Öğrenci Seçme ve Yerleştirme Sistemi'], enabled: true },
  { term: 'DGS', meanings: ['Dikey Geçiş Sınavı'], enabled: true },
  { term: 'SAY', meanings: ['SAY puan türü'], enabled: true },
  { term: 'EA', meanings: ['EA puan türü'], enabled: true },
  { term: 'TYT', meanings: ['TYT puan türü'], enabled: true },
  { term: 'intörn', meanings: ['Dönem VI intörn hekimlik'], enabled: true },
  { term: 'intorn', meanings: ['Dönem VI intörn hekimlik'], enabled: true },
]

function parseEnvValue(value: string) {
  const trimmed = value.trim()
  return ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ? trimmed.slice(1, -1)
    : trimmed
}

async function loadProjectEnv() {
  for (const filename of ['.env', '.env.local', '.env.development.local']) {
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

export async function seedYiuAiDictionary(options: {
  dryRun?: boolean
  demoSlug?: string
} = {}) {
  await loadProjectEnv()

  const demoSlug = options.demoSlug ?? process.env.PUBLIC_DEMO_SLUG?.trim() ?? DEFAULT_DEMO_SLUG
  const entries = sanitizeAiDictionaryEntries(YIU_AI_DICTIONARY_ENTRIES)

  if (options.dryRun) {
    return {
      dryRun: true,
      demoSlug,
      organizationId: null,
      entryCount: entries.length,
      terms: entries.map((entry) => entry.normalized_term),
    }
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
    throw new Error(`Could not resolve demo channel ${demoSlug}: ${channelError?.message ?? 'missing row'}`)
  }

  if (entries.length > 0) {
    const { error: upsertError } = await supabase
      .from('organization_ai_dictionary_entries')
      .upsert(
        entries.map((entry) => ({
          organization_id: channel.organization_id,
          ...entry,
        })),
        { onConflict: 'organization_id,normalized_term' }
      )

    if (upsertError) {
      throw new Error(`Failed to seed YIU AI dictionary: ${upsertError.message}`)
    }
  }

  return {
    dryRun: false,
    demoSlug,
    organizationId: channel.organization_id as string,
    entryCount: entries.length,
    terms: entries.map((entry) => entry.normalized_term),
  }
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const result = await seedYiuAiDictionary({
    dryRun: args.has('--dry-run'),
  })

  console.log(JSON.stringify(result, null, 2))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
