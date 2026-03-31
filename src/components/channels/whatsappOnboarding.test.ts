import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import enMessages from '../../../messages/en.json'
import trMessages from '../../../messages/tr.json'

import {
    getDefaultWhatsAppOnboardingPath,
    getWhatsAppBusinessAppAction,
    getWhatsAppEligibilityOptions,
    getWhatsAppExistingApiOptions,
    getWhatsAppOnboardingOptions,
    getWhatsAppSupportChatUrl,
    resolveWhatsAppExistingApiOutcome,
    resolveWhatsAppAlternativeJourneyFromMigrationWarning,
    resolveWhatsAppBackScreen,
    resolveWhatsAppConnectMode,
    resolveWhatsAppEligibilityOutcome,
    resolveWhatsAppLandingOutcome,
    resolveWhatsAppSignupJourneyFromEligibility,
    resolveWhatsAppSignupJourneyFromMetaAccess,
    resolveWhatsAppWizardScreenFromMetaAccess
} from '@/components/channels/whatsappOnboarding'

const ONBOARDING_PAGE_PATH = path.resolve(process.cwd(), 'src/components/channels/WhatsAppOnboardingPage.tsx')

describe('whatsappOnboarding', () => {
    it('places the business-app choice first on the main decision screen', () => {
        const options = getWhatsAppOnboardingOptions()

        expect(options.map((option) => option.path)).toEqual([
            'businessApp',
            'newApi',
            'existingApi'
        ])
    })

    it('maps the main decision screen to the correct primary actions', () => {
        const options = getWhatsAppOnboardingOptions()
        const newApi = options.find((option) => option.path === 'newApi')
        const existingApi = options.find((option) => option.path === 'existingApi')
        const businessApp = options.find((option) => option.path === 'businessApp')

        expect(newApi?.action).toBe('wizard')
        expect(existingApi?.action).toBe('existingApiChoice')
        expect(businessApp?.action).toBe('embeddedSignupExisting')
        expect(getWhatsAppBusinessAppAction()).toBe('embeddedSignupExisting')
    })

    it('routes the primary decision screen into either eligibility or the existing-account subflow', () => {
        expect(resolveWhatsAppLandingOutcome('newApi')).toBe('eligibility')
        expect(resolveWhatsAppLandingOutcome('existingApi')).toBe('existingApiChoice')
        expect(resolveWhatsAppLandingOutcome('businessApp')).toBe('businessApp')
    })

    it('offers separate choices for existing Meta assets and another BSP migration', () => {
        const options = getWhatsAppExistingApiOptions()

        expect(options.map((option) => option.choice)).toEqual([
            'metaAssets',
            'otherBsp'
        ])
    })

    it('routes existing-account choices to the correct next screen', () => {
        expect(resolveWhatsAppExistingApiOutcome('metaAssets')).toBe('legacyConnectReady')
        expect(resolveWhatsAppExistingApiOutcome('otherBsp')).toBe('bspMigration')
    })

    it('orders eligibility choices to match the guided phone-number check', () => {
        const options = getWhatsAppEligibilityOptions()

        expect(options.map((option) => option.choice)).toEqual([
            'newNumber',
            'personalAccount',
            'noNewNumber'
        ])
    })

    it('routes only a fresh number to the meta access step', () => {
        expect(resolveWhatsAppEligibilityOutcome('newNumber')).toBe('metaAccess')
        expect(resolveWhatsAppEligibilityOutcome('personalAccount')).toBe('migrationWarning')
        expect(resolveWhatsAppEligibilityOutcome('noNewNumber')).toBe('migrationWarning')
    })

    it('keeps new-number and migration journeys distinct before the final Meta launch screen', () => {
        expect(resolveWhatsAppSignupJourneyFromEligibility('newNumber')).toBe('newNumber')
        expect(resolveWhatsAppSignupJourneyFromEligibility('personalAccount')).toBe('migratingNumber')
        expect(resolveWhatsAppSignupJourneyFromEligibility('noNewNumber')).toBe('migratingNumber')
    })

    it('does not change the selected journey when the user confirms meta access', () => {
        expect(resolveWhatsAppSignupJourneyFromMetaAccess('hasAccess', 'newNumber')).toBe('newNumber')
        expect(resolveWhatsAppSignupJourneyFromMetaAccess('createLater', 'migratingNumber')).toBe('migratingNumber')
    })

    it('moves from meta-access into the final connect screen for both journeys', () => {
        expect(resolveWhatsAppWizardScreenFromMetaAccess()).toBe('connectReady')
    })

    it('maps the final connect screen to the correct embedded signup mode', () => {
        expect(resolveWhatsAppConnectMode('newNumber')).toBe('new')
        expect(resolveWhatsAppConnectMode('migratingNumber')).toBe('existing')
    })

    it('switches back to the new-number journey when the user abandons migration', () => {
        expect(resolveWhatsAppAlternativeJourneyFromMigrationWarning()).toBe('newNumber')
    })

    it('returns to the correct prior screen when the wizard back action is used', () => {
        expect(resolveWhatsAppBackScreen('connectReady', 'newNumber')).toBe('metaAccess')
        expect(resolveWhatsAppBackScreen('connectReady', 'migratingNumber')).toBe('metaAccess')
        expect(resolveWhatsAppBackScreen('legacyConnectReady', 'newNumber')).toBe('existingApiChoice')
        expect(resolveWhatsAppBackScreen('bspMigration', 'newNumber')).toBe('existingApiChoice')
        expect(resolveWhatsAppBackScreen('existingApiChoice', 'newNumber')).toBe('landing')
        expect(resolveWhatsAppBackScreen('metaAccess', 'newNumber')).toBe('eligibility')
        expect(resolveWhatsAppBackScreen('metaAccess', 'migratingNumber')).toBe('migrationWarning')
        expect(resolveWhatsAppBackScreen('migrationWarning', 'migratingNumber')).toBe('eligibility')
        expect(resolveWhatsAppBackScreen('businessApp', 'migratingNumber')).toBe('landing')
    })

    it('defaults to the business-app path', () => {
        expect(getDefaultWhatsAppOnboardingPath()).toBe('businessApp')
    })

    it('opens support through the team WhatsApp chat', () => {
        expect(getWhatsAppSupportChatUrl()).toBe('https://wa.me/905074699692')
    })

    it('uses simpler copy and recommends the business-app path for WhatsApp Business numbers without WABA', () => {
        expect(trMessages.Channels.whatsappConnect.options.businessApp.description).toContain('WhatsApp Business')
        expect(trMessages.Channels.whatsappConnect.options.businessApp.description).toContain('WhatsApp Business Account (WABA)')
        expect(trMessages.Channels.whatsappConnect.options.businessApp.badge).toBe('Önerilir')
        expect(enMessages.Channels.whatsappConnect.options.businessApp.description).toContain('WhatsApp Business')
        expect(enMessages.Channels.whatsappConnect.options.businessApp.description).toContain('WhatsApp Business Account (WABA)')
        expect(enMessages.Channels.whatsappConnect.options.businessApp.badge).toBe('Recommended')
    })

    it('renders a badge next to the recommended landing option', () => {
        const source = fs.readFileSync(ONBOARDING_PAGE_PATH, 'utf8')

        expect(source).toContain("badge: path === 'businessApp' ? t(`whatsappConnect.options.${path}.badge`) : undefined")
        expect(source).toContain('<Badge variant="info">{badge}</Badge>')
    })
})
