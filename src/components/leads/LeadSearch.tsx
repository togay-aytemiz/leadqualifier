'use client'

import { Search } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

interface LeadSearchProps {
    value?: string
    onValueChange?: (value: string) => void
}

export function LeadSearch({ value, onValueChange }: LeadSearchProps = {}) {
    const t = useTranslations('leads')
    const router = useRouter()
    const searchParams = useSearchParams()
    const isControlled = typeof onValueChange === 'function'

    // Initialize with current URL param
    const [uncontrolledValue, setUncontrolledValue] = useState(searchParams.get('search') || '')
    const resolvedValue = isControlled ? value ?? '' : uncontrolledValue

    useEffect(() => {
        if (isControlled) {
            return
        }

        // Debounce search update
        const timer = setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString())
            const currentSearch = params.get('search') || ''

            // Only update if value changed
            if (uncontrolledValue !== currentSearch) {
                if (uncontrolledValue) {
                    params.set('search', uncontrolledValue)
                } else {
                    params.delete('search')
                }
                params.set('page', '1') // Reset to first page
                router.replace(`?${params.toString()}`)
            }
        }, 300)

        return () => clearTimeout(timer)
    }, [isControlled, uncontrolledValue, router, searchParams])

    return (
        <div className="relative w-44 sm:w-64">
            <Search aria-hidden={true} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
                value={resolvedValue}
                onChange={(e) => {
                    const nextValue = e.target.value
                    if (isControlled) {
                        onValueChange(nextValue)
                        return
                    }
                    setUncontrolledValue(nextValue)
                }}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchAction')}
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
        </div>
    )
}
