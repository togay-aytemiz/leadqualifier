export function getMobileListPaneClasses(isConversationOpen: boolean): string {
    return isConversationOpen
        ? '-translate-x-full pointer-events-none'
        : 'translate-x-0 pointer-events-auto'
}

export function getMobileConversationPaneClasses(isConversationOpen: boolean): string {
    return isConversationOpen
        ? 'translate-x-0 pointer-events-auto'
        : 'translate-x-full pointer-events-none'
}

export function getMobileDetailsOverlayClasses(isDetailsOpen: boolean): string {
    return isDetailsOpen
        ? 'opacity-100 pointer-events-auto'
        : 'opacity-0 pointer-events-none'
}

export function getMobileDetailsPanelClasses(isDetailsOpen: boolean): string {
    return isDetailsOpen
        ? 'opacity-100 translate-y-0 pointer-events-auto'
        : 'opacity-0 -translate-y-2 pointer-events-none'
}
