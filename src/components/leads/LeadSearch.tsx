'use client'

import { Search } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

export function LeadSearch() {
    const t = useTranslations('leads')
    const router = useRouter()
    const searchParams = useSearchParams()

    // Initialize with current URL param
    const [value, setValue] = useState(searchParams.get('search') || '')

    useEffect(() => {
        // Debounce search update
        const timer = setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString())
            const currentSearch = params.get('search') || ''

            // Only update if value changed
            if (value !== currentSearch) {
                if (value) {
                    params.set('search', value)
                } else {
                    params.delete('search')
                }
                params.set('page', '1') // Reset to first page
                router.replace(`?${params.toString()}`)
            }
        }, 300)

        return () => clearTimeout(timer)
    }, [value, router, searchParams])

    return (
        <div className="relative w-44 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
        </div>
    )
}
