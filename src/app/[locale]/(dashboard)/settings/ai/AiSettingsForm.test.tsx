import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AiSettingsForm from './AiSettingsForm'

vi.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key
}))

const TEST_HANDOVER_MESSAGE = 'handover_message'
const TEST_PROMPT = 'ai_prompt'

function renderForm(activeTab: 'general' | 'behaviorAndLogic' | 'escalation') {
    return renderToStaticMarkup(
        <AiSettingsForm
            botName="Qualy"
            botMode="active"
            allowLeadExtractionDuringOperator={true}
            hotLeadScoreThreshold={7}
            hotLeadAction="notify_only"
            hotLeadHandoverMessage={TEST_HANDOVER_MESSAGE}
            matchThreshold={0.8}
            prompt={TEST_PROMPT}
            activeTab={activeTab}
            onActiveTabChange={() => {}}
            onBotNameChange={() => {}}
            onBotModeChange={() => {}}
            onAllowLeadExtractionDuringOperatorChange={() => {}}
            onHotLeadScoreThresholdChange={() => {}}
            onHotLeadActionChange={() => {}}
            onHotLeadHandoverMessageChange={() => {}}
            onMatchThresholdChange={() => {}}
            onPromptChange={() => {}}
        />
    )
}

describe('AiSettingsForm', () => {
    it('renders all three tab labels', () => {
        const markup = renderForm('general')

        expect(markup).toContain('tabs.general')
        expect(markup).toContain('tabs.behaviorAndLogic')
        expect(markup).toContain('tabs.escalation')
    })

    it('shows general settings in General tab', () => {
        const markup = renderForm('general')

        expect(markup).toContain('botModeTitle')
        expect(markup).toContain('botNameTitle')
        expect(markup).toContain('thresholdTitle')
        expect(markup).not.toContain('operatorLeadExtractionTitle')
        expect(markup).not.toContain('promptTitle')
        expect(markup).not.toContain('humanEscalationTitle')
    })

    it('shows behavior settings in Behavior and Logic tab', () => {
        const markup = renderForm('behaviorAndLogic')

        expect(markup).toContain('operatorLeadExtractionTitle')
        expect(markup).toContain('promptTitle')
        expect(markup).not.toContain('botModeTitle')
        expect(markup).not.toContain('botNameTitle')
        expect(markup).not.toContain('humanEscalationTitle')
    })

    it('shows escalation settings in Escalation tab', () => {
        const markup = renderForm('escalation')

        expect(markup).toContain('automaticEscalationTitle')
        expect(markup).toContain('skillBasedHandoverTitle')
        expect(markup).toContain('humanEscalationActionLabel')
        expect(markup).toContain('humanEscalationMessageLabel')
        expect(markup).not.toContain('humanEscalationTitle')
        expect(markup).not.toContain('botModeTitle')
        expect(markup).not.toContain('operatorLeadExtractionTitle')
        expect(markup).not.toContain('promptTitle')
    })
})
