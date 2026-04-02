'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { clearPlansStatusSearch, hasPlansStatusSearch } from './status-query'

interface PlansStatusBannerProps {
    className: string
    dismissLabel: string
    title: string
    description: string
}

export function PlansStatusBanner({
    className,
    dismissLabel,
    title,
    description
}: PlansStatusBannerProps) {
    const pathname = usePathname()
    const router = useRouter()
    const searchParams = useSearchParams()

    useEffect(() => {
        const currentSearch = new URLSearchParams(searchParams.toString())
        if (!hasPlansStatusSearch(currentSearch)) return

        const nextQuery = clearPlansStatusSearch(currentSearch)
        router.replace(`${pathname}${nextQuery}`)
    }, [pathname, router, searchParams])

    const handleDismiss = () => {
        const nextQuery = clearPlansStatusSearch(new URLSearchParams(searchParams.toString()))
        router.replace(`${pathname}${nextQuery}`)
    }

    return (
        <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${className}`}>
            <p>
                {title}
                {' — '}
                {description}
            </p>
            <button
                type="button"
                onClick={handleDismiss}
                aria-label={dismissLabel}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition hover:bg-black/5"
            >
                <X size={14} />
            </button>
        </div>
    )
}
