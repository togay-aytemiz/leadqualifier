export type SimpleRagChunk = {
  id: string
  fileId: string
  filename: string
  title: string
  url?: string
  score: number
  content: string
}

type VectorSearchResult = {
  file_id: string
  filename: string
  score: number
  content: Array<{ type: 'text'; text: string }>
}

export type SimpleRagVectorSearchClient = {
  vectorStores: {
    search: (
      vectorStoreId: string,
      body: {
        query: string
        rewrite_query: false
        max_num_results: number
        ranking_options: { ranker: 'auto'; score_threshold: number }
      }
    ) => Promise<{ data: VectorSearchResult[] }>
  }
}

type CitationSource = { title?: string; url?: string }

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export async function searchSimpleRagVectorStore(input: {
  client: SimpleRagVectorSearchClient
  vectorStoreId: string
  standaloneQuery: string
  maxResults?: number
  scoreThreshold?: number
  citationSourcesByFilename?: Record<string, CitationSource>
}) {
  const response = await input.client.vectorStores.search(input.vectorStoreId, {
    query: input.standaloneQuery,
    rewrite_query: false,
    max_num_results: input.maxResults ?? 12,
    ranking_options: {
      ranker: 'auto',
      score_threshold: input.scoreThreshold ?? 0.1,
    },
  })

  const seen = new Set<string>()
  const chunks: SimpleRagChunk[] = []

  for (const result of response.data) {
    const content = compactWhitespace(
      result.content.map((item) => item.text).filter(Boolean).join('\n')
    )
    if (!content) continue

    const key = `${result.file_id}|${content.toLocaleLowerCase('tr')}`
    if (seen.has(key)) continue
    seen.add(key)

    const source = input.citationSourcesByFilename?.[result.filename]
    chunks.push({
      id: `C${chunks.length + 1}`,
      fileId: result.file_id,
      filename: result.filename,
      title: source?.title?.trim() || result.filename,
      ...(source?.url?.trim() ? { url: source.url.trim() } : {}),
      score: result.score,
      content,
    })
  }

  return { chunks }
}
