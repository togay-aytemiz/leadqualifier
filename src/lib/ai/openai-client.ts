import OpenAI from 'openai'

const STRIPPED_OPENAI_REQUEST_HEADERS = [
    'cookie',
    'forwarded',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-real-ip',
    'x-nf-client-connection-ip'
]

function sanitizeOpenAiRequestHeaders(headersInit: HeadersInit | undefined) {
    const headers = new Headers(headersInit)
    for (const headerName of STRIPPED_OPENAI_REQUEST_HEADERS) {
        headers.delete(headerName)
    }
    return headers
}

function mergeOpenAiRequestHeaders(inputHeaders: HeadersInit | undefined, initHeaders: HeadersInit | undefined) {
    const headers = sanitizeOpenAiRequestHeaders(inputHeaders)
    if (initHeaders) {
        sanitizeOpenAiRequestHeaders(initHeaders).forEach((value, key) => {
            headers.set(key, value)
        })
    }
    return headers
}

export function createOpenAiFetch(fetchImpl: typeof fetch = fetch): typeof fetch {
    return ((input: RequestInfo | URL, init?: RequestInit) => {
        const sanitizedInit: RequestInit = {
            ...init,
            credentials: 'omit',
            headers: mergeOpenAiRequestHeaders(
                input instanceof Request ? input.headers : undefined,
                init?.headers
            )
        }

        return fetchImpl(input, sanitizedInit)
    }) as typeof fetch
}

export function createOpenAiClient(apiKey: string) {
    return new OpenAI({
        apiKey,
        fetch: createOpenAiFetch()
    })
}
