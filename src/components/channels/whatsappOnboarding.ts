export type WhatsAppOnboardingPath = 'newApi' | 'existingApi' | 'businessApp'
export type WhatsAppOnboardingAction = 'wizard' | 'existingApiChoice' | 'embeddedSignupExisting'
export type WhatsAppEligibilityChoice = 'newNumber' | 'personalAccount' | 'noNewNumber'
export type WhatsAppEligibilityOutcome = 'metaAccess' | 'migrationWarning'
export type WhatsAppEmbeddedSignupJourney = 'newNumber' | 'migratingNumber'
export type WhatsAppMetaAccessChoice = 'hasAccess' | 'createLater'
export type WhatsAppExistingApiChoice = 'metaAssets' | 'otherBsp'
export type WhatsAppSetupScreen =
    | 'landing'
    | 'eligibility'
    | 'existingApiChoice'
    | 'metaAccess'
    | 'migrationWarning'
    | 'connectReady'
    | 'legacyConnectReady'
    | 'bspMigration'
    | 'businessApp'
export type WhatsAppConnectMode = 'new' | 'existing'

export const WHATSAPP_MIGRATION_GUIDE_URL =
    'https://respond.io/help/whatsapp/migrating-from-whatsapp-personal-or-whatsapp-business-app'
export const WHATSAPP_OVERVIEW_URL = 'https://www.facebook.com/help/2783732558314697/'
export const WHATSAPP_SUPPORT_CHAT_URL = 'https://wa.me/905074699692'

export interface WhatsAppOnboardingOption {
    path: WhatsAppOnboardingPath
    action: WhatsAppOnboardingAction
}

export interface WhatsAppEligibilityOption {
    choice: WhatsAppEligibilityChoice
    outcome: WhatsAppEligibilityOutcome
}

export interface WhatsAppExistingApiOption {
    choice: WhatsAppExistingApiChoice
    screen: WhatsAppSetupScreen
}

const WHATSAPP_ONBOARDING_OPTIONS: WhatsAppOnboardingOption[] = [
    {
        path: 'businessApp',
        action: 'embeddedSignupExisting'
    },
    {
        path: 'newApi',
        action: 'wizard'
    },
    {
        path: 'existingApi',
        action: 'existingApiChoice'
    }
]

const WHATSAPP_ELIGIBILITY_OPTIONS: WhatsAppEligibilityOption[] = [
    {
        choice: 'newNumber',
        outcome: 'metaAccess'
    },
    {
        choice: 'personalAccount',
        outcome: 'migrationWarning'
    },
    {
        choice: 'noNewNumber',
        outcome: 'migrationWarning'
    }
]

const WHATSAPP_EXISTING_API_OPTIONS: WhatsAppExistingApiOption[] = [
    {
        choice: 'metaAssets',
        screen: 'legacyConnectReady'
    },
    {
        choice: 'otherBsp',
        screen: 'bspMigration'
    }
]

export function getWhatsAppOnboardingOptions() {
    return WHATSAPP_ONBOARDING_OPTIONS
}

export function getDefaultWhatsAppOnboardingPath(): WhatsAppOnboardingPath {
    return 'businessApp'
}

export function getWhatsAppSupportChatUrl() {
    return WHATSAPP_SUPPORT_CHAT_URL
}

export function getWhatsAppEligibilityOptions() {
    return WHATSAPP_ELIGIBILITY_OPTIONS
}

export function getWhatsAppExistingApiOptions() {
    return WHATSAPP_EXISTING_API_OPTIONS
}

export function resolveWhatsAppLandingOutcome(path: WhatsAppOnboardingPath): WhatsAppSetupScreen {
    if (path === 'existingApi') return 'existingApiChoice'
    if (path === 'businessApp') return 'businessApp'
    return 'eligibility'
}

export function resolveWhatsAppEligibilityOutcome(choice: WhatsAppEligibilityChoice): WhatsAppEligibilityOutcome {
    return WHATSAPP_ELIGIBILITY_OPTIONS.find((option) => option.choice === choice)?.outcome ?? 'migrationWarning'
}

export function resolveWhatsAppExistingApiOutcome(choice: WhatsAppExistingApiChoice): WhatsAppSetupScreen {
    return WHATSAPP_EXISTING_API_OPTIONS.find((option) => option.choice === choice)?.screen ?? 'existingApiChoice'
}

export function getWhatsAppBusinessAppAction(): WhatsAppOnboardingAction {
    return 'embeddedSignupExisting'
}

export function resolveWhatsAppSignupJourneyFromEligibility(choice: WhatsAppEligibilityChoice): WhatsAppEmbeddedSignupJourney {
    return choice === 'newNumber' ? 'newNumber' : 'migratingNumber'
}

export function resolveWhatsAppSignupJourneyFromMetaAccess(
    _choice: WhatsAppMetaAccessChoice,
    journey: WhatsAppEmbeddedSignupJourney
): WhatsAppEmbeddedSignupJourney {
    return journey
}

export function resolveWhatsAppWizardScreenFromMetaAccess(): WhatsAppSetupScreen {
    return 'connectReady'
}

export function resolveWhatsAppConnectMode(journey: WhatsAppEmbeddedSignupJourney): WhatsAppConnectMode {
    return journey === 'migratingNumber' ? 'existing' : 'new'
}

export function resolveWhatsAppAlternativeJourneyFromMigrationWarning(): WhatsAppEmbeddedSignupJourney {
    return 'newNumber'
}

export function resolveWhatsAppBackScreen(
    screen: WhatsAppSetupScreen,
    journey: WhatsAppEmbeddedSignupJourney
): WhatsAppSetupScreen {
    if (screen === 'legacyConnectReady' || screen === 'bspMigration') return 'existingApiChoice'
    if (screen === 'existingApiChoice') return 'landing'
    if (screen === 'connectReady') return 'metaAccess'
    if (screen === 'metaAccess') return journey === 'migratingNumber' ? 'migrationWarning' : 'eligibility'
    if (screen === 'migrationWarning') return 'eligibility'
    if (screen === 'businessApp') return 'landing'
    return 'landing'
}
