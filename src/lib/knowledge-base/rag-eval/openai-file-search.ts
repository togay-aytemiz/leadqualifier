import { calculateUsageCreditCost } from '@/lib/billing/credit-cost'
import type { RagProviderCitation, RagProviderResult } from './types'

type FileSearchResult = {
  file_id?: string
  filename?: string
  score?: number
  text?: string
}

type CitationSource = {
  title?: string
  url?: string
}

type ResponseOutputItem = {
  type?: string
  status?: string
  results?: FileSearchResult[] | null
}

type ResponseUsage = {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

type ResponseCreateResult = {
  id?: string
  output_text?: string
  output?: ResponseOutputItem[]
  usage?: ResponseUsage
}

export type OpenAiFileSearchClient = {
  responses: {
    create: (input: Record<string, unknown>) => Promise<ResponseCreateResult>
  }
}

export type OpenAiFileSearchInstructionProfile = 'strict' | 'qualy'

export type OpenAiFileSearchFilter =
  | {
      type: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
      key: string
      value: string | number | boolean
    }
  | {
      type: 'in' | 'nin'
      key: string
      value: Array<string | number>
    }
  | {
      type: 'and' | 'or'
      filters: OpenAiFileSearchFilter[]
    }

export type OpenAiFileSearchQuestionInput = {
  client: OpenAiFileSearchClient
  model: string
  vectorStoreId: string
  question: string
  maxResults?: number
  maxOutputTokens?: number
  instructionProfile?: OpenAiFileSearchInstructionProfile
  extraInstructions?: string
  citationSourcesByFilename?: Record<string, CitationSource>
  filters?: OpenAiFileSearchFilter
}

const NO_CLEAR_INFORMATION_PATTERNS = [
  /net bilgi yok/i,
  /net bir bilgi yok/i,
  /net(?: bir)? bilgi bulunmamaktad[ıi]r/i,
  /net(?: bir)? bilgi bulunamad[ıi]/i,
  /dosyalarda.*bilgi yok/i,
  /dosyalarda.*bilgi bulunmamaktad[ıi]r/i,
  /dosyalarda.*yer almamaktad[ıi]r/i,
  /dosyalarda.*belirtilmemi[şs]tir/i,
  /belgelerde.*bilgi bulunmamaktad[ıi]r/i,
  /belgelerde.*yer almamaktad[ıi]r/i,
  /belgelerde.*belirtilmemi[şs]tir/i,
  /dok[üu]manlarda.*bilgi bulunmamaktad[ıi]r/i,
  /dok[üu]manlarda.*yer almamaktad[ıi]r/i,
  /dok[üu]manlarda.*belirtilmemi[şs]tir/i,
  /a[çc][ıi]k(?: bir)? bilgi bulunmamaktad[ıi]r/i,
  /do[ğg]rudan(?: net)?(?: bir)? bilgi bulunmamaktad[ıi]r/i,
  /do[ğg]rudan.*belirtilmemi[şs]tir/i,
  /(?:kesin|garanti).{0,80}(?:ayr[ıi]lamaz|ay[ıi]ramay[ıi]z|verilemez|sa[ğg]lanamaz|taahh[üu]t edilemez)/i,
  /(?:kontenjan|kabul|kay[ıi]t).{0,80}(?:garanti edilemez|garantisi verilemez|taahh[üu]t edilemez)/i,
  /i do not have clear information/i,
  /no clear information/i,
  /not enough information/i,
]

function isRefusal(answer: string) {
  return NO_CLEAR_INFORMATION_PATTERNS.some((pattern) => pattern.test(answer))
}

function mapCitations(
  output: ResponseOutputItem[] | undefined,
  citationSourcesByFilename: Record<string, CitationSource> | undefined
): RagProviderCitation[] {
  return (output ?? [])
    .filter((item) => item.type === 'file_search_call')
    .flatMap((item) => item.results ?? [])
    .map((result, index) => {
      const source = result.filename ? citationSourcesByFilename?.[result.filename] : undefined
      return {
        providerSourceId: result.file_id || `file_search_result_${index + 1}`,
        title: source?.title ?? result.filename,
        url: source?.url,
        quote: result.text,
        score: result.score,
      }
    })
}

function countFileSearchToolCalls(output: ResponseOutputItem[] | undefined) {
  return (output ?? []).filter((item) => item.type === 'file_search_call').length
}

function buildInstructions(input: OpenAiFileSearchQuestionInput) {
  const baseInstructions = [
    'Answer only from the File Search results.',
    'If the files do not clearly support the answer, say there is no clear information.',
    'Preserve the user language.',
  ]
  const qualyInstructions =
    input.instructionProfile === 'qualy'
      ? [
          'Use a warm, helpful, concise Qualy assistant voice.',
          'Answer the question first, then add only one short source-grounded clarification if it helps.',
          'Do not sound robotic, do not over-apologize, and do not add generic sales or contact-us filler.',
          'For unsupported questions, be transparent: say the uploaded documents do not contain clear information, and do not invent phone numbers, emails, dates, URLs, people, prices, or deadlines.',
        ]
      : []

  return [...baseInstructions, ...qualyInstructions, input.extraInstructions]
    .filter((instruction): instruction is string => Boolean(instruction?.trim()))
    .join(' ')
}

export async function runOpenAiFileSearchQuestion(
  input: OpenAiFileSearchQuestionInput
): Promise<RagProviderResult> {
  const startedAt = Date.now()
  const response = await input.client.responses.create({
    model: input.model,
    input: input.question,
    instructions: buildInstructions(input),
    include: ['file_search_call.results'],
    max_output_tokens: input.maxOutputTokens ?? 700,
    tools: [
      {
        type: 'file_search',
        vector_store_ids: [input.vectorStoreId],
        max_num_results: input.maxResults ?? 8,
        ...(input.filters ? { filters: input.filters } : {}),
      },
    ],
  })
  const answer = response.output_text ?? ''
  const inputTokens = response.usage?.input_tokens
  const outputTokens = response.usage?.output_tokens

  return {
    provider: 'openai_file_search',
    answer,
    citations: mapCitations(response.output, input.citationSourcesByFilename),
    refusal: isRefusal(answer),
    timingsMs: {
      total: Date.now() - startedAt,
    },
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: response.usage?.total_tokens,
      toolCalls: countFileSearchToolCalls(response.output),
      estimatedCredits: calculateUsageCreditCost({
        inputTokens: inputTokens ?? 0,
        outputTokens: outputTokens ?? 0,
      }),
    },
  }
}
