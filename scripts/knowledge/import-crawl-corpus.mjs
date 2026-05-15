#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

import {
    buildDryRunReport,
    createSupabaseImportRepository,
    estimateTokenCount,
    importCrawlCorpus,
    writeImportReport
} from './crawl-corpus-importer.mjs'

function parseArgs(argv) {
    const args = {
        dryRun: false
    }

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]

        if (arg === '--dry-run') {
            args.dryRun = true
            continue
        }

        if (arg === '--crawl-output') {
            args.crawlOutputDir = argv[index + 1]
            index += 1
            continue
        }

        if (arg === '--max-pages') {
            args.maxPages = Number(argv[index + 1])
            index += 1
            continue
        }

        if (arg === '--max-tokens') {
            args.maxTokens = Number(argv[index + 1])
            index += 1
            continue
        }

        if (arg === '--overlap-tokens') {
            args.overlapTokens = Number(argv[index + 1])
            index += 1
            continue
        }

        if (arg === '--report-out') {
            args.reportOut = argv[index + 1]
            index += 1
            continue
        }

        if (arg === '--org-id') {
            args.organizationId = argv[index + 1]
            index += 1
            continue
        }

        if (arg === '--collection-name') {
            args.collectionName = argv[index + 1]
            index += 1
            continue
        }

        if (arg === '--language') {
            args.language = argv[index + 1]
            index += 1
            continue
        }

        if (arg === '--batch-size') {
            args.batchSize = Number(argv[index + 1])
            index += 1
            continue
        }

        if (arg === '--embedding-batch-size') {
            args.embeddingBatchSize = Number(argv[index + 1])
            index += 1
            continue
        }

        if (arg === '--replace') {
            args.replace = true
            continue
        }

        if (arg === '--skip-usage') {
            args.skipUsage = true
        }
    }

    return args
}

function printUsage() {
    console.log(`Usage:
  npm run knowledge:import-crawl -- --crawl-output tmp/crawl-output/yuksek-ihtisas --dry-run
  npm run knowledge:import-crawl -- --crawl-output tmp/crawl-output/yuksek-ihtisas --org-id <organization-id>

Options:
  --crawl-output      Copied crawler output folder
  --dry-run           Build chunks and report without database writes
  --max-pages         Optional page limit for sampling
  --max-tokens        Optional chunk token target, default 650
  --overlap-tokens    Optional chunk overlap, default 100
  --report-out        Optional report markdown path
  --org-id            Target organization id for real Supabase import
  --collection-name   Optional Knowledge folder name
  --language          Optional document language, for example tr
  --replace           Delete previous documents in the same crawl collection before importing
  --batch-size        Optional page insert batch size, default 50
  --embedding-batch-size Optional OpenAI embedding batch size, default 64
  --skip-usage        Do not write embedding usage rows`)
}

function parseEnvValue(value) {
    const trimmed = String(value ?? '').trim()
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
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

async function loadProjectEnv(projectDir) {
    const protectedKeys = new Set(Object.keys(process.env))
    await loadEnvFile(path.join(projectDir, '.env'), protectedKeys)
    await loadEnvFile(path.join(projectDir, '.env.local'), protectedKeys)
    await loadEnvFile(path.join(projectDir, '.env.development.local'), protectedKeys)
}

function requireEnv(name) {
    const value = process.env[name]?.trim()
    if (!value) {
        throw new Error(`${name} environment variable is required`)
    }

    return value
}

function createSupabaseClientFromEnv() {
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

function createOpenAIEmbedder() {
    const openai = new OpenAI({
        apiKey: requireEnv('OPENAI_API_KEY')
    })

    return async function embedTexts(texts) {
        if (texts.length === 0) {
            return {
                embeddings: [],
                promptTokens: 0
            }
        }

        const response = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: texts
        })

        return {
            embeddings: response.data.map((item) => item.embedding),
            promptTokens: response.usage?.prompt_tokens ?? texts.reduce((total, text) => {
                return total + estimateTokenCount(text)
            }, 0)
        }
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
    await loadProjectEnv(projectDir)

    if (!args.crawlOutputDir) {
        printUsage()
        process.exitCode = 1
        return
    }

    const crawlOutputDir = path.resolve(args.crawlOutputDir)
    const reportPath = path.resolve(args.reportOut || path.join(crawlOutputDir, 'rag-import-report.md'))

    const report = args.dryRun
        ? await buildDryRunReport({
            crawlOutputDir,
            maxPages: args.maxPages,
            maxTokens: args.maxTokens,
            overlapTokens: args.overlapTokens
        })
        : await importCrawlCorpus({
            crawlOutputDir,
            organizationId: args.organizationId,
            collectionName: args.collectionName,
            language: args.language,
            replace: args.replace,
            maxPages: args.maxPages,
            maxTokens: args.maxTokens,
            overlapTokens: args.overlapTokens,
            batchSize: args.batchSize,
            embeddingBatchSize: args.embeddingBatchSize,
            skipUsage: args.skipUsage,
            repository: createSupabaseImportRepository(createSupabaseClientFromEnv()),
            embedTexts: createOpenAIEmbedder(),
            onProgress: (progress) => {
                process.stdout.write(
                    `\rImported ${progress.pagesImported}/${progress.totalPages} pages | ${progress.chunksImported}/${progress.totalChunks} chunks`
                )
            }
        })

    if (!args.dryRun) {
        process.stdout.write('\n')
    }

    await writeImportReport(report, reportPath)

    console.log(args.dryRun ? 'Crawl corpus dry-run finished' : 'Crawl corpus import finished')
    console.log(`Report: ${reportPath}`)
    console.log(`Pages read: ${report.pagesRead}`)
    console.log(`Pages with chunks: ${report.pagesWithChunks}`)
    if (!args.dryRun) {
        console.log(`Organization: ${report.organizationId}`)
        console.log(`Collection: ${report.collectionName} (${report.collectionId})`)
        console.log(`Pages imported: ${report.pagesImported}`)
        console.log(`Chunks imported: ${report.chunksImported}`)
    }
    console.log(`Total chunks: ${report.totalChunks}`)
    console.log(`Chunk tokens min/avg/max: ${report.tokenSummary.min}/${report.tokenSummary.avg}/${report.tokenSummary.max}`)
    console.log(`Database writes: ${report.databaseWrites}`)
}

const thisFile = fileURLToPath(import.meta.url)
if (process.argv[1] === thisFile) {
    main().catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
}
