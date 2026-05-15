'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'

interface AdminBillingSubmitButtonProps {
    children: ReactNode
    variant?: 'primary' | 'danger'
}

export function AdminBillingSubmitButton({
    children,
    variant = 'primary'
}: AdminBillingSubmitButtonProps) {
    const { pending } = useFormStatus()
    const tAdmin = useTranslations('admin')
    const toneClassName = variant === 'danger'
        ? 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300'
        : 'bg-[#242A40] hover:bg-[#1f2437] disabled:bg-gray-300'

    return (
        <button
            type="submit"
            className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-white transition disabled:cursor-not-allowed ${toneClassName}`}
            disabled={pending}
            aria-busy={pending}
        >
            {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            {pending ? tAdmin('organizationDetail.manualActions.submitting') : children}
        </button>
    )
}
