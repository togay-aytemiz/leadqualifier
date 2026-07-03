export const WEB_WIDGET_ASSETS_BUCKET = 'web-widget-assets'
export const WEB_WIDGET_LOGO_MAX_BYTES = 2 * 1024 * 1024
export const WEB_WIDGET_LOGO_ACCEPT = 'image/png,image/jpeg,image/webp'
export const WEB_WIDGET_LOGO_ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

function normalizeVersion(version: string) {
    const trimmed = version.trim()
    return trimmed.length > 0 ? trimmed : `${Date.now()}`
}

function resolveExtension(mimeType: string) {
    if (mimeType === 'image/png') return 'png'
    if (mimeType === 'image/jpeg') return 'jpg'
    if (mimeType === 'image/webp') return 'webp'
    return 'bin'
}

export function buildWebWidgetLogoStoragePath(args: {
    organizationId: string
    mimeType: string
    version?: string
}) {
    const organizationId = args.organizationId.trim()
    const version = normalizeVersion(args.version ?? `${Date.now()}`)
    return `${organizationId}/launcher-logo-${version}.${resolveExtension(args.mimeType)}`
}

export function validateWebWidgetLogoFile(file: File) {
    if (!WEB_WIDGET_LOGO_ALLOWED_TYPES.has(file.type)) return 'invalid_type' as const
    if (file.size > WEB_WIDGET_LOGO_MAX_BYTES) return 'file_too_large' as const
    return null
}
