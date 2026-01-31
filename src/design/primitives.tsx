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

// --- DataTable ---
interface DataTableProps {
    children: React.ReactNode
    className?: string
}

export function DataTable({ children, className }: DataTableProps) {
    return (
        <div className={cn("bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm", className)}>
            <table className="w-full text-left text-sm text-gray-600">
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
        <div className={cn("relative w-64", className)}>
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-[18px]">search</span>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange?.(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm placeholder-gray-400"
                placeholder={placeholder}
            />
        </div>
    )
}

// --- EmptyState ---
interface EmptyStateProps {
    icon: string
    title: string
    description?: string
    action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
    return (
        <div className="p-12 text-center">
            <span className="material-symbols-outlined text-gray-300 text-5xl mb-4 block">{icon}</span>
            <p className="text-lg font-medium text-gray-900 mb-1">{title}</p>
            {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
            {action}
        </div>
    )
}

// --- StatCard ---
interface StatCardProps {
    icon: string
    iconColor?: 'blue' | 'purple' | 'green' | 'orange' | 'red'
    title: string
    value: string | number
    href?: string
    className?: string
}

export function StatCard({ icon, iconColor = 'blue', title, value, href, className }: StatCardProps) {
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
                    <span className={cn("material-symbols-outlined", colors.text)}>{icon}</span>
                </div>
                {href && (
                    <span className={cn("material-symbols-outlined text-gray-300 transition-colors", colors.hover)}>arrow_outward</span>
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
                    "w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm",
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
                    "w-full px-4 py-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm",
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
    children: React.ReactNode
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-white">
                    <h3 className="font-bold text-gray-900">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    )
}

// --- IconButton ---
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: string
    size?: 'sm' | 'md'
    variant?: 'ghost' | 'default'
}

export function IconButton({ icon, size = 'md', variant = 'ghost', className, ...props }: IconButtonProps) {
    const sizeClass = size === 'sm' ? 'p-1' : 'p-1.5'
    const iconSize = size === 'sm' ? 'text-[18px]' : 'text-[20px]'
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
            <span className={cn("material-symbols-outlined", iconSize)}>{icon}</span>
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
