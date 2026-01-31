import { ReactNode } from 'react'

interface InboxLayoutProps {
    children: ReactNode
}

export function InboxLayout({ children }: InboxLayoutProps) {
    return (
        <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-white border border-gray-200 rounded-xl shadow-sm">
            {children}
        </div>
    )
}
