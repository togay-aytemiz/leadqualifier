'use client'

import { useEffect, useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

import { ChannelCard } from '@/components/channels/ChannelCard'
import { getChannelCardConfigs, getChannelsListLayoutClasses } from '@/components/channels/channelCards'
import type { Channel } from '@/types/database'

interface ChannelsListProps {
    channels: Channel[]
    organizationId: string
    showDescription?: boolean
    isReadOnly?: boolean
    isChannelConnectionLocked?: boolean
}

function getLocalizedHref(locale: string, href: string) {
    if (locale === 'tr') return href
    return `/${locale}${href}`
}

export function ChannelsList({
    channels,
    showDescription = true,
    isReadOnly = false,
    isChannelConnectionLocked = false
}: ChannelsListProps) {
    const t = useTranslations('Channels')
    const locale = useLocale()
    const router = useRouter()

    const channelCards = useMemo(() => getChannelCardConfigs(channels), [channels])
    const channelPrefetchHrefs = useMemo(
        () =>
            channelCards
                .filter((card) => !isChannelConnectionLocked || Boolean(card.channel))
                .map((card) => getLocalizedHref(locale, card.href)),
        [channelCards, isChannelConnectionLocked, locale]
    )
    const channelsListLayoutClasses = getChannelsListLayoutClasses()

    useEffect(() => {
        channelPrefetchHrefs.forEach((href) => {
            router.prefetch(href)
        })
    }, [channelPrefetchHrefs, router])

    return (
        <div>
            {showDescription && <p className="mb-8 text-gray-500">{t('description')}</p>}

            <div className={channelsListLayoutClasses}>
                {channelCards.map((card) => (
                    <ChannelCard
                        key={card.type}
                        type={card.type}
                        channel={card.channel}
                        tone={card.tone}
                        badge={card.badge}
                        onConnect={() => {
                            const href = getLocalizedHref(locale, card.href)
                            router.push(href)
                        }}
                        isComingSoon={card.isComingSoon}
                        isReadOnly={isReadOnly}
                        isConnectLocked={!card.channel && isChannelConnectionLocked}
                    />
                ))}
            </div>
        </div>
    )
}
