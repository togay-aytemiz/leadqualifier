import { describe, expect, it } from 'vitest'
import { isOperatorActive } from '@/lib/inbox/operator-state'

describe('isOperatorActive', () => {
    it('returns true when active_agent is operator', () => {
        expect(isOperatorActive({ active_agent: 'operator', assignee_id: null })).toBe(true)
    })

    it('returns false when active_agent is bot even if assignee exists', () => {
        expect(isOperatorActive({ active_agent: 'bot', assignee_id: 'user-1' })).toBe(false)
    })

    it('falls back to assignee for legacy rows without active_agent', () => {
        expect(isOperatorActive({ active_agent: null, assignee_id: 'user-1' })).toBe(true)
    })

    it('returns false when no active operator signal exists', () => {
        expect(isOperatorActive({ active_agent: null, assignee_id: null })).toBe(false)
    })
})
