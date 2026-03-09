import { RiMetaFill } from 'react-icons/ri'

import { cn } from '@/lib/utils'

interface MetaProviderBadgeProps {
    label: string
    className?: string
    size?: 'sm' | 'md'
}

export function MetaProviderBadge({
    label,
    className,
    size = 'sm'
}: MetaProviderBadgeProps) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full border border-slate-200 bg-white pl-2.5 pr-3 py-1.5 shadow-[0_1px_1px_rgba(15,23,42,0.04)]',
                size === 'sm' ? 'gap-1.5' : 'gap-2 pl-3 pr-3.5 py-2',
                className
            )}
        >
            <RiMetaFill
                aria-hidden="true"
                className={cn(
                    'text-[#0866FF]',
                    size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
                )}
            />
            <span
                className={cn(
                    'font-semibold tracking-[-0.01em] text-slate-800',
                    size === 'sm' ? 'text-[11px]' : 'text-xs'
                )}
            >
                {label}
            </span>
        </span>
    )
}
