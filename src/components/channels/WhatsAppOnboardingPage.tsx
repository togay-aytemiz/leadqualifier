'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Bug, FileText } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

import { ChannelOnboardingShell } from '@/components/channels/ChannelOnboardingShell'
import {
    getErrorMessage,
    loadMetaSdk,
    subscribeToEmbeddedSignupEvents,
    waitForEmbeddedSignupEventOrFallback,
    wait
} from '@/components/channels/metaEmbeddedSignupClient'
import { useMetaOAuthPopupTransport } from '@/components/channels/useMetaOAuthPopupTransport'
import {
    getDefaultWhatsAppOnboardingPath,
    resolveWhatsAppAlternativeJourneyFromMigrationWarning,
    getWhatsAppEligibilityOptions,
    getWhatsAppExistingApiOptions,
    getWhatsAppOnboardingOptions,
    getWhatsAppSupportChatUrl,
    resolveWhatsAppBackScreen,
    resolveWhatsAppConnectMode,
    resolveWhatsAppEligibilityOutcome,
    resolveWhatsAppExistingApiOutcome,
    resolveWhatsAppLandingOutcome,
    resolveWhatsAppSignupJourneyFromEligibility,
    resolveWhatsAppSignupJourneyFromMetaAccess,
    resolveWhatsAppWizardScreenFromMetaAccess,
    type WhatsAppEligibilityChoice,
    type WhatsAppEmbeddedSignupJourney,
    type WhatsAppExistingApiChoice,
    type WhatsAppMetaAccessChoice,
    type WhatsAppOnboardingPath,
    type WhatsAppSetupScreen
} from '@/components/channels/whatsappOnboarding'
import { WhatsAppTemplateModal } from '@/components/channels/WhatsAppTemplateModal'
import { Alert, Button } from '@/design'
import { ConfirmDialog } from '@/design/primitives'
import {
    completeWhatsAppEmbeddedSignupChannel,
    debugWhatsAppChannel,
    disconnectChannel
} from '@/lib/channels/actions'
import { getChannelConnectionState } from '@/lib/channels/connection-readiness'
import { getMetaChannelConnectedCopy } from '@/lib/channels/meta-connection-copy'
import {
    buildMetaEmbeddedSignupLaunchOptions,
    getMetaEmbeddedSignupConfig,
    type MetaEmbeddedSignupMode
} from '@/lib/channels/meta-embedded-signup'
import type { Channel } from '@/types/database'

interface WhatsAppOnboardingPageProps {
    organizationId: string
    channel?: Channel
    isReadOnly?: boolean
}

interface MetaLoginResponse {
    authResponse?: {
        code?: string | null
    }
    status?: string
}

type WizardStepState = 'active' | 'complete' | 'inactive'
const sectionTitleClass = 'text-lg font-bold leading-tight text-slate-900'
const sectionLeadClass = 'mt-2.5 max-w-3xl text-sm leading-6 text-slate-600'
const sectionBodyClass = 'max-w-4xl text-sm leading-6 text-slate-700'

function getLocalizedHref(locale: string, href: string) {
    if (locale === 'tr') return href
    return `/${locale}${href}`
}

function getWizardPillClasses(state: WizardStepState) {
    if (state === 'active') {
        return 'border-blue-600 bg-blue-600 text-white shadow-sm'
    }

    if (state === 'complete') {
        return 'border-emerald-200 bg-emerald-100 text-emerald-800'
    }

    return 'border-slate-200 bg-slate-100 text-slate-500'
}

function getWizardStepNumberClasses(state: WizardStepState) {
    if (state === 'active') {
        return 'bg-white text-blue-700'
    }

    if (state === 'complete') {
        return 'bg-white/95 text-emerald-700'
    }

    return 'bg-white/95 text-slate-500'
}

function getDisconnectErrorMessage(t: ReturnType<typeof useTranslations<'Channels'>>, error: unknown) {
    const message = getErrorMessage(error, t('whatsappConnect.disconnectFailed'))

    if (message === 'WHATSAPP_COEXISTENCE_DISCONNECT_REQUIRED') {
        return t('whatsappConnect.disconnectCoexistenceRequired')
    }

    if (message === 'WHATSAPP_PROVIDER_DISCONNECT_FAILED') {
        return t('whatsappConnect.disconnectFailed')
    }

    return message
}

function getEmbeddedSignupErrorMessage(t: ReturnType<typeof useTranslations<'Channels'>>, error: unknown) {
    const message = getErrorMessage(error, t('connectWhatsAppError'))

    if (message === 'WHATSAPP_EMBEDDED_SIGNUP_ASSETS_MISSING') {
        return t('oauthStatus.missingWhatsAppAssets')
    }

    return message
}

export function WhatsAppOnboardingPage({
    organizationId,
    channel,
    isReadOnly = false
}: WhatsAppOnboardingPageProps) {
    const t = useTranslations('Channels')
    const locale = useLocale()
    const router = useRouter()
    const onboardingOptions = getWhatsAppOnboardingOptions()
    const eligibilityOptions = getWhatsAppEligibilityOptions()
    const existingApiOptions = getWhatsAppExistingApiOptions()
    const newNumberSignupConfig = getMetaEmbeddedSignupConfig('new')
    const existingNumberSignupConfig = getMetaEmbeddedSignupConfig('existing')
    const { popupResult, clearPopupResult, startMetaOAuth } = useMetaOAuthPopupTransport({
        organizationId,
        locale
    })

    const [activePath, setActivePath] = useState<WhatsAppOnboardingPath>(getDefaultWhatsAppOnboardingPath())
    const [setupScreen, setSetupScreen] = useState<WhatsAppSetupScreen>('landing')
    const [eligibilityChoice, setEligibilityChoice] = useState<WhatsAppEligibilityChoice | null>(null)
    const [existingApiChoice, setExistingApiChoice] = useState<WhatsAppExistingApiChoice | null>(null)
    const [signupJourney, setSignupJourney] = useState<WhatsAppEmbeddedSignupJourney>('newNumber')
    const [isConnecting, setIsConnecting] = useState(false)
    const [isDisconnecting, setIsDisconnecting] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [showTemplateModal, setShowTemplateModal] = useState(false)
    const [error, setError] = useState('')
    const [info, setInfo] = useState('')
    const connectionState = getChannelConnectionState(channel)

    useEffect(() => {
        if (!popupResult) return

        const channelLabel = t('types.whatsapp')
        const errorMessages = {
            missing_permissions: t('oauthErrors.missingPermissions'),
            invalid_redirect_uri: t('oauthErrors.invalidRedirectUri'),
            invalid_oauth_token: t('oauthErrors.invalidOauthToken'),
            asset_access_denied: t('oauthErrors.assetAccessDenied'),
            graph_api_error: t('oauthErrors.graphApiError'),
            unknown: t('oauthErrors.unknown')
        } as const

        const statusMessages = {
            success: t('oauthStatus.success', { channel: channelLabel }),
            oauth_cancelled: t('oauthStatus.cancelled'),
            missing_whatsapp_assets: t('oauthStatus.missingWhatsAppAssets'),
            org_mismatch: t('oauthStatus.orgMismatch'),
            forbidden: t('oauthStatus.forbidden'),
            missing_meta_env: t('oauthStatus.missingMetaEnv'),
            missing_state: t('oauthStatus.invalidState'),
            invalid_state: t('oauthStatus.invalidState'),
            missing_code: t('oauthStatus.missingCode')
        } as const

        const errorReason = popupResult.error
            ? (errorMessages[popupResult.error as keyof typeof errorMessages] ?? errorMessages.unknown)
            : errorMessages.unknown

        const message = popupResult.status === 'connect_failed'
            ? t('oauthStatus.connectFailed', { reason: errorReason })
            : statusMessages[popupResult.status as keyof typeof statusMessages] || t('oauthStatus.genericFailure')

        if (popupResult.status === 'success') {
            setInfo(message)
            setError('')
            router.refresh()
        } else {
            setError(message)
            setInfo('')
        }

        clearPopupResult()
    }, [clearPopupResult, popupResult, router, t])

    const handleLegacyConnect = async () => {
        setIsConnecting(true)
        setError('')
        setInfo('')

        try {
            await startMetaOAuth('whatsapp')
        } catch (signupError) {
            setError(getErrorMessage(signupError, t('connectWhatsAppError')))
        } finally {
            setIsConnecting(false)
        }
    }

    const handleEmbeddedSignup = async (mode: MetaEmbeddedSignupMode) => {
        const embeddedSignupConfig = mode === 'existing' ? existingNumberSignupConfig : newNumberSignupConfig
        const unavailableMessage = mode === 'existing'
            ? t('whatsappConnect.existingEmbeddedSignupUnavailable')
            : t('whatsappConnect.embeddedSignupUnavailable')

        if (!embeddedSignupConfig) {
            setError(unavailableMessage)
            return
        }

        setIsConnecting(true)
        setError('')
        setInfo('')

        const signupSubscription = subscribeToEmbeddedSignupEvents()

        try {
            const sdk = await loadMetaSdk(embeddedSignupConfig.appId)

            const loginResponse = await new Promise<MetaLoginResponse>((resolve) => {
                sdk.login(resolve, buildMetaEmbeddedSignupLaunchOptions(embeddedSignupConfig.configId, mode))
            })

            const authCode = typeof loginResponse.authResponse?.code === 'string'
                ? loginResponse.authResponse.code.trim()
                : ''

            if (!authCode) {
                const maybeEvent = await Promise.race([
                    signupSubscription.promise.catch(() => null),
                    wait(1200)
                ])

                if (maybeEvent?.type === 'cancel') {
                    setInfo(
                        maybeEvent.currentStep
                            ? t('whatsappConnect.embeddedSignupCancelledStep', { step: maybeEvent.currentStep })
                            : t('whatsappConnect.embeddedSignupCancelled')
                    )
                } else if (maybeEvent?.type === 'error') {
                    setError(t('whatsappConnect.embeddedSignupFailedReason', {
                        reason: maybeEvent.message || t('oauthErrors.unknown')
                    }))
                } else {
                    setInfo(t('whatsappConnect.embeddedSignupCancelled'))
                }
                return
            }

            const signupEvent = await waitForEmbeddedSignupEventOrFallback(signupSubscription.promise)

            if (signupEvent?.type === 'cancel') {
                setInfo(
                    signupEvent.currentStep
                        ? t('whatsappConnect.embeddedSignupCancelledStep', { step: signupEvent.currentStep })
                        : t('whatsappConnect.embeddedSignupCancelled')
                )
                return
            }

            if (signupEvent?.type === 'error') {
                setError(t('whatsappConnect.embeddedSignupFailedReason', {
                    reason: signupEvent.message || t('oauthErrors.unknown')
                }))
                return
            }

            const result = await completeWhatsAppEmbeddedSignupChannel(organizationId, {
                authCode,
                mode,
                phoneNumberId: signupEvent?.type === 'finish' ? signupEvent.phoneNumberId : undefined,
                businessAccountId: signupEvent?.type === 'finish' ? signupEvent.businessAccountId : undefined
            })

            if (result.error) {
                throw new Error(result.error)
            }

            setInfo(t('whatsappConnect.embeddedSignupSuccess'))
            router.refresh()
        } catch (signupError) {
            setError(getEmbeddedSignupErrorMessage(t, signupError))
        } finally {
            signupSubscription.cancel()
            setIsConnecting(false)
        }
    }

    const handleDebug = async () => {
        if (!channel) return

        const result = await debugWhatsAppChannel(channel.id)
        if (result.success) {
            alert(t('debug.webhookInfo', { info: JSON.stringify(result.info, null, 2) }))
            return
        }

        alert(t('debug.webhookFailed', { error: result.error }))
    }

    const handleDisconnect = async () => {
        if (!channel || isReadOnly) return

        setIsDisconnecting(true)
        try {
            await disconnectChannel(channel.id)
            setShowConfirm(false)
            router.push(getLocalizedHref(locale, '/settings/channels'))
            router.refresh()
        } catch (disconnectError) {
            setError(getDisconnectErrorMessage(t, disconnectError))
        } finally {
            setIsDisconnecting(false)
        }
    }

    const handleLandingContinue = async () => {
        setEligibilityChoice(null)
        setExistingApiChoice(null)
        setSignupJourney('newNumber')
        setSetupScreen(resolveWhatsAppLandingOutcome(activePath))
    }

    const handleEligibilityContinue = () => {
        if (!eligibilityChoice) return

        const nextScreen = resolveWhatsAppEligibilityOutcome(eligibilityChoice)
        setSignupJourney(resolveWhatsAppSignupJourneyFromEligibility(eligibilityChoice))
        setSetupScreen(nextScreen)
    }

    const handleMetaAccessContinue = (choice: WhatsAppMetaAccessChoice) => {
        setSignupJourney(resolveWhatsAppSignupJourneyFromMetaAccess(choice, signupJourney))
        setSetupScreen(resolveWhatsAppWizardScreenFromMetaAccess())
    }

    const handleExistingApiContinue = () => {
        if (!existingApiChoice) return

        setSetupScreen(resolveWhatsAppExistingApiOutcome(existingApiChoice))
    }

    const handleWizardBack = () => {
        setSetupScreen(resolveWhatsAppBackScreen(setupScreen, signupJourney))
    }

    const renderWizardSteps = (activeStep: 1 | 2) => {
        const firstState: WizardStepState = activeStep === 1 ? 'active' : activeStep === 2 ? 'complete' : 'inactive'
        const secondState: WizardStepState = activeStep === 2 ? 'active' : 'inactive'

        return (
            <div className="mb-6 flex flex-wrap gap-2.5">
                <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${getWizardPillClasses(firstState)}`}>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${getWizardStepNumberClasses(firstState)}`}>
                        1
                    </span>
                    <span>{t('whatsappConnect.eligibility.steps.phone')}</span>
                </div>
                <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${getWizardPillClasses(secondState)}`}>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${getWizardStepNumberClasses(secondState)}`}>
                        2
                    </span>
                    <span>{t('whatsappConnect.eligibility.steps.meta')}</span>
                </div>
            </div>
        )
    }

    const renderRadioMarker = (isSelected: boolean) => (
        <span
            className={[
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                isSelected ? 'border-blue-600' : 'border-slate-400'
            ].join(' ')}
        >
            <span
                className={[
                    'h-2.5 w-2.5 rounded-full transition-colors',
                    isSelected ? 'bg-blue-600' : 'bg-transparent'
                ].join(' ')}
            />
        </span>
    )

    const renderRadioCard = ({
        isSelected,
        title,
        description,
        onSelect
    }: {
        isSelected: boolean
        title: string
        description?: string
        onSelect: () => void
    }) => (
        <label
            className={[
                'flex w-full cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                isSelected
                    ? 'border-blue-300 bg-blue-50/70 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            ].join(' ')}
        >
            <input
                type="radio"
                checked={isSelected}
                onChange={onSelect}
                className="sr-only"
            />
            {renderRadioMarker(isSelected)}
            <span className="block min-w-0">
                <span className="block text-base font-semibold leading-6 text-slate-900">
                    {title}
                </span>
                {description && (
                    <span className="mt-1 block text-sm leading-6 text-slate-600">
                        {description}
                    </span>
                )}
            </span>
        </label>
    )

    const renderLandingOption = (path: WhatsAppOnboardingPath) => {
        const isSelected = activePath === path

        return (
            <div key={path}>
                {renderRadioCard({
                    isSelected,
                    title: t(`whatsappConnect.options.${path}.title`),
                    description: t(`whatsappConnect.options.${path}.description`),
                    onSelect: () => setActivePath(path)
                })}
            </div>
        )
    }

    const renderEligibilityOption = (choice: WhatsAppEligibilityChoice) => {
        const isSelected = eligibilityChoice === choice

        return (
            <div key={choice}>
                {renderRadioCard({
                    isSelected,
                    title: t(`whatsappConnect.eligibility.choices.${choice}`),
                    onSelect: () => setEligibilityChoice(choice)
                })}
            </div>
        )
    }

    const renderExistingApiOption = (choice: WhatsAppExistingApiChoice) => {
        const isSelected = existingApiChoice === choice

        return (
            <div key={choice}>
                {renderRadioCard({
                    isSelected,
                    title: t(`whatsappConnect.existingApi.choices.${choice}.title`),
                    description: t(`whatsappConnect.existingApi.choices.${choice}.description`),
                    onSelect: () => setExistingApiChoice(choice)
                })}
            </div>
        )
    }

    const renderLandingScreen = () => (
        <div className="space-y-6">
            <div>
                <h2 className={sectionTitleClass}>
                    {t('onboarding.whatsapp.heading')}
                </h2>
                <p className={sectionLeadClass}>
                    {t('onboarding.whatsapp.subheading')}
                </p>
            </div>

            <div className="space-y-3">
                {onboardingOptions.map((option) => renderLandingOption(option.path))}
            </div>

            <div className="flex flex-wrap items-center gap-4">
                <Button
                    type="button"
                    onClick={handleLandingContinue}
                    disabled={isConnecting || isReadOnly}
                >
                    {t('whatsappConnect.getStarted')}
                </Button>

                <button
                    type="button"
                    onClick={handleLegacyConnect}
                    disabled={isConnecting || isReadOnly}
                    className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 disabled:pointer-events-none disabled:text-slate-400"
                >
                    {t('whatsappConnect.skipAndConnect')}
                </button>
            </div>
        </div>
    )

    const renderExistingApiChoiceScreen = () => (
        <div className="space-y-6">
            <div>
                <h2 className={sectionTitleClass}>
                    {t('whatsappConnect.existingApi.heading')}
                </h2>
                <p className={sectionLeadClass}>
                    {t('whatsappConnect.existingApi.description')}
                </p>
            </div>

            <div className="space-y-3">
                {existingApiOptions.map((option) => renderExistingApiOption(option.choice))}
            </div>

            <div className="flex flex-wrap items-center gap-4">
                <Button
                    type="button"
                    onClick={handleExistingApiContinue}
                    disabled={!existingApiChoice}
                >
                    {t('whatsappConnect.existingApi.next')}
                </Button>
            </div>
        </div>
    )

    const renderEligibilityScreen = () => (
        <div className="space-y-6">
            <div>
                <h2 className={sectionTitleClass}>
                    {t('whatsappConnect.eligibility.heading')}
                </h2>
            </div>

            {renderWizardSteps(1)}

            <p className={sectionBodyClass}>
                {t('whatsappConnect.eligibility.question')}
            </p>

            <div className="space-y-2">
                {eligibilityOptions.map((option) => renderEligibilityOption(option.choice))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
                <Button
                    type="button"
                    onClick={handleEligibilityContinue}
                    disabled={!eligibilityChoice}
                >
                    {t('whatsappConnect.eligibility.next')}
                </Button>

                <button
                    type="button"
                    onClick={() => handleEmbeddedSignup('new')}
                    disabled={isConnecting || isReadOnly}
                    className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 disabled:pointer-events-none disabled:text-slate-400"
                >
                    {t('whatsappConnect.eligibility.skip')}
                </button>
            </div>
        </div>
    )

    const renderMetaAccessScreen = () => (
        <div className="space-y-6">
            <div>
                <h2 className={sectionTitleClass}>
                    {t('whatsappConnect.metaAccess.heading')}
                </h2>
                <p className={sectionBodyClass}>
                    {t('whatsappConnect.metaAccess.description')}
                </p>
            </div>

            {renderWizardSteps(2)}

            <Alert variant="info">
                <p className="mb-2 font-medium">{t('whatsappConnect.metaAccess.checklistTitle')}</p>
                <ul className="list-inside list-disc space-y-1 text-blue-700">
                    <li>{t('whatsappConnect.metaAccess.checklist.step1')}</li>
                    <li>{t('whatsappConnect.metaAccess.checklist.step2')}</li>
                    <li>{t('whatsappConnect.metaAccess.checklist.step3')}</li>
                </ul>
            </Alert>

            {signupJourney === 'newNumber' && !newNumberSignupConfig && (
                <Alert variant="warning">
                    {t('whatsappConnect.embeddedSignupUnavailable')}
                </Alert>
            )}

            {signupJourney === 'migratingNumber' && !existingNumberSignupConfig && (
                <Alert variant="warning">
                    {t('whatsappConnect.existingEmbeddedSignupUnavailable')}
                </Alert>
            )}

            <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={() => handleMetaAccessContinue('hasAccess')}>
                    {t('whatsappConnect.metaAccess.primary')}
                </Button>

                <button
                    type="button"
                    onClick={() => handleMetaAccessContinue('createLater')}
                    className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
                >
                    {t('whatsappConnect.metaAccess.secondary')}
                </button>
            </div>
        </div>
    )

    const renderMigrationWarningScreen = () => (
        <div className="space-y-6">
            <div>
                <h2 className={sectionTitleClass}>
                    {t('whatsappConnect.eligibility.heading')}
                </h2>
            </div>

            {renderWizardSteps(1)}

            <div className="space-y-4">
                <p className={sectionBodyClass}>
                    {t('whatsappConnect.migrationWarning.description')}
                </p>

                <a
                    href="#"
                    onClick={(event) => event.preventDefault()}
                    className="inline-flex text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
                >
                    {t('whatsappConnect.migrationWarning.linkLabel')}
                </a>
            </div>

            <div className="flex flex-wrap gap-3">
                <Button
                    type="button"
                    onClick={() => {
                        setSignupJourney('migratingNumber')
                        setSetupScreen('metaAccess')
                    }}
                >
                    {t('whatsappConnect.migrationWarning.primary')}
                </Button>

                <button
                    type="button"
                    onClick={() => {
                        setEligibilityChoice('newNumber')
                        setSignupJourney(resolveWhatsAppAlternativeJourneyFromMigrationWarning())
                        setSetupScreen('metaAccess')
                    }}
                    className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
                >
                    {t('whatsappConnect.migrationWarning.secondary')}
                </button>
            </div>
        </div>
    )

    const renderConnectReadyScreen = () => {
        const connectMode = resolveWhatsAppConnectMode(signupJourney)
        const isUnavailable = connectMode === 'existing' ? !existingNumberSignupConfig : !newNumberSignupConfig

        return (
            <div className="space-y-6">
                <div>
                    <h2 className={sectionTitleClass}>
                        {t('whatsappConnect.connectReady.heading')}
                    </h2>
                    <p className={sectionBodyClass}>
                        {t('whatsappConnect.connectReady.description')}
                    </p>
                </div>

                <Alert variant="info">
                    <p className="mb-2 font-medium">
                        {connectMode === 'existing'
                            ? t('whatsappConnect.existingChecklistTitle')
                            : t('whatsappConnect.newChecklistTitle')}
                    </p>
                    <p className="mb-3 text-blue-700">
                        {connectMode === 'existing'
                            ? t('whatsappConnect.existingDescriptionLong')
                            : t('whatsappConnect.newDescriptionLong')}
                    </p>
                    <ol className="list-inside list-decimal space-y-1 text-blue-700">
                        <li>{t(`whatsappConnect.${connectMode === 'existing' ? 'existingChecklist' : 'newChecklist'}.step1`)}</li>
                        <li>{t(`whatsappConnect.${connectMode === 'existing' ? 'existingChecklist' : 'newChecklist'}.step2`)}</li>
                        <li>{t(`whatsappConnect.${connectMode === 'existing' ? 'existingChecklist' : 'newChecklist'}.step3`)}</li>
                        {connectMode === 'existing' && (
                            <li>{t('whatsappConnect.existingChecklist.step4')}</li>
                        )}
                    </ol>
                </Alert>

                {isUnavailable && (
                    <Alert variant="warning">
                        {connectMode === 'existing'
                            ? t('whatsappConnect.existingEmbeddedSignupUnavailable')
                            : t('whatsappConnect.embeddedSignupUnavailable')}
                    </Alert>
                )}

                <div className="flex flex-wrap gap-3">
                    <Button
                        type="button"
                        onClick={() => handleEmbeddedSignup(connectMode)}
                        disabled={isConnecting || isUnavailable || isReadOnly}
                    >
                        {isConnecting ? t('whatsappConnect.connecting') : t('whatsappConnect.connectWithFacebook')}
                    </Button>
                </div>
            </div>
        )
    }

    const renderLegacyConnectReadyScreen = () => (
        <div className="space-y-6">
            <div>
                <h2 className={sectionTitleClass}>
                    {t('whatsappConnect.connectReady.heading')}
                </h2>
                <p className={sectionBodyClass}>
                    {t('whatsappConnect.assetsDescriptionLong')}
                </p>
            </div>

            <Alert variant="info">
                <p className="mb-2 font-medium">{t('whatsappConnect.assetsChecklistTitle')}</p>
                <ol className="list-inside list-decimal space-y-1 text-blue-700">
                    <li>{t('whatsappConnect.assetsChecklist.step1')}</li>
                    <li>{t('whatsappConnect.assetsChecklist.step2')}</li>
                    <li>{t('whatsappConnect.assetsChecklist.step3')}</li>
                </ol>
            </Alert>

            <div className="flex flex-wrap gap-3">
                <Button
                    type="button"
                    onClick={handleLegacyConnect}
                    disabled={isConnecting || isReadOnly}
                >
                    {isConnecting ? t('whatsappConnect.connecting') : t('whatsappConnect.connectWithFacebook')}
                </Button>
            </div>
        </div>
    )

    const renderBspMigrationScreen = () => (
        <div className="space-y-6">
            <div>
                <h2 className={sectionTitleClass}>
                    {t('whatsappConnect.bspMigration.heading')}
                </h2>
                <p className={sectionBodyClass}>
                    {t('whatsappConnect.bspMigration.description')}
                </p>
            </div>

            <Alert variant="info">
                {t('whatsappConnect.bspMigration.banner')}
            </Alert>

            <div className="space-y-4 text-base leading-7 text-slate-700">
                <div>
                    <p className="font-semibold text-slate-900">
                        {t('whatsappConnect.bspMigration.requirements.twoStepTitle')}
                    </p>
                    <p>{t('whatsappConnect.bspMigration.requirements.twoStepBody')}</p>
                </div>

                <div>
                    <p className="font-semibold text-slate-900">
                        {t('whatsappConnect.bspMigration.requirements.verificationTitle')}
                    </p>
                    <p>{t('whatsappConnect.bspMigration.requirements.verificationBody')}</p>
                </div>

                <div>
                    <p className="font-semibold text-slate-900">
                        {t('whatsappConnect.bspMigration.requirements.popupsTitle')}
                    </p>
                    <p>{t('whatsappConnect.bspMigration.requirements.popupsBody')}</p>
                </div>
            </div>

            {!existingNumberSignupConfig && (
                <Alert variant="warning">
                    {t('whatsappConnect.existingEmbeddedSignupUnavailable')}
                </Alert>
            )}

            <div className="flex flex-wrap gap-3">
                <Button
                    type="button"
                    onClick={() => handleEmbeddedSignup('existing')}
                    disabled={isConnecting || !existingNumberSignupConfig || isReadOnly}
                >
                    {isConnecting ? t('whatsappConnect.connecting') : t('whatsappConnect.bspMigration.cta')}
                </Button>
            </div>
        </div>
    )

    const renderBusinessAppScreen = () => (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className={sectionTitleClass}>
                    {t('whatsappConnect.businessApp.heading')}
                </h2>
                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                    {t('whatsappConnect.businessApp.badge')}
                </span>
            </div>

            <p className={sectionBodyClass}>
                {t('whatsappConnect.businessApp.description')}
            </p>

            <Alert variant="info">
                <p className="mb-2 font-medium">{t('whatsappConnect.existingChecklistTitle')}</p>
                <ol className="list-inside list-decimal space-y-1 text-blue-700">
                    <li>{t('whatsappConnect.existingChecklist.step1')}</li>
                    <li>{t('whatsappConnect.existingChecklist.step2')}</li>
                    <li>{t('whatsappConnect.existingChecklist.step3')}</li>
                    <li>{t('whatsappConnect.existingChecklist.step4')}</li>
                </ol>
            </Alert>

            {!existingNumberSignupConfig && (
                <Alert variant="warning">
                    {t('whatsappConnect.existingEmbeddedSignupUnavailable')}
                </Alert>
            )}

            <div className="flex flex-wrap gap-3">
                <Button
                    type="button"
                    onClick={() => handleEmbeddedSignup('existing')}
                    disabled={isConnecting || !existingNumberSignupConfig || isReadOnly}
                >
                    {isConnecting ? t('whatsappConnect.connecting') : t('whatsappConnect.startEmbeddedSignup')}
                </Button>

                <Button type="button" variant="secondary" onClick={() => setSetupScreen('landing')}>
                    {t('whatsappConnect.back')}
                </Button>
            </div>
        </div>
    )

    const renderSetupScreen = () => {
        if (setupScreen === 'eligibility') return renderEligibilityScreen()
        if (setupScreen === 'existingApiChoice') return renderExistingApiChoiceScreen()
        if (setupScreen === 'metaAccess') return renderMetaAccessScreen()
        if (setupScreen === 'migrationWarning') return renderMigrationWarningScreen()
        if (setupScreen === 'connectReady') return renderConnectReadyScreen()
        if (setupScreen === 'legacyConnectReady') return renderLegacyConnectReadyScreen()
        if (setupScreen === 'bspMigration') return renderBspMigrationScreen()
        if (setupScreen === 'businessApp') return renderBusinessAppScreen()

        return renderLandingScreen()
    }

    const renderConnectedState = () => {
        const connectedCopy = getMetaChannelConnectedCopy('whatsapp', connectionState)
        const connectedDescription = t(connectedCopy.descriptionKey)
        const connectedBanner = t(connectedCopy.bannerKey, {
            name: channel?.name ?? t('types.whatsapp')
        })
        const bannerVariant = connectedCopy.bannerVariant

        return (
            <div className="space-y-6">
                <div>
                    <h2 className={sectionTitleClass}>
                        {t('onboarding.whatsapp.connectedHeading')}
                    </h2>
                    <p className={sectionLeadClass}>
                        {connectedDescription}
                    </p>
                </div>

                <Alert variant={bannerVariant}>
                    {connectedBanner}
                </Alert>

                <div className="flex flex-wrap gap-3">
                    <Button
                        onClick={() => setShowTemplateModal(true)}
                        disabled={isReadOnly}
                        variant="secondary"
                    >
                        <FileText size={16} className="mr-2" />
                        {t('templateTools.openAction')}
                    </Button>
                    <Button onClick={handleDebug} disabled={isReadOnly} variant="outline">
                        <Bug size={16} className="mr-2" />
                        {t('debug.tooltip')}
                    </Button>
                    <Button
                        onClick={() => setShowConfirm(true)}
                        disabled={isDisconnecting || isReadOnly}
                        variant="danger"
                    >
                        {t('actions.disconnect')}
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <>
            <ChannelOnboardingShell
                channelType="whatsapp"
                pageTitle={t('onboarding.pageTitle', { channel: t('types.whatsapp') })}
                backHref={getLocalizedHref(locale, '/settings/channels')}
                backLabel={t('onboarding.back')}
                onBack={!channel && setupScreen !== 'landing' ? handleWizardBack : undefined}
                banner={
                    <Alert
                        variant="info"
                        className="border-[#445266] bg-[#364152] text-slate-100"
                    >
                        <div className="flex items-center gap-2">
                            <AlertCircle size={18} className="shrink-0 text-[#6ea8ff]" />
                            <p className="text-sm leading-6">
                                {t('onboarding.whatsapp.supportBannerPrefix')}{' '}
                                <a
                                    href={getWhatsAppSupportChatUrl()}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-[#7fb2ff] hover:underline"
                                >
                                    {t('onboarding.whatsapp.supportBannerCta')}
                                </a>
                            </p>
                        </div>
                    </Alert>
                }
            >
                <div className="space-y-5">
                    {error && <Alert variant="error">{error}</Alert>}
                    {info && <Alert variant="info">{info}</Alert>}
                    {channel ? renderConnectedState() : renderSetupScreen()}
                </div>
            </ChannelOnboardingShell>

            {channel && (
                <WhatsAppTemplateModal
                    channelId={channel.id}
                    isOpen={showTemplateModal}
                    isReadOnly={isReadOnly}
                    onClose={() => setShowTemplateModal(false)}
                />
            )}

            {!isReadOnly && (
                <ConfirmDialog
                    isOpen={showConfirm}
                    title={t('confirmDisconnectTitle')}
                    description={t('confirmDisconnectDesc')}
                    confirmText={t('actions.disconnect')}
                    cancelText={t('actions.cancel')}
                    isDestructive
                    isLoading={isDisconnecting}
                    onConfirm={handleDisconnect}
                    onCancel={() => setShowConfirm(false)}
                />
            )}
        </>
    )
}
