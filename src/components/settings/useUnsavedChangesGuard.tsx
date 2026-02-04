'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'

interface UnsavedChangesGuardOptions {
    isDirty: boolean
    onSave: () => Promise<boolean> | boolean
    onDiscard: () => void
    transformPendingHref?: (href: string) => string
}

function getCurrentUrl() {
    if (typeof window === 'undefined') return ''
    return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function isModifiedClick(event: MouseEvent) {
    return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0
}

export function useUnsavedChangesGuard({ isDirty, onSave, onDiscard, transformPendingHref }: UnsavedChangesGuardOptions) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const pendingHrefRef = useRef<string | null>(null)
    const currentUrlRef = useRef<string>(getCurrentUrl())

    const currentUrl = useMemo(() => {
        const search = searchParams?.toString()
        return `${pathname}${search ? `?${search}` : ''}`
    }, [pathname, searchParams])

    useEffect(() => {
        currentUrlRef.current = currentUrl
    }, [currentUrl])

    useEffect(() => {
        if (!isDirty) return
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            event.returnValue = ''
        }
        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [isDirty])

    useEffect(() => {
        const handleAnchorClick = (event: MouseEvent) => {
            if (!isDirty) return
            if (isModifiedClick(event)) return

            const target = event.target as HTMLElement
            const anchor = target?.closest('a')
            if (!anchor) return

            if (anchor.getAttribute('target') === '_blank') return
            if (anchor.hasAttribute('download')) return

            const href = anchor.getAttribute('href')
            if (!href || href.startsWith('#')) return

            const absoluteHref = anchor.href
            if (!absoluteHref) return

            const url = new URL(absoluteHref, window.location.origin)
            if (url.origin !== window.location.origin) return

            event.preventDefault()
            pendingHrefRef.current = `${url.pathname}${url.search}${url.hash}`
            setIsDialogOpen(true)
        }

        document.addEventListener('click', handleAnchorClick, true)
        return () => document.removeEventListener('click', handleAnchorClick, true)
    }, [isDirty])

    useEffect(() => {
        const handlePopState = () => {
            if (!isDirty) return
            const target = getCurrentUrl()
            history.pushState(null, '', currentUrlRef.current)
            pendingHrefRef.current = target
            setIsDialogOpen(true)
        }

        window.addEventListener('popstate', handlePopState)
        return () => window.removeEventListener('popstate', handlePopState)
    }, [isDirty])

    const closeDialog = useCallback(() => {
        setIsDialogOpen(false)
        pendingHrefRef.current = null
    }, [])

    const handleDiscard = useCallback(() => {
        onDiscard()
        const pending = pendingHrefRef.current
        closeDialog()
        if (pending) {
            router.push(pending)
        }
    }, [closeDialog, onDiscard, router])

    const handleSave = useCallback(async () => {
        setIsSaving(true)
        try {
            const result = await onSave()
            if (result === false) return
            const pending = pendingHrefRef.current
            closeDialog()
            if (pending) {
                const target = transformPendingHref ? transformPendingHref(pending) : pending
                router.push(target)
            }
        } finally {
            setIsSaving(false)
        }
    }, [closeDialog, onSave, router])

    return {
        isDialogOpen,
        isSaving,
        closeDialog,
        handleDiscard,
        handleSave
    }
}
