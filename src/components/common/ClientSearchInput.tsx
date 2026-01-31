'use client'

import { SearchInput } from '@/design'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

export function ClientSearchInput() {
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const { replace } = useRouter()
    const [inputValue, setInputValue] = useState(searchParams.get('q') || '')

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
        const handler = setTimeout(() => {
            debouncedSearch(inputValue)
        }, 300)

        return () => {
            clearTimeout(handler)
        }
    }, [inputValue, debouncedSearch])

    return (
        <SearchInput
            placeholder="Search skills..."
            value={inputValue}
            onChange={setInputValue}
        />
    )
}
