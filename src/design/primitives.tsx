'use client'

import { cn } from '@/lib/utils'
import { Search, X, ArrowUpRight, TriangleAlert, ArrowLeft } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { isSettingsDetailPath, SETTINGS_MOBILE_BACK_EVENT } from '@/components/settings/mobilePaneState'

// --- Button ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger'
    size?: 'sm' | 'md' | 'icon'
    children: React.ReactNode
}

export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
    const variants = {
        primary: "bg-blue-500 hover:bg-blue-600 text-white border border-transparent shadow-sm",
        secondary: "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 shadow-sm",
        ghost: "bg-transparent text-gray-600 hover:bg-gray-50 border border-transparent",
        outline: "bg-transparent text-gray-700 border border-gray-200 hover:bg-gray-50",
        danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50"
    }
    const sizes = {
        sm: "h-8 px-3 text-xs rounded-lg",
        md: "h-9 px-4 text-sm rounded-lg",
        icon: "h-9 w-9 p-0 rounded-lg flex items-center justify-center",
    }
    return (
        <button
            className={cn(
                "inline-flex items-center justify-center font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                variants[variant],
                sizes[size],
                className
            )}
            {...props}
        >
            {children}
        </button>
    )
}

// --- Badge ---
interface BadgeProps {
    children: React.ReactNode
    variant?: 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'purple'
}

export function Badge({ children, variant = 'neutral' }: BadgeProps) {
    const styles = {
        neutral: "bg-gray-100 text-gray-700 border-gray-200",
        success: "bg-green-50 text-green-700 border-green-200",
        warning: "bg-yellow-50 text-yellow-800 border-yellow-200",
        error: "bg-red-50 text-red-700 border-red-200",
        info: "bg-blue-50 text-blue-700 border-blue-200",
        purple: "bg-purple-50 text-purple-700 border-purple-200",
    }
    return (
        <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border", styles[variant])}>
            {children}
        </span>
    )
}

// --- Avatar ---
interface AvatarProps {
    name: string
    size?: 'sm' | 'md' | 'lg'
    className?: string
}

export function Avatar({ name, size = 'md', className }: AvatarProps) {
    const sizeClass = size === 'sm' ? "h-8 w-8 text-[11px]" : size === 'lg' ? "h-12 w-12 text-sm" : "h-8 w-8 text-xs"
    const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
    const colors = [
        "bg-red-100 text-red-600",
        "bg-orange-100 text-orange-600",
        "bg-amber-100 text-amber-600",
        "bg-green-100 text-green-600",
        "bg-blue-100 text-blue-600",
        "bg-indigo-100 text-indigo-600",
        "bg-purple-100 text-purple-600",
        "bg-pink-100 text-pink-600",
    ]
    const colorClass = colors[name.length % colors.length]

    return (
        <div className={cn(
            "flex shrink-0 items-center justify-center rounded-full font-bold border border-white shadow-sm ring-1 ring-gray-100",
            colorClass,
            sizeClass,
            className
        )}>
            {initials}
        </div>
    )
}

// --- PageHeader ---
interface PageHeaderProps {
    title: React.ReactNode
    actions?: React.ReactNode
    breadcrumb?: React.ReactNode
}

export function PageHeader({ title, actions, breadcrumb }: PageHeaderProps) {
    const pathname = usePathname()
    const isMobileSettingsDetail = isSettingsDetailPath(pathname)
    const mobileBackLabel = typeof title === 'string' ? title : 'Back'

    const handleMobileSettingsBack = () => {
        if (typeof window === 'undefined') return
        window.dispatchEvent(new Event(SETTINGS_MOBILE_BACK_EVENT))
    }

    return (
        <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0 sticky top-0 z-10">
            <div className="flex items-center gap-3 min-w-0">
                {isMobileSettingsDetail && (
                    <button
                        type="button"
                        onClick={handleMobileSettingsBack}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 lg:hidden shrink-0"
                        aria-label={mobileBackLabel}
                    >
                        <ArrowLeft size={18} />
                    </button>
                )}
                {breadcrumb}
                <h2 className="font-bold text-gray-900 text-lg">{title}</h2>
            </div>
            <div className="flex gap-3">
                {actions}
            </div>
        </div>
    )
}

// --- DataTable ---
interface DataTableProps {
    children: React.ReactNode
    className?: string
}

export function DataTable({ children, className }: DataTableProps) {
    return (
        <div className={cn("bg-white rounded-xl border border-gray-200 overflow-x-auto overflow-y-hidden shadow-sm", className)}>
            <table className="w-max min-w-full text-left text-sm text-gray-600">
                {children}
            </table>
        </div>
    )
}

interface TableHeadProps {
    columns: string[]
    className?: string
}

export function TableHead({ columns, className }: TableHeadProps) {
    return (
        <thead className={cn("bg-white text-xs uppercase text-gray-500 font-semibold border-b border-gray-200", className)}>
            <tr>
                {columns.map((col, i) => (
                    <th key={i} className="px-6 py-3">{col}</th>
                ))}
            </tr>
        </thead>
    )
}

interface TableBodyProps {
    children: React.ReactNode
}

export function TableBody({ children }: TableBodyProps) {
    return <tbody className="divide-y divide-gray-100">{children}</tbody>
}

interface TableRowProps {
    children: React.ReactNode
    onClick?: () => void
    className?: string
}

export function TableRow({ children, onClick, className }: TableRowProps) {
    return (
        <tr
            onClick={onClick}
            className={cn("hover:bg-gray-50 transition-colors", onClick && "cursor-pointer", className)}
        >
            {children}
        </tr>
    )
}

interface TableCellProps {
    children: React.ReactNode
    className?: string
    align?: 'left' | 'right' | 'center'
}

export function TableCell({ children, className, align = 'left' }: TableCellProps) {
    const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''
    return <td className={cn("px-6 py-4", alignClass, className)}>{children}</td>
}

// --- TableToolbar ---
interface TableToolbarProps {
    left?: React.ReactNode
    right?: React.ReactNode
}

export function TableToolbar({ left, right }: TableToolbarProps) {
    return (
        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 text-sm text-gray-500 flex items-center justify-between">
            {left}
            {right}
        </div>
    )
}

// --- SearchInput ---
interface SearchInputProps {
    placeholder?: string
    value?: string
    onChange?: (value: string) => void
    className?: string
}

export function SearchInput({ placeholder = "Search...", value, onChange, className }: SearchInputProps) {
    return (
        <div className={cn("relative w-full", className)}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange?.(e.target.value)}
                className="w-full h-10 pl-10 pr-4 bg-gray-100 text-gray-900 border-none rounded-lg text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 shadow-none placeholder-gray-500 transition-all"
                placeholder={placeholder}
            />
        </div>
    )
}

// --- EmptyState ---
interface EmptyStateProps {
    icon: React.ElementType
    title: string
    description?: string
    action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center mb-4">
                <Icon className="text-gray-300" size={48} />
            </div>
            <p className="text-lg font-medium text-gray-900 mb-1">{title}</p>
            {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
            {action}
        </div>
    )
}

// --- StatCard ---
interface StatCardProps {
    icon: React.ElementType
    iconColor?: 'blue' | 'purple' | 'green' | 'orange' | 'red'
    title: string
    value: string | number
    href?: string
    className?: string
}

export function StatCard({ icon: Icon, iconColor = 'blue', title, value, href, className }: StatCardProps) {
    const colorMap = {
        blue: { bg: 'bg-blue-50', text: 'text-blue-500', hover: 'group-hover:text-blue-500' },
        purple: { bg: 'bg-purple-50', text: 'text-purple-500', hover: 'group-hover:text-purple-500' },
        green: { bg: 'bg-green-50', text: 'text-green-500', hover: 'group-hover:text-green-500' },
        orange: { bg: 'bg-orange-50', text: 'text-orange-500', hover: 'group-hover:text-orange-500' },
        red: { bg: 'bg-red-50', text: 'text-red-500', hover: 'group-hover:text-red-500' },
    }
    const colors = colorMap[iconColor]

    const content = (
        <>
            <div className="flex items-center justify-between mb-4">
                <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", colors.bg)}>
                    <Icon className={cn("", colors.text)} size={20} />
                </div>
                {href && (
                    <ArrowUpRight className={cn("text-gray-300 transition-colors", colors.hover)} size={20} />
                )}
            </div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">{title}</h3>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
        </>
    )

    const baseClass = cn(
        "bg-white rounded-xl p-6 border border-gray-200 shadow-sm",
        href && "hover:shadow-md transition-shadow group",
        className
    )

    if (href) {
        return <a href={href} className={baseClass}>{content}</a>
    }
    return <div className={baseClass}>{content}</div>
}

// --- StatusDot ---
interface StatusDotProps {
    active: boolean
    label?: string
    className?: string
}

export function StatusDot({ active, label, className }: StatusDotProps) {
    return (
        <div className={cn("flex items-center gap-2", className)}>
            <div className={cn("h-2.5 w-2.5 rounded-full", active ? "bg-green-500" : "bg-gray-300")} />
            {label && <span className="text-gray-700">{label}</span>}
        </div>
    )
}

// --- Input ---
interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
    label?: string
    error?: string
    onChange?: (value: string) => void
}

export function Input({ label, error, className, onChange, ...props }: InputProps) {
    return (
        <div>
            {label && <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase">{label}</label>}
            <input
                {...props}
                onChange={(e) => onChange?.(e.target.value)}
                className={cn(
                    "w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm bg-white text-gray-900",
                    error ? "border-red-300" : "border-gray-300",
                    className
                )}
            />
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </div>
    )
}

// --- TextArea ---
interface TextAreaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
    label?: string
    error?: string
    onChange?: (value: string) => void
}

export function TextArea({ label, error, className, onChange, ...props }: TextAreaProps) {
    return (
        <div>
            {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
            <textarea
                {...props}
                onChange={(e) => onChange?.(e.target.value)}
                className={cn(
                    "w-full px-4 py-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm bg-white text-gray-900",
                    error ? "border-red-300" : "border-gray-300",
                    className
                )}
            />
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </div>
    )
}

// --- Modal ---
interface ModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    headerActions?: React.ReactNode
    children: React.ReactNode
}

export function Modal({ isOpen, onClose, title, headerActions, children }: ModalProps) {
    const [shouldRender, setShouldRender] = useState(isOpen)
    const [isVisible, setIsVisible] = useState(isOpen)

    useEffect(() => {
        let closeTimer: ReturnType<typeof setTimeout> | null = null
        let openFrame: number | null = null

        if (isOpen) {
            setShouldRender(true)
            openFrame = window.requestAnimationFrame(() => {
                setIsVisible(true)
            })
        } else {
            setIsVisible(false)
            closeTimer = setTimeout(() => {
                setShouldRender(false)
            }, 220)
        }

        return () => {
            if (closeTimer) clearTimeout(closeTimer)
            if (openFrame !== null) window.cancelAnimationFrame(openFrame)
        }
    }, [isOpen])

    if (!shouldRender) return null

    const content = (
        <div
            className={cn(
                "fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm transition-opacity duration-200",
                isVisible ? "opacity-100" : "opacity-0"
            )}
            onClick={(e) => e.stopPropagation()}
        >
            <div
                className={cn(
                    "bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden pointer-events-auto transition-all duration-200",
                    isVisible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.98]"
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-white">
                    <h3 className="font-bold text-gray-900">{title}</h3>
                    <div className="flex items-center gap-1">
                        {headerActions}
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    )

    if (typeof document === 'undefined') return content

    return createPortal(content, document.body)
}

// --- IconButton ---
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: React.ElementType
    size?: 'sm' | 'md'
    variant?: 'ghost' | 'default'
}

export function IconButton({ icon: Icon, size = 'md', variant = 'ghost', className, ...props }: IconButtonProps) {
    const sizeClass = size === 'sm' ? 'p-1' : 'p-1.5'
    const iconSize = size === 'sm' ? 18 : 20
    const variantClass = variant === 'ghost'
        ? 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
        : 'text-gray-600 bg-gray-100 hover:bg-gray-200'

    return (
        <button
            {...props}
            className={cn(
                "rounded transition-colors",
                sizeClass,
                variantClass,
                className
            )}
        >
            <Icon size={iconSize} />
        </button>
    )
}

// --- Alert ---
interface AlertProps {
    variant?: 'error' | 'warning' | 'info' | 'success'
    children: React.ReactNode
    className?: string
}

export function Alert({ variant = 'error', children, className }: AlertProps) {
    const styles = {
        error: 'bg-red-50 text-red-700 border-red-200',
        warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
        info: 'bg-blue-50 text-blue-700 border-blue-200',
        success: 'bg-green-50 text-green-700 border-green-200',
    }

    return (
        <div className={cn("rounded-lg p-4 text-sm border", styles[variant], className)}>
            {children}
        </div>
    )
}

// --- Skeleton ---
interface SkeletonProps {
    className?: string
}

export function Skeleton({ className }: SkeletonProps) {
    return (
        <div className={cn("animate-pulse bg-gray-200 rounded", className)} />
    )
}

// --- PageSkeleton ---
export function PageSkeleton() {
    return (
        <div className="flex-1 flex flex-col min-w-0 bg-white">
            <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
                <Skeleton className="h-6 w-32" />
                <div className="flex gap-2">
                    <Skeleton className="h-9 w-24" />
                </div>
            </div>
            <div className="p-6 space-y-6">
                <div className="grid gap-6 md:grid-cols-3">
                    <Skeleton className="h-32 w-full rounded-xl" />
                    <Skeleton className="h-32 w-full rounded-xl" />
                    <Skeleton className="h-32 w-full rounded-xl" />
                </div>
                <Skeleton className="h-[400px] w-full rounded-xl" />
            </div>
        </div>
    )
}

// --- ConfirmDialog ---
interface ConfirmDialogProps {
    isOpen: boolean
    title: string
    description: string
    confirmText?: string
    cancelText?: string
    isDestructive?: boolean
    isLoading?: boolean
    onConfirm: () => void
    onCancel: () => void
}

export function ConfirmDialog({
    isOpen,
    title,
    description,
    confirmText = "Confirm",
    cancelText = "Cancel",
    isDestructive = false,
    isLoading = false,
    onConfirm,
    onCancel
}: ConfirmDialogProps) {
    if (!isOpen) return null

    const content = (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[1100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-200 p-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
                <div className={cn("w-12 h-12 rounded-full flex items-center justify-center mx-auto", isDestructive ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600")}>
                    <TriangleAlert size={24} />
                </div>
                <div className="space-y-1">
                    <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                    <p className="text-sm text-gray-500">
                        {description}
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                        onClick={onCancel}
                        disabled={isLoading}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={cn(
                            "px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2",
                            isDestructive ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                        )}
                    >
                        {isLoading ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                {confirmText}
                            </>
                        ) : confirmText}
                    </button>
                </div>
            </div>
        </div>
    )

    if (typeof document === 'undefined') return content

    return createPortal(content, document.body)
}
