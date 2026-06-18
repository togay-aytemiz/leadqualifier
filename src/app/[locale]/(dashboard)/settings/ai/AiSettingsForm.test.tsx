import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AiSettingsForm from './AiSettingsForm'

vi.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key
}))

const TEST_HANDOVER_MESSAGE = 'handover_message'
const TEST_BOT_DISCLAIMER_MESSAGE = 'bot_disclaimer_message'
const TEST_ASSISTANT_ROLE = 'assistant_role'
const TEST_ASSISTANT_INTAKE_RULE = 'assistant_intake_rule'
const TEST_ASSISTANT_NEVER_DO = 'assistant_never_do'
const TEST_ASSISTANT_OTHER = 'assistant_other'

function renderForm(
    activeTab: 'general' | 'behaviorAndLogic' | 'escalation' | 'dictionary',
    options?: { isBotModeLocked?: boolean; botModeLockHelperText?: string }
) {
    return renderToStaticMarkup(
        <AiSettingsForm
            botName="Qualy"
            botMode="active"
            isBotModeLocked={options?.isBotModeLocked ?? false}
            botModeLockHelperText={options?.botModeLockHelperText ?? null}
            botDisclaimerEnabled={true}
            botDisclaimerMessage={TEST_BOT_DISCLAIMER_MESSAGE}
            allowLeadExtractionDuringOperator={true}
            hotLeadScoreThreshold={7}
            hotLeadAction="notify_only"
            hotLeadHandoverMessage={TEST_HANDOVER_MESSAGE}
            matchThreshold={0.8}
            assistantRole={TEST_ASSISTANT_ROLE}
            assistantIntakeRule={TEST_ASSISTANT_INTAKE_RULE}
            assistantNeverDo={TEST_ASSISTANT_NEVER_DO}
            assistantOtherInstructions={TEST_ASSISTANT_OTHER}
            dictionaryEntries={[
                {
                    id: 'dict-1',
                    term: 'ftr',
                    meanings: ['Fizyoterapi ve Rehabilitasyon', 'Fizyoterapi ön lisans'],
                    enabled: true
                },
                {
                    id: 'dict-2',
                    term: 'sbf',
                    meanings: ['Sağlık Bilimleri Fakültesi'],
                    enabled: false
                }
            ]}
            activeTab={activeTab}
            onActiveTabChange={() => {}}
            onBotNameChange={() => {}}
            onBotModeChange={() => {}}
            onBotDisclaimerEnabledChange={() => {}}
            onBotDisclaimerMessageChange={() => {}}
            onAllowLeadExtractionDuringOperatorChange={() => {}}
            onHotLeadScoreThresholdChange={() => {}}
            onHotLeadActionChange={() => {}}
            onHotLeadHandoverMessageChange={() => {}}
            onMatchThresholdChange={() => {}}
            onAssistantRoleChange={() => {}}
            onAssistantIntakeRuleChange={() => {}}
            onAssistantNeverDoChange={() => {}}
            onAssistantOtherInstructionsChange={() => {}}
            onDictionaryEntriesChange={() => {}}
            onOpenHowItWorks={() => {}}
        />
    )
}

describe('AiSettingsForm', () => {
    it('renders all four tab labels', () => {
        const markup = renderForm('general')

        expect(markup).toContain('tabs.general')
        expect(markup).toContain('tabs.behaviorAndLogic')
        expect(markup).toContain('tabs.escalation')
        expect(markup).toContain('tabs.dictionary')
    })

    it('shows general settings in General tab', () => {
        const markup = renderForm('general')

        expect(markup).toContain('botModeTitle')
        expect(markup).toContain('botNameTitle')
        expect(markup).toContain('botDisclaimerTitle')
        expect(markup).not.toContain('thresholdTitle')
        expect(markup).not.toContain('operatorLeadExtractionTitle')
        expect(markup).not.toContain('promptTitle')
        expect(markup).not.toContain('humanEscalationTitle')
    })

    it('shows locked helper copy and disables bot mode cards while onboarding lock is active', () => {
        const lockedMessage = 'Başlangıç adımları tamamlanınca bot durumunu değiştirebilirsiniz.'
        const markup = renderForm('general', {
            isBotModeLocked: true,
            botModeLockHelperText: lockedMessage
        })

        expect(markup).toContain(lockedMessage)
        expect(markup.split(lockedMessage)).toHaveLength(2)
        expect(markup).toContain('bg-violet-50')
        expect(markup).toContain('disabled=""')
    })

    it('shows behavior settings in Behavior and Logic tab', () => {
        const markup = renderForm('behaviorAndLogic')

        expect(markup).toContain('thresholdTitle')
        expect(markup).toContain('assistantInstructionsTitle')
        expect(markup).toContain('assistantRoleLabel')
        expect(markup).toContain('assistantIntakeRuleLabel')
        expect(markup).toContain('assistantNeverDoLabel')
        expect(markup).toContain('assistantOtherInstructionsLabel')
        expect(markup).toContain('howItWorksAction')
        expect(markup).not.toContain('operatorLeadExtractionTitle')
        expect(markup).not.toContain('botModeTitle')
        expect(markup).not.toContain('botNameTitle')
        expect(markup).not.toContain('humanEscalationTitle')
        expect(markup).not.toContain('promptTitle')
    })

    it('shows escalation settings in Escalation tab', () => {
        const markup = renderForm('escalation')

        expect(markup).toContain('automaticEscalationTitle')
        expect(markup).toContain('skillBasedHandoverTitle')
        expect(markup).toContain('operatorLeadExtractionTitle')
        expect(markup).toContain('humanEscalationActionLabel')
        expect(markup).toContain('humanEscalationMessageLabel')
        expect(markup).not.toContain('humanEscalationTitle')
        expect(markup).not.toContain('botModeTitle')
        expect(markup).not.toContain('assistantInstructionsTitle')
    })

    it('shows editable dictionary entries in Dictionary tab', () => {
        const markup = renderForm('dictionary')

        expect(markup).toContain('dictionaryTitle')
        expect(markup).toContain('dictionaryDescription')
        expect(markup).toContain('dictionaryTermLabel')
        expect(markup).toContain('dictionaryMeaningsLabel')
        expect(markup).toContain('ftr')
        expect(markup).toContain('Fizyoterapi ve Rehabilitasyon')
        expect(markup).toContain('Fizyoterapi ön lisans')
        expect(markup).toContain('dictionaryAddEntry')
        expect(markup).toContain('<table')
        expect(markup).toContain('role="switch"')
        expect(markup).toContain('aria-checked="true"')
        expect(markup).toContain('aria-checked="false"')
        expect(markup).toContain('aria-label="dictionaryRemoveEntry"')
        expect(markup.match(/dictionaryMeaningsHelp/g)).toHaveLength(1)
        expect(markup).not.toContain('botModeTitle')
        expect(markup).not.toContain('assistantInstructionsTitle')
        expect(markup).not.toContain('automaticEscalationTitle')
    })
})
