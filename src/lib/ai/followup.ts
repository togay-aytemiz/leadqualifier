export function appendFollowupQuestion(reply: string, followup?: string | null) {
    const trimmed = followup?.trim()
    if (!trimmed) return reply
    return `${reply}\n\n${trimmed}`
}
