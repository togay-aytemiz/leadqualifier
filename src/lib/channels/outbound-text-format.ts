export type OutboundTextPlatform = 'whatsapp' | 'telegram' | 'instagram'

export interface OutboundTextFormatOptions {
    platform: OutboundTextPlatform
    telegramParseMode?: string | null
}

export function normalizeMarkdownLinksForPlainChat(content: string) {
    return content.replace(/\[([^\]\n]+)]\((https?:\/\/[^)\s]+)\)/gi, (_match, rawLabel: string, rawUrl: string) => {
        const label = rawLabel.trim()
        const url = rawUrl.trim()
        if (!label || label === url) return url
        return `${label}: ${url}`
    })
}

function convertDoubleStarToSingleStar(content: string) {
    return content.replace(/\*\*([^*\n][^*\n]*?)\*\*/g, (_match, value: string) => `*${value.trim()}*`)
}

function normalizeInlineBullets(content: string) {
    const bulletStartPattern = /\s+-\s+(?=(?:\*\*)?[A-Za-zÇĞİÖŞÜçğıöşü0-9])/g
    const matches = content.match(bulletStartPattern) ?? []
    const hasListIntro = /[:：]\s+-\s+(?=(?:\*\*)?[A-Za-zÇĞİÖŞÜçğıöşü0-9])/.test(content)
    if (!hasListIntro && matches.length < 2) return content

    return content
        .replace(/([:：])\s+-\s+(?=(?:\*\*)?[A-Za-zÇĞİÖŞÜçğıöşü0-9])/g, '$1\n- ')
        .replace(bulletStartPattern, '\n- ')
}

function stripPlainTextMarkdown(content: string) {
    return content
        .replace(/```[a-z0-9_-]*\n?/gi, '')
        .replace(/```/g, '')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s{0,3}>\s?/gm, '')
        .replace(/^\s*[-*_]{3,}\s*$/gm, '')
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/__([^_\n]+)__/g, '$1')
        .replace(/\*([^*\n]+)\*/g, '$1')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

export function formatOutboundTextForChannel(content: string, options: OutboundTextFormatOptions) {
    if (options.platform === 'telegram' && options.telegramParseMode) {
        return content
    }

    const withPlainLinks = normalizeInlineBullets(normalizeMarkdownLinksForPlainChat(content))

    if (options.platform === 'whatsapp') {
        return convertDoubleStarToSingleStar(withPlainLinks).trim()
    }

    return stripPlainTextMarkdown(withPlainLinks)
}
