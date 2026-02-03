'use client'

import { SearchInput } from '@/design'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState, useRef } from 'react'
import { useTranslations } from 'next-intl'

interface ClientSearchInputProps {
    placeholder?: string
}

export function ClientSearchInput({ placeholder }: ClientSearchInputProps) {
    const t = useTranslations('common')
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const { replace } = useRouter()
    const [inputValue, setInputValue] = useState(searchParams.get('q') || '')

    const isMounted = useRef(false)

    // Debounce function
    const debouncedSearch = useCallback((term: string) => {
        const params = new URLSearchParams(searchParams)
        const currentQ = params.get('q') || ''

        if (term === currentQ) return

        if (term) {
            params.set('q', term)
        } else {
            params.delete('q')
        }
        replace(`${pathname}?${params.toString()}`)
    }, [searchParams, pathname, replace])

    useEffect(() => {
        // Skip the first run on mount
        if (!isMounted.current) {
            isMounted.current = true
            return
        }

        const handler = setTimeout(() => {
            debouncedSearch(inputValue)
        }, 300)

        return () => {
            clearTimeout(handler)
        }
    }, [inputValue, debouncedSearch])

    return (
        <SearchInput
            placeholder={placeholder ?? t('search')}
            value={inputValue}
            onChange={setInputValue}
        />
    )
}
