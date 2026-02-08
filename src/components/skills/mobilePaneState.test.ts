import { describe, expect, it } from 'vitest'

import {
    getSkillsMobileDetailPaneClasses,
    getSkillsMobileListPaneClasses
} from '@/components/skills/mobilePaneState'

describe('skills mobile pane state helpers', () => {
    it('keeps the list pane visible when detail is closed', () => {
        const classes = getSkillsMobileListPaneClasses(false)

        expect(classes).toContain('translate-x-0')
        expect(classes).toContain('pointer-events-auto')
    })

    it('slides the list pane away when detail is open', () => {
        const classes = getSkillsMobileListPaneClasses(true)

        expect(classes).toContain('-translate-x-full')
        expect(classes).toContain('pointer-events-none')
    })

    it('keeps the detail pane hidden when detail is closed', () => {
        const classes = getSkillsMobileDetailPaneClasses(false)

        expect(classes).toContain('translate-x-full')
        expect(classes).toContain('pointer-events-none')
    })

    it('slides the detail pane in when detail is open', () => {
        const classes = getSkillsMobileDetailPaneClasses(true)

        expect(classes).toContain('translate-x-0')
        expect(classes).toContain('pointer-events-auto')
    })
})
