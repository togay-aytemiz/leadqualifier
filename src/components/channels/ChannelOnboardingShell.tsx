import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { PageHeader } from '@/design'

interface ChannelOnboardingShellResource {
    label: string
    href: string
}

interface ChannelOnboardingShellProps {
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

export function ChannelOnboardingShell({
    pageTitle,
    backHref,
    backLabel,
    banner,
    children,
    onBack
}: ChannelOnboardingShellProps) {
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

                    <main className="mt-5">
                        {children}
                    </main>
                </div>
            </div>
        </>
    )
}
