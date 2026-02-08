import { describe, expect, it } from 'vitest'

import {
    getSimulatorBubbleClasses,
    getSimulatorHeaderClasses,
    getSimulatorMessagesPaneClasses
} from '@/components/chat/simulatorStyles'

describe('simulator style helpers', () => {
    it('uses a neutral chatbot header and message pane', () => {
        const headerClasses = getSimulatorHeaderClasses()
        const paneClasses = getSimulatorMessagesPaneClasses()

        expect(headerClasses).toContain('bg-slate-900')
        expect(headerClasses).not.toContain('bg-[#00a884]')

        expect(paneClasses).toContain('bg-gradient-to-b')
        expect(paneClasses).not.toContain('bg-[#efeae2]')
    })

    it('uses chatbot bubble colors instead of WhatsApp bubbles', () => {
        const userClasses = getSimulatorBubbleClasses('user')
        const assistantClasses = getSimulatorBubbleClasses('system')

        expect(userClasses).toContain('bg-indigo-600')
        expect(userClasses).toContain('text-white')
        expect(userClasses).not.toContain('bg-[#d9fdd3]')

        expect(assistantClasses).toContain('bg-white')
        expect(assistantClasses).toContain('border')
        expect(assistantClasses).not.toContain('rounded-tl-none')
    })
})
