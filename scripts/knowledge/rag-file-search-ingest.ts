import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'
import { parseStoryFileManifest } from '@/lib/knowledge-base/rag-eval/manifest'
import {
  buildBrochureSourceManifestFromIndexedFiles,
  type BrochureSourceContentType,
} from '@/lib/knowledge-base/rag-eval/brochure-readiness'
import { buildVectorStoreFileAttributes } from './rag-build-yiu-approved-corpus-manifest'

type Args = {
  manifest?: string
  out?: string
  concurrency?: string
  batchSize?: string
  maxFileWaitMs?: string
  reuseExistingFiles?: boolean
  allowPendingFiles?: boolean
}

type UploadedFile = {
  label: string
  localPath: string
  basename: string
  sizeBytes: number
  openaiFileId: string
  sourceUrl?: string
  sourceGroup?: string
  contentType?: BrochureSourceContentType
  expectedTopics: string[]
}

function parseArgs(argv: string[]): Args {
  const args: Args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token?.startsWith('--')) continue
    const key = token.slice(2)
    if (key === 'reuse-existing-files') {
      args.reuseExistingFiles = true
      continue
    }
    if (key === 'allow-pending-files') {
      args.allowPendingFiles = true
      continue
    }

    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`)
    }
    index += 1
    if (key === 'manifest') args.manifest = value
    else if (key === 'out') args.out = value
    else if (key === 'concurrency') args.concurrency = value
    else if (key === 'batch-size') args.batchSize = value
    else if (key === 'max-file-wait-ms') args.maxFileWaitMs = value
    else throw new Error(`Unknown argument --${key}`)
  }
  return args
}

function parseEnvValue(value: string) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
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
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function loadProjectEnv() {
  const protectedKeys = new Set(Object.keys(process.env))
  const cwd = process.cwd()
  await loadEnvFile(path.join(cwd, '.env'), protectedKeys)
  await loadEnvFile(path.join(cwd, '.env.local'), protectedKeys)
  await loadEnvFile(path.join(cwd, '.env.development.local'), protectedKeys)
}

function requireArg(value: string | undefined, message: string) {
  if (!value?.trim()) throw new Error(message)
  return value.trim()
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function attributeValue(value: string) {
  return value.slice(0, 512)
}

function parseSourceContentType(value: string | undefined): BrochureSourceContentType | undefined {
  if (
    value === 'brochure_pdf' ||
    value === 'brochure_verified_markdown' ||
    value === 'website_page' ||
    value === 'website_package' ||
    value === 'approved_pdf' ||
    value === 'approved_contact_sheet' ||
    value === 'approved_question_sheet'
  ) {
    return value
  }
  return undefined
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isNotFoundError(error: unknown) {
  const status = (error as { status?: number }).status
  if (status === 404) return true

  const message = (error as Error).message ?? ''
  return message.includes('404') || message.includes('No file found')
}

async function retrieveVectorStoreFileWithRetry(
  openai: OpenAI,
  vectorStoreId: string,
  vectorStoreFileId: string
) {
  let lastError: unknown
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await openai.vectorStores.files.retrieve(vectorStoreFileId, {
        vector_store_id: vectorStoreId,
      })
    } catch (error) {
      if (!isNotFoundError(error)) throw error
      lastError = error
      await sleep(2000 * (attempt + 1))
    }
  }

  throw lastError
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function listVectorStoreFiles(openai: OpenAI, vectorStoreId: string) {
  const vectorFileData = []
  for await (const vectorFile of openai.vectorStores.files.list(vectorStoreId, {
    limit: 100,
  })) {
    vectorFileData.push(vectorFile)
  }
  return vectorFileData
}

async function listVectorStoreFilesWithRetry(
  openai: OpenAI,
  vectorStoreId: string,
  expectedCount: number
) {
  let vectorFileData = await listVectorStoreFiles(openai, vectorStoreId)
  for (let attempt = 0; vectorFileData.length < expectedCount && attempt < 5; attempt += 1) {
    await sleep(2000 * (attempt + 1))
    vectorFileData = await listVectorStoreFiles(openai, vectorStoreId)
  }
  return vectorFileData
}

function sumFileCounts(
  batches: Array<{
    file_counts: {
      cancelled: number
      completed: number
      failed: number
      in_progress: number
      total: number
    }
  }>
) {
  return batches.reduce(
    (counts, batch) => ({
      cancelled: counts.cancelled + batch.file_counts.cancelled,
      completed: counts.completed + batch.file_counts.completed,
      failed: counts.failed + batch.file_counts.failed,
      in_progress: counts.in_progress + batch.file_counts.in_progress,
      total: counts.total + batch.file_counts.total,
    }),
    {
      cancelled: 0,
      completed: 0,
      failed: 0,
      in_progress: 0,
      total: 0,
    }
  )
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function writeUploadCache(filePath: string, files: UploadedFile[]) {
  await writeFile(
    filePath,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        files,
      },
      null,
      2
    ),
    'utf8'
  )
}

async function listReusableOpenAiFilesByFingerprint(openai: OpenAI, fingerprints: Set<string>) {
  const reusableFiles = new Map<
    string,
    {
      id: string
      createdAt: number
    }
  >()

  for await (const file of openai.files.list({ purpose: 'assistants', limit: 100 })) {
    const fingerprint = `${file.filename}:${file.bytes}`
    if (!fingerprints.has(fingerprint)) continue

    const existing = reusableFiles.get(fingerprint)
    if (!existing || file.created_at > existing.createdAt) {
      reusableFiles.set(fingerprint, {
        id: file.id,
        createdAt: file.created_at,
      })
    }
  }

  return reusableFiles
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results: R[] = []
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(concurrency, items.length))

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await mapper(items[index]!, index)
      }
    })
  )

  return results
}

async function main() {
  await loadProjectEnv()
  const args = parseArgs(process.argv.slice(2))
  const manifestPath = path.resolve(requireArg(args.manifest, '--manifest is required'))
  const manifest = parseStoryFileManifest(await readFile(manifestPath, 'utf8'), process.cwd())
  const outputDir = path.resolve(
    args.out ?? process.env.RAG_COMPARE_OUTPUT_DIR ?? path.join('tmp', 'rag-evals')
  )
  await mkdir(outputDir, { recursive: true })
  const uploadCachePath = path.join(outputDir, `file-search-upload-cache-${manifest.story}.json`)

  const fileStats = new Map<string, number>()
  for (const file of manifest.files) {
    const fileStat = await stat(file.localPath)
    if (!fileStat.isFile()) {
      throw new Error(`Manifest path is not a file: ${file.localPath}`)
    }
    fileStats.set(file.localPath, fileStat.size)
  }

  const openai = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') })
  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const concurrency = Number.parseInt(args.concurrency ?? '4', 10)
  const batchSize = Number.parseInt(args.batchSize ?? '50', 10)
  const maxFileWaitMs = Number.parseInt(args.maxFileWaitMs ?? `${15 * 60 * 1000}`, 10)
  const vectorStore = await openai.vectorStores.create({
    name: `qualy-rag-eval-${manifest.story}-${runId}`,
    expires_after: { anchor: 'last_active_at', days: 7 },
    metadata: {
      qualy_purpose: 'rag_eval',
      story: attributeValue(manifest.story),
    },
  })
  const runStatePath = path.join(outputDir, `file-search-ingest-${manifest.story}-${runId}.state.json`)
  await writeFile(
    runStatePath,
    JSON.stringify(
      {
        runId,
        story: manifest.story,
        vectorStoreId: vectorStore.id,
        vectorStoreName: vectorStore.name,
        status: 'vector_store_created',
        createdAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  )

  const uploadCache = await readJsonFile<{ files?: UploadedFile[] }>(uploadCachePath)
  const cachedFilesByFingerprint = new Map(
    (uploadCache?.files ?? []).map((file) => [`${file.basename}:${file.sizeBytes}`, file])
  )
  const reusableOpenAiFiles = args.reuseExistingFiles
    ? await listReusableOpenAiFilesByFingerprint(
        openai,
        new Set(
          manifest.files.map((file) => {
            const sizeBytes = fileStats.get(file.localPath) ?? 0
            return `${path.basename(file.localPath)}:${sizeBytes}`
          })
        )
      )
    : new Map<string, { id: string; createdAt: number }>()
  const uploadedFiles: UploadedFile[] = []

  await mapWithConcurrency(
    manifest.files,
    Number.isFinite(concurrency) ? concurrency : 4,
    async (file, index) => {
      const basename = path.basename(file.localPath)
      const sizeBytes = fileStats.get(file.localPath) ?? 0
      const fingerprint = `${basename}:${sizeBytes}`
      const cachedFile = cachedFilesByFingerprint.get(fingerprint)
      const reusableOpenAiFile = reusableOpenAiFiles.get(fingerprint)
      const cachedOrReusableFile = cachedFile
        ? {
            ...cachedFile,
            label: file.label,
            localPath: file.localPath,
            sourceUrl: file.sourceUrl,
            sourceGroup: file.sourceGroup,
            contentType: parseSourceContentType(file.contentType),
            expectedTopics: file.expectedTopics ?? [],
          }
        : reusableOpenAiFile
          ? {
              label: file.label,
              localPath: file.localPath,
              basename,
              sizeBytes,
              openaiFileId: reusableOpenAiFile.id,
              sourceUrl: file.sourceUrl,
              sourceGroup: file.sourceGroup,
              contentType: parseSourceContentType(file.contentType),
              expectedTopics: file.expectedTopics ?? [],
            }
          : null

      if (cachedOrReusableFile) {
        uploadedFiles[index] = cachedOrReusableFile
        console.log(
          `Reusing ${index + 1}/${manifest.files.length} ${file.label}: ${cachedOrReusableFile.openaiFileId}`
        )
        await writeUploadCache(uploadCachePath, uploadedFiles.filter(Boolean))
        return cachedOrReusableFile
      }

      console.log(
        `Uploading ${index + 1}/${manifest.files.length} ${file.label}: ${file.localPath}`
      )
      const uploaded = await openai.files.create({
        file: createReadStream(file.localPath),
        purpose: 'assistants',
      })
      const uploadedFile = {
        label: file.label,
        localPath: file.localPath,
        basename,
        sizeBytes,
        openaiFileId: uploaded.id,
        sourceUrl: file.sourceUrl,
        sourceGroup: file.sourceGroup,
        contentType: parseSourceContentType(file.contentType),
        expectedTopics: file.expectedTopics ?? [],
      }
      uploadedFiles[index] = uploadedFile
      console.log(`Uploaded ${index + 1}/${manifest.files.length} ${file.label}: ${uploaded.id}`)
      await writeUploadCache(uploadCachePath, uploadedFiles.filter(Boolean))
      return uploadedFile
    }
  )

  const completedBatches = []
  const individualVectorFiles = []
  if (batchSize === 1) {
    const attachedVectorFiles = await mapWithConcurrency(
      uploadedFiles,
      Number.isFinite(concurrency) ? concurrency : 4,
      async (file, index) => {
        console.log(
          `Attaching file ${index + 1}/${uploadedFiles.length} ${file.label}: ${file.openaiFileId}`
        )
        const createdFile = await openai.vectorStores.files.create(vectorStore.id, {
          attributes: buildVectorStoreFileAttributes({
            story: manifest.story,
            label: file.label,
            basename: file.basename,
            contentType: file.contentType,
            sourceGroup: file.sourceGroup,
            sourceUrl: file.sourceUrl,
          }),
          file_id: file.openaiFileId,
        })
        let vectorFile = createdFile
        const waitStartedAt = Date.now()
        while (vectorFile.status === 'in_progress') {
          await sleep(5000)
          vectorFile = await retrieveVectorStoreFileWithRetry(
            openai,
            vectorStore.id,
            createdFile.id
          )
          console.log(
            `File ${index + 1}/${uploadedFiles.length} ${createdFile.id}: ${vectorFile.status}`
          )
          if (
            Number.isFinite(maxFileWaitMs) &&
            maxFileWaitMs > 0 &&
            Date.now() - waitStartedAt >= maxFileWaitMs
          ) {
            const message = `Vector store file ${createdFile.id} still in_progress after ${maxFileWaitMs}ms`
            if (!args.allowPendingFiles) throw new Error(message)
            console.warn(`${message}; keeping it as pending in the output report`)
            return vectorFile
          }
        }

        if (vectorFile.status !== 'completed') {
          if (args.allowPendingFiles) {
            console.warn(
              `Vector store file ${createdFile.id} finished with status ${vectorFile.status}: ${JSON.stringify(
                vectorFile.last_error
              )}`
            )
            return vectorFile
          }
          throw new Error(
            `Vector store file ${createdFile.id} finished with status ${vectorFile.status}: ${JSON.stringify(
              vectorFile.last_error
            )}`
          )
        }
        return vectorFile
      }
    )
    individualVectorFiles.push(...attachedVectorFiles)
  } else {
    const uploadChunks = chunkArray(
      uploadedFiles,
      Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 50
    )

    for (const [batchIndex, files] of uploadChunks.entries()) {
      console.log(`Creating vector store batch ${batchIndex + 1}/${uploadChunks.length}`)
      const createdBatch = await openai.vectorStores.fileBatches.create(vectorStore.id, {
        files: files.map((file) => ({
          attributes: buildVectorStoreFileAttributes({
            story: manifest.story,
            label: file.label,
            basename: file.basename,
            contentType: file.contentType,
            sourceGroup: file.sourceGroup,
            sourceUrl: file.sourceUrl,
          }),
          file_id: file.openaiFileId,
        })),
      })
      console.log(
        `Batch ${batchIndex + 1}/${uploadChunks.length} created: ${createdBatch.id} ${createdBatch.status}`
      )

      const batchId = createdBatch.id
      let batch = createdBatch
      while (batch.status === 'in_progress') {
        await sleep(5000)
        const retrievedBatch = await openai.vectorStores.fileBatches.retrieve(batchId, {
          vector_store_id: vectorStore.id,
        })
        batch = {
          ...retrievedBatch,
          id: batchId,
        }
        console.log(
          `Batch ${batchIndex + 1}/${uploadChunks.length} ${batchId}: ${batch.status} ${batch.file_counts.completed}/${batch.file_counts.total} indexed, ${batch.file_counts.failed} failed`
        )
      }

      if (batch.status !== 'completed' || batch.file_counts.failed > 0) {
        throw new Error(
          `Vector store batch ${batch.id} finished with status ${batch.status} and ${batch.file_counts.failed} failed files`
        )
      }
      completedBatches.push(batch)
    }
  }

  const vectorFileData = await listVectorStoreFilesWithRetry(
    openai,
    vectorStore.id,
    uploadedFiles.length
  )
  const vectorFiles = { data: vectorFileData }
  const vectorFilesByOpenAiFileId = new Map(
    [...vectorFiles.data, ...individualVectorFiles].map((file) => [file.id, file])
  )
  const countSourceFiles = individualVectorFiles.length > 0 ? individualVectorFiles : vectorFileData
  const batchFileCounts =
    completedBatches.length > 0
      ? sumFileCounts(completedBatches)
      : {
          cancelled: countSourceFiles.filter((file) => file.status === 'cancelled').length,
          completed: countSourceFiles.filter((file) => file.status === 'completed').length,
          failed: countSourceFiles.filter((file) => file.status === 'failed').length,
          in_progress: countSourceFiles.filter((file) => file.status === 'in_progress').length,
          total: countSourceFiles.length,
        }
  const finalVectorStore = await openai.vectorStores.retrieve(vectorStore.id)

  const indexedFiles: Array<{
    label: string
    localPath: string
    openaiFileId: string
    vectorStoreFileId: string
    status: string
    sourceUrl?: string
    sourceGroup?: string
    contentType?: BrochureSourceContentType
    usageBytes?: number
  }> = uploadedFiles.map((file) => {
    const vectorFile = vectorFilesByOpenAiFileId.get(file.openaiFileId)
    return {
      label: file.label,
      localPath: file.localPath,
      openaiFileId: file.openaiFileId,
      vectorStoreFileId: vectorFile?.id ?? file.openaiFileId,
      status: vectorFile?.status ?? 'missing',
      sourceUrl: file.sourceUrl,
      sourceGroup: file.sourceGroup,
      contentType: file.contentType,
      usageBytes: vectorFile?.usage_bytes,
    }
  })
  const sourceManifest = buildBrochureSourceManifestFromIndexedFiles({
    corpusScope: manifest.story,
    files: indexedFiles.map((file) => ({
      label: file.label,
      localPath: file.localPath,
      openaiFileId: file.openaiFileId,
      sourceUrl: file.sourceUrl,
      contentType: file.contentType,
    })),
  })

  const outputPath = path.join(outputDir, `file-search-ingest-${manifest.story}-${runId}.json`)
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        runId,
        story: manifest.story,
        vectorStoreId: vectorStore.id,
        vectorStoreStatus: finalVectorStore.status,
        runStatePath,
        allowPendingFiles: Boolean(args.allowPendingFiles),
        maxFileWaitMs,
        vectorStore: {
          id: finalVectorStore.id,
          name: finalVectorStore.name,
          status: finalVectorStore.status,
          usage_bytes: finalVectorStore.usage_bytes,
          expires_after: finalVectorStore.expires_after,
          expires_at: finalVectorStore.expires_at,
          file_counts: {
            cancelled: finalVectorStore.file_counts.cancelled,
            completed: finalVectorStore.file_counts.completed,
            failed: finalVectorStore.file_counts.failed,
            in_progress: finalVectorStore.file_counts.in_progress,
            total: finalVectorStore.file_counts.total,
          },
        },
        batchId: completedBatches[0]?.id,
        batchStatus:
          completedBatches.length === 0 ||
          completedBatches.every((batch) => batch.status === 'completed')
            ? 'completed'
            : 'unknown',
        batchIds: completedBatches.map((batch) => batch.id),
        batchFileCounts,
        expiresAfter: finalVectorStore.expires_after,
        sourceManifest,
        files: indexedFiles,
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(`VECTOR_STORE ${vectorStore.id}`)
  console.log(
    `BATCHES ${completedBatches.length > 0 ? completedBatches.map((batch) => batch.id).join(', ') : 'individual-files'}`
  )
  console.log(`FILES ${indexedFiles.length}`)
  console.log(`OUTPUT ${outputPath}`)
}

main().catch((error) => {
  console.error((error as Error).message)
  process.exitCode = 1
})
