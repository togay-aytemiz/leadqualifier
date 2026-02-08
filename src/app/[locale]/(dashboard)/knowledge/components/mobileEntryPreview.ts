export const MOBILE_ENTRY_PREVIEW_MAX = 120

export function formatMobileEntryPreview(content: string): string {
    const normalized = content.replace(/\s+/g, ' ').trim()

    if (!normalized) {
        return '–'
    }

    if (normalized.length <= MOBILE_ENTRY_PREVIEW_MAX) {
        return normalized
    }

    return `${normalized.slice(0, MOBILE_ENTRY_PREVIEW_MAX - 1)}…`
}
