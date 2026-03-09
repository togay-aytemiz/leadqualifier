'use client'

import { useLocale, useTranslations } from 'next-intl'

import { ChannelOnboardingShell } from '@/components/channels/ChannelOnboardingShell'
import type { ChannelCardType } from '@/components/channels/channelCatalog'
import { Alert, Button } from '@/design'
import type { Channel } from '@/types/database'

interface ChannelPlaceholderOnboardingPageProps {
    type: ChannelCardType
    channel?: Channel
}

function getLocalizedHref(locale: string, href: string) {
    if (locale === 'tr') return href
    return `/${locale}${href}`
}

export function ChannelPlaceholderOnboardingPage({
    type,
    channel
}: ChannelPlaceholderOnboardingPageProps) {
    const t = useTranslations('Channels')
    const locale = useLocale()
    const sectionTitleClass = 'text-lg font-bold leading-tight text-slate-900'
    const sectionLeadClass = 'mt-2.5 max-w-3xl text-sm leading-6 text-slate-600'

    const isConnected = Boolean(channel)

    return (
        <ChannelOnboardingShell
            pageTitle={t('onboarding.pageTitle', { channel: t(`types.${type}`) })}
            backHref={getLocalizedHref(locale, '/settings/channels')}
            backLabel={t('onboarding.back')}
        >
            <div className="space-y-6">
                <div>
                    <h2 className={sectionTitleClass}>
                        {t(`onboarding.${type}.heading`)}
                    </h2>
                    <p className={sectionLeadClass}>
                        {t(`onboarding.${type}.subheading`)}
                    </p>
                </div>

                {isConnected ? (
                    <Alert variant="success">
                        {t('onboarding.placeholder.connectedBanner', { channel: channel?.name ?? t(`types.${type}`) })}
                    </Alert>
                ) : (
                    <Alert variant="info">
                        {t('onboarding.placeholder.comingSoon')}
                    </Alert>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 lg:p-5">
                    <p className="text-sm leading-6 text-slate-600">
                        {t(`onboarding.${type}.body`)}
                    </p>

                    <div className="mt-4">
                        <Button type="button" variant="secondary" disabled>
                            {t('actions.comingSoon')}
                        </Button>
                    </div>
                </div>
            </div>
        </ChannelOnboardingShell>
    )
}
