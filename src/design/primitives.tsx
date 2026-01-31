import { cn } from '@/lib/utils'

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
    const sizeClass = size === 'sm' ? "h-6 w-6 text-[10px]" : size === 'lg' ? "h-12 w-12 text-sm" : "h-8 w-8 text-xs"
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
    title: string
    actions?: React.ReactNode
    breadcrumb?: React.ReactNode
}

export function PageHeader({ title, actions, breadcrumb }: PageHeaderProps) {
    return (
        <div className="h-16 border-b border-gray-200 flex items-center justify-between px-8 bg-white shrink-0 sticky top-0 z-10">
            <div className="flex items-center gap-3">
                {breadcrumb}
                <h2 className="font-bold text-gray-900 text-xl">{title}</h2>
            </div>
            <div className="flex gap-3">
                {actions}
            </div>
        </div>
    )
}
