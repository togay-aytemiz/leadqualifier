interface OperatorStateLike {
    active_agent?: 'bot' | 'operator' | string | null
    assignee_id?: string | null
}

// active_agent is the source of truth. assignee_id is only a legacy fallback when active_agent is missing.
export function isOperatorActive(state: OperatorStateLike | null | undefined) {
    if (!state) return false
    if (state.active_agent === 'operator') return true
    if (state.active_agent === 'bot') return false
    return Boolean(state.assignee_id)
}
