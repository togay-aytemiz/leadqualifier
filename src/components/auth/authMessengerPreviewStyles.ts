export function getAuthPreviewThreadFrameClasses(): string {
    return 'relative flex min-h-0 flex-1 w-full max-w-xl flex-col justify-end'
}

export function getAuthPreviewMessageStackClasses(): string {
    return 'flex min-h-full flex-col justify-end gap-3 pb-4'
}

export function getAuthPreviewBubbleEnterClasses(): string {
    return 'motion-safe:animate-[auth-preview-bubble-in_220ms_ease-out] will-change-transform'
}

export function getAuthPreviewThreadViewportClasses(): string {
    return [
        'min-h-0',
        'h-[clamp(12rem,35vh,18rem)]',
        'overflow-y-auto',
        'overscroll-contain',
        '[scrollbar-width:none]',
        '[-ms-overflow-style:none]',
        '[&::-webkit-scrollbar]:hidden',
        'px-1',
        'pb-4',
        'pt-8',
        '[mask-image:linear-gradient(to_bottom,transparent_0%,black_12%,black_100%)]',
        '[-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,black_12%,black_100%)]',
    ].join(' ')
}

export function getAuthPreviewThreadTopFadeClasses(): string {
    return 'pointer-events-none absolute inset-x-0 top-0 h-9 bg-gradient-to-b from-gray-50 via-gray-50/90 to-transparent'
}
