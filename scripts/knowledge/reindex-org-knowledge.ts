#!/usr/bin/env tsx

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

import { rebuildKnowledgeDocumentChunks } from '@/lib/knowledge-base/actions'

interface ReindexArgs {
    organizationId?: string
    source?: string
    collectionName?: string
    status?: string
    dryRun: boolean
    limit?: number
    pageSize: number
}

interface KnowledgeDocumentSummary {
    id: string
    title: string | null
    source: string | null
    status: string | null
    collection_id: string | null
}

function parseArgs(argv: string[]): ReindexArgs {
    const args: ReindexArgs = {
        dryRun: false,
        pageSize: 100
    }

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]

        if (arg === '--org-id') {
            args.organizationId = argv[index + 1]
            index += 1
            continue
        }
        if (arg === '--source') {
            args.source = argv[index + 1]
            index += 1
            continue
        }
        if (arg === '--collection-name') {
            args.collectionName = argv[index + 1]
            index += 1
            continue
        }
        if (arg === '--status') {
            args.status = argv[index + 1]
            index += 1
            continue
        }
        if (arg === '--limit') {
            args.limit = Number(argv[index + 1])
            index += 1
            continue
        }
        if (arg === '--page-size') {
            const pageSize = Number(argv[index + 1])
            args.pageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 500) : args.pageSize
            index += 1
            continue
        }
        if (arg === '--dry-run') {
            args.dryRun = true
        }
    }

    args.organizationId = args.organizationId?.trim() || process.env.QA_ORG_ID?.trim()
    args.source = args.source?.trim() || undefined
    args.collectionName = args.collectionName?.trim() || undefined
    args.status = args.status?.trim() || undefined

    return args
}

function printUsage() {
    console.log(`Usage:
  npx tsx scripts/knowledge/reindex-org-knowledge.ts --org-id <organization-id> --dry-run
  npx tsx scripts/knowledge/reindex-org-knowledge.ts --org-id <organization-id> --source website_crawl
  npx tsx scripts/knowledge/reindex-org-knowledge.ts --org-id <organization-id> --collection-name "Website Crawl - example.edu.tr"

Options:
  --org-id           Target organization id. Defaults to QA_ORG_ID when set.
  --source           Optional knowledge_documents.source filter.
  --collection-name  Optional Knowledge collection name filter.
  --status           Optional knowledge_documents.status filter.
  --limit            Optional maximum number of documents to rebuild.
  --page-size        Optional read page size, max 500, default 100.
  --dry-run          Print matching documents without deleting/rebuilding chunks.`)
}

function parseEnvValue(value: string) {
    const trimmed = value.trim()
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1)
    }

    return trimmed
}

async function loadEnvFile(filePath: string, protectedKeys: Set<string>) {
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
        if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
    }
}

async function loadProjectEnv(projectDir: string) {
    const protectedKeys = new Set(Object.keys(process.env))
    await loadEnvFile(path.join(projectDir, '.env'), protectedKeys)
    await loadEnvFile(path.join(projectDir, '.env.local'), protectedKeys)
    await loadEnvFile(path.join(projectDir, '.env.development.local'), protectedKeys)
}

function requireEnv(name: string) {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`${name} environment variable is required`)
    return value
}

function createSupabaseServiceClient() {
    return createClient(
        requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    )
}

async function resolveCollectionId(
    supabase: ReturnType<typeof createSupabaseServiceClient>,
    organizationId: string,
    collectionName?: string
) {
    if (!collectionName) return null

    const { data, error } = await supabase
        .from('knowledge_collections')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('name', collectionName)
        .maybeSingle()

    if (error) throw new Error(`Failed to resolve collection "${collectionName}": ${error.message}`)
    if (!data?.id) throw new Error(`Collection not found for organization ${organizationId}: ${collectionName}`)

    return data.id as string
}

async function listDocuments(
    supabase: ReturnType<typeof createSupabaseServiceClient>,
    args: ReindexArgs,
    collectionId: string | null
) {
    if (!args.organizationId) throw new Error('organizationId is required')

    const documents: KnowledgeDocumentSummary[] = []
    const pageSize = args.pageSize
    let offset = 0

    while (args.limit === undefined || documents.length < args.limit) {
        const remaining = args.limit === undefined ? pageSize : Math.min(pageSize, args.limit - documents.length)
        if (remaining <= 0) break

        let query = supabase
            .from('knowledge_documents')
            .select('id, title, source, status, collection_id')
            .eq('organization_id', args.organizationId)
            .order('created_at', { ascending: true })
            .range(offset, offset + remaining - 1)

        if (args.source) query = query.eq('source', args.source)
        if (args.status) query = query.eq('status', args.status)
        if (collectionId) query = query.eq('collection_id', collectionId)

        const { data, error } = await query
        if (error) throw new Error(`Failed to list knowledge documents: ${error.message}`)
        if (!data || data.length === 0) break

        documents.push(...data as KnowledgeDocumentSummary[])
        if (data.length < remaining) break
        offset += data.length
    }

    return documents
}

async function main() {
    const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
    await loadProjectEnv(projectDir)

    const args = parseArgs(process.argv.slice(2))
    if (!args.organizationId) {
        printUsage()
        process.exitCode = 1
        return
    }

    const supabase = createSupabaseServiceClient()
    const collectionId = await resolveCollectionId(supabase, args.organizationId, args.collectionName)
    const documents = await listDocuments(supabase, args, collectionId)

    console.log(`Organization: ${args.organizationId}`)
    if (args.source) console.log(`Source filter: ${args.source}`)
    if (args.collectionName) console.log(`Collection filter: ${args.collectionName}`)
    if (args.status) console.log(`Status filter: ${args.status}`)
    console.log(`Matched documents: ${documents.length}`)

    if (args.dryRun) {
        for (const document of documents.slice(0, 20)) {
            console.log(`- ${document.id} | ${document.status ?? '-'} | ${document.source ?? '-'} | ${document.title ?? '(untitled)'}`)
        }
        if (documents.length > 20) console.log(`... ${documents.length - 20} more`)
        return
    }

    let rebuilt = 0
    let chunks = 0
    const failures: Array<{ id: string; title: string | null; error: string }> = []

    for (const [index, document] of documents.entries()) {
        try {
            const result = await rebuildKnowledgeDocumentChunks(document.id, supabase)
            rebuilt += 1
            chunks += result.chunkCount
            console.log(`[${index + 1}/${documents.length}] rebuilt ${result.chunkCount} chunks | ${document.title ?? document.id}`)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            failures.push({ id: document.id, title: document.title, error: message })
            console.error(`[${index + 1}/${documents.length}] failed | ${document.title ?? document.id}: ${message}`)
        }
    }

    console.log(`Rebuilt documents: ${rebuilt}`)
    console.log(`Inserted chunks: ${chunks}`)
    console.log(`Failures: ${failures.length}`)

    if (failures.length > 0) {
        process.exitCode = 1
    }
}

main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
