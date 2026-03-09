'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { MetaProviderBadge } from '@/components/channels/MetaProviderBadge'
import { getChannelPlatformIconSrc, type ChannelPlatformIconType } from '@/lib/channels/platform-icons'
import { PageHeader } from '@/design'

interface ChannelOnboardingShellResource {
    label: string
    href: string
}

interface ChannelOnboardingShellProps {
    channelType: ChannelPlatformIconType
    pageTitle: string
    sidebarTitle?: string
    sidebarDescription?: string
    iconSrc?: string
    backHref?: string
    backLabel: string
    resourcesTitle?: string
    resources?: ChannelOnboardingShellResource[]
    banner?: React.ReactNode
    children: React.ReactNode
    onBack?: () => void
}

function isMetaProductChannel(channelType: ChannelPlatformIconType) {
    return channelType === 'whatsapp' || channelType === 'instagram' || channelType === 'messenger'
}

export function ChannelOnboardingShell({
    channelType,
    pageTitle,
    backHref,
    backLabel,
    banner,
    children,
    onBack
}: ChannelOnboardingShellProps) {
    const t = useTranslations('Channels')

    return (
        <>
            <PageHeader title={pageTitle} />

            <div className="flex-1 overflow-auto bg-[#f6f7f9] p-4 lg:p-6">
                <div className="w-full max-w-4xl">
                    {banner && <div className="mb-4">{banner}</div>}

                    {onBack ? (
                        <button
                            type="button"
                            onClick={onBack}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
                        >
                            <ChevronLeft size={18} />
                            <span>{backLabel}</span>
                        </button>
                    ) : (
                        <Link
                            href={backHref ?? '#'}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
                        >
                            <ChevronLeft size={18} />
                            <span>{backLabel}</span>
                        </Link>
                    )}

                    <img
                        alt=""
                        aria-hidden
                        className="pointer-events-none mt-3 h-11 w-11 shrink-0 object-contain"
                        src={getChannelPlatformIconSrc(channelType)}
                    />
                    {isMetaProductChannel(channelType) && (
                        <MetaProviderBadge
                            label={t('trust.metaProvider')}
                            className="mt-2"
                            size="sm"
                        />
                    )}

                    <main className="mt-4">
                        {children}
                    </main>
                </div>
            </div>
        </>
    )
}
