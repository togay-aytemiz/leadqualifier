type DemoAssistantSettings = {
    bot_name?: string | null
    prompt?: string | null
}

function compactText(value: string | null | undefined, maxLength = 1200) {
    return typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim()
        : ''
}

export function extractDemoOrganizationNames(value: string | null | undefined) {
    const text = compactText(value, 3000)
    if (!text) return []

    const names = new Set<string>()
    const patterns = [
        /(?:[A-ZÇĞİÖŞÜ][\p{L}.'’&-]*(?:\s+|$)){1,8}(?:Üniversitesi|University)\b/gu,
        /(?:[A-ZÇĞİÖŞÜ][\p{L}.'’&-]*(?:\s+|$)){1,8}(?:Klinik|Poliklinik|Hastanesi|Merkezi)\b/gu,
    ]

    for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
            const name = compactText(match[0])
            if (name) names.add(name)
        }
    }

    return [...names]
}

export function resolveDemoOrganizationContext(input: {
    channelDisplayName?: string | null
    settings?: DemoAssistantSettings | null
}) {
    const names = [
        ...extractDemoOrganizationNames(input.settings?.prompt),
        ...extractDemoOrganizationNames(input.settings?.bot_name),
    ]
    const displayName = compactText(input.channelDisplayName)
    const parts = [
        ...names,
        ...(displayName ? [displayName] : []),
    ].filter((value, index, array) => (
        value && array.findIndex((candidate) => (
            candidate.toLocaleLowerCase('tr-TR') === value.toLocaleLowerCase('tr-TR')
        )) === index
    ))

    return parts.join(' / ') || null
}

export function buildDemoAssistantInstructionContext(settings?: DemoAssistantSettings | null) {
    const prompt = compactText(settings?.prompt)
    const botName = compactText(settings?.bot_name, 160)
    return [
        botName ? `Assistant name: ${botName}` : '',
        prompt ? `Assistant task/scope instructions: ${prompt}` : '',
    ].filter(Boolean).join('\n')
}
