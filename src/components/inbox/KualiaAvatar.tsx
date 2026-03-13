import Image from 'next/image'
import { cn } from '@/lib/utils'

interface KualiaAvatarProps {
    size?: 'sm' | 'md'
    className?: string
}

const KUALIA_ALT_TEXT = 'Kualia'

export function KualiaAvatar({ size = 'md', className }: KualiaAvatarProps) {
    const sizeClassName = size === 'sm'
        ? 'h-8 w-8'
        : 'h-10 w-10'
    const iconSizeClassName = size === 'sm'
        ? 'h-4 w-4'
        : 'h-5 w-5'

    return (
        <span
            className={cn(
                'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-700 text-white ring-1 ring-slate-700/40 shadow-[0_0_24px_rgba(15,23,42,0.24)]',
                sizeClassName,
                className
            )}
        >
            <span className="absolute inset-[2px] rounded-full bg-gradient-to-br from-white/10 to-transparent" aria-hidden />
            <Image
                src="/icon-white.svg"
                alt={KUALIA_ALT_TEXT}
                width={20}
                height={20}
                className={cn('relative z-[1]', iconSizeClassName)}
            />
        </span>
    )
}
