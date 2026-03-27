import { describe, expect, it } from 'vitest'
import {
    hydrateMainSidebarSectionState,
    syncMainSidebarSectionState,
    toggleMainSidebarSection
} from '@/design/main-sidebar-sections'

describe('hydrateMainSidebarSectionState', () => {
    it('defaults every known section to expanded', () => {
        expect(hydrateMainSidebarSectionState({
            sectionIds: ['workspace', 'ai', 'other'],
            storedValue: null
        })).toEqual({
            workspace: true,
            ai: true,
            other: true
        })
    })

    it('hydrates only known section ids from persisted storage', () => {
        expect(hydrateMainSidebarSectionState({
            sectionIds: ['workspace', 'ai', 'other'],
            storedValue: JSON.stringify({
                workspace: false,
                admin: false,
                other: 'invalid'
            })
        })).toEqual({
            workspace: false,
            ai: true,
            other: true
        })
    })
})

describe('syncMainSidebarSectionState', () => {
    it('keeps known section values and fills new sections as expanded', () => {
        expect(syncMainSidebarSectionState({
            sectionIds: ['workspace', 'admin'],
            currentState: {
                workspace: false,
                ai: false
            }
        })).toEqual({
            workspace: false,
            admin: true
        })
    })
})

describe('toggleMainSidebarSection', () => {
    it('flips the requested section state', () => {
        expect(toggleMainSidebarSection({
            workspace: true,
            ai: false
        }, 'workspace')).toEqual({
            workspace: false,
            ai: false
        })
    })
})
