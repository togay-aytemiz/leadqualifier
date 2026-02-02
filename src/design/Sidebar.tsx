'use client'

import { cn } from '@/lib/utils'
import { ReactNode } from 'react'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'

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
            <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200 bg-white shrink-0">
                <div className="flex items-center gap-2 font-semibold text-gray-900">
                    <span>{title}</span>
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
    onClick?: () => void
    href?: string
    avatar?: string
}

export function SidebarItem({ icon, iconColor, label, active, count, onClick, href, avatar }: SidebarItemProps) {
    const content = (
        <div
            onClick={onClick}
            className={cn(
                "flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer transition-colors",
                active
                    ? "bg-white border border-gray-200 shadow-sm font-medium text-gray-900"
                    : "text-gray-600 hover:bg-gray-100/80"
            )}
        >
            <div className="flex items-center gap-2.5">
                {avatar ? (
                    <div className="h-5 w-5 rounded-full bg-gray-200 overflow-hidden">
                        <img alt="User" className="h-full w-full object-cover" src={avatar} />
                    </div>
                ) : icon ? (
                    <div className={cn("", iconColor || "text-gray-400")}>{icon}</div>
                ) : null}
                <span>{label}</span>
            </div>
            {count !== undefined && (
                <span className="text-xs text-gray-400">{count}</span>
            )}
        </div>
    )

    if (href) {
        return <Link href={href}>{content}</Link>
    }

    return content
}
