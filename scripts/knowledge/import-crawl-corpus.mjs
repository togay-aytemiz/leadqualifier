#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    buildDryRunReport,
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
        }
    }

    return args
}

function printUsage() {
    console.log(`Usage:
  npm run knowledge:import-crawl -- --crawl-output tmp/crawl-output/yuksek-ihtisas --dry-run

Options:
  --crawl-output      Copied crawler output folder
  --dry-run           Build chunks and report without database writes
  --max-pages         Optional page limit for sampling
  --max-tokens        Optional chunk token target, default 650
  --overlap-tokens    Optional chunk overlap, default 100
  --report-out        Optional report markdown path
  --org-id            Reserved for the real DB import step`)
}

async function main() {
    const args = parseArgs(process.argv.slice(2))

    if (!args.crawlOutputDir) {
        printUsage()
        process.exitCode = 1
        return
    }

    if (!args.dryRun) {
        console.error('For this POC step, run with --dry-run. Real DB import will be added after chunk review.')
        process.exitCode = 1
        return
    }

    const crawlOutputDir = path.resolve(args.crawlOutputDir)
    const reportPath = path.resolve(args.reportOut || path.join(crawlOutputDir, 'rag-import-report.md'))
    const report = await buildDryRunReport({
        crawlOutputDir,
        maxPages: args.maxPages,
        maxTokens: args.maxTokens,
        overlapTokens: args.overlapTokens
    })

    await writeImportReport(report, reportPath)

    console.log('Crawl corpus dry-run finished')
    console.log(`Report: ${reportPath}`)
    console.log(`Pages read: ${report.pagesRead}`)
    console.log(`Pages with chunks: ${report.pagesWithChunks}`)
    console.log(`Total chunks: ${report.totalChunks}`)
    console.log(`Chunk tokens min/avg/max: ${report.tokenSummary.min}/${report.tokenSummary.avg}/${report.tokenSummary.max}`)
    console.log('Database writes: 0')
}

const thisFile = fileURLToPath(import.meta.url)
if (process.argv[1] === thisFile) {
    main().catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
}
