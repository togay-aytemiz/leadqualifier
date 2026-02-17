'use client'

import { cn } from '@/lib/utils'
import { ReactNode } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'

// --- Sidebar Container ---
interface SidebarProps {
    title: string
    children: ReactNode
    actions?: ReactNode
    footer?: ReactNode
}

export function Sidebar({ title, children, actions, footer }: SidebarProps) {
    return (
        <div className="w-64 bg-gray-50/50 flex flex-col h-full border-r border-gray-200 shrink-0 font-sans">
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-6 border-b border-gray-200 bg-gray-50/50 shrink-0">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-gray-900">{title}</h2>
                </div>
                {actions && actions}
            </div>

            {/* Content */}
            <div className="p-3 space-y-6 overflow-y-auto flex-1">
                {children}
            </div>

            {/* Footer */}
            {footer && (
                <div className="shrink-0">
                    {footer}
                </div>
            )}
        </div>
    )
}

// --- Sidebar Group ---
interface SidebarGroupProps {
    title?: string
    children: ReactNode
}

export function SidebarGroup({ title, children }: SidebarGroupProps) {
    return (
        <div className="space-y-1">
            {title && (
                <div className="px-3 text-xs font-semibold text-gray-500 mb-2">
                    {title}
                </div>
            )}
            {children}
        </div>
    )
}

// --- Sidebar Item ---
interface SidebarItemProps {
    icon?: React.ReactNode
    iconColor?: string
    label: string
    active?: boolean
    count?: string | number
    indicator?: boolean
    onClick?: () => void
    href?: string
    avatar?: string
    disabled?: boolean
    disabledLabel?: string
}

export function SidebarItem({
    icon,
    iconColor,
    label,
    active,
    count,
    indicator,
    onClick,
    href,
    avatar,
    disabled = false,
    disabledLabel
}: SidebarItemProps) {
    const resolvedLabel = disabled && disabledLabel
        ? `${label} (${disabledLabel})`
        : label
    const content = (
        <div
            onClick={disabled ? undefined : onClick}
            aria-disabled={disabled ? true : undefined}
            className={cn(
                "flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                active
                    ? "bg-white border border-gray-200 shadow-sm font-medium text-gray-900"
                    : disabled
                        ? "bg-gray-100/70 text-gray-400 cursor-not-allowed"
                        : "text-gray-600 hover:bg-gray-100/80 cursor-pointer"
            )}
        >
            <div className="flex items-center gap-2.5">
                {avatar ? (
                    <div className="h-5 w-5 rounded-full bg-gray-200 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt={label} className="h-full w-full object-cover" src={avatar} />
                    </div>
                ) : icon ? (
                    <div className={cn("", disabled ? "text-gray-400" : (iconColor || "text-gray-400"))}>{icon}</div>
                ) : null}
                <span>{label}</span>
            </div>
            {disabled ? (
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-white p-1 text-gray-400">
                    <Lock size={10} aria-hidden />
                    <span className="sr-only">{resolvedLabel}</span>
                </span>
            ) : indicator ? (
                <span className="h-2 w-2 rounded-full bg-[#242A40]" aria-hidden />
            ) : count !== undefined ? (
                <span className="text-xs text-gray-400">{count}</span>
            ) : null}
        </div>
    )

    if (href && !disabled) {
        return (
            <Link href={href} title={resolvedLabel} aria-label={resolvedLabel}>
                {content}
            </Link>
        )
    }

    return content
}
