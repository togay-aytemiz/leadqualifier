import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { AiInstructionsHelpModal } from './AiInstructionsHelpModal'

vi.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key
}))

describe('AiInstructionsHelpModal', () => {
    it('renders the help sections and boundaries when open', () => {
        const markup = renderToStaticMarkup(
            <AiInstructionsHelpModal
                isOpen
                onClose={() => {}}
            />
        )

        expect(markup).toContain('howItWorksTitle')
        expect(markup).toContain('howItWorksWhatItDoesTitle')
        expect(markup).toContain('howItWorksExampleTitle')
        expect(markup).toContain('howItWorksLimitsTitle')
        expect(markup).toContain('howItWorksLimitsItemKnowledgeBase')
        expect(markup).toContain('howItWorksClose')
    })
})
