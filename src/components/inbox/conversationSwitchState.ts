export function shouldShowConversationSkeleton(
    selectedConversationId: string | null,
    loadedConversationId: string | null
): boolean {
    if (!selectedConversationId) return false
    return selectedConversationId !== loadedConversationId
}
