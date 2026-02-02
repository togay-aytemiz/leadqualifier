'use client'

import { useState } from 'react'
import {
    Plus,
    FileText,
    Upload,
    Github,
    Globe,
    FileCode,
    ChevronDown
} from 'lucide-react'
import { Button } from '@/design'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import * as Popover from '@radix-ui/react-popover'
import { cn } from '@/lib/utils'

interface NewContentButtonProps {
    collectionId?: string | null
    className?: string
    align?: 'start' | 'center' | 'end'
    side?: 'top' | 'right' | 'bottom' | 'left'
}

export function NewContentButton({ collectionId, className }: NewContentButtonProps) {
    const t = useTranslations('knowledge')
    const router = useRouter()
    const [open, setOpen] = useState(false)

    const options = [
        {
            icon: <FileText size={16} className="text-blue-500" />,
            label: 'Freeform text',
            onClick: () => router.push(collectionId ? `/knowledge/create?collectionId=${collectionId}` : '/knowledge/create')
        },
        {
            icon: <Upload size={16} className="text-red-500" />,
            label: 'PDF Upload',
            onClick: () => { }, // TODO: Implement
            badge: null
        },
        {
            icon: <Github size={16} className="text-gray-700" />,
            label: 'Github Repository',
            onClick: () => { }, // TODO: Implement
            badge: 'Yakında'
        },
        {
            icon: <FileCode size={16} className="text-gray-500" />, // Using FileCode for Notion as placeholder
            label: 'Notion',
            onClick: () => { }, // TODO: Implement
            badge: 'Yakında'
        },
        {
            icon: <Globe size={16} className="text-gray-400" />,
            label: 'Website URL',
            onClick: () => { }, // TODO: Implement
            badge: 'Yakında'
        }
    ]

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <Button className={className}>
                    <Plus size={16} className="mr-2" />
                    {t('newContent')}
                    <ChevronDown size={14} className="ml-1 opacity-70" />
                </Button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="bg-white rounded-lg shadow-xl border border-gray-200 w-64 p-1 z-50 animate-in fade-in zoom-in-95 duration-200"
                    sideOffset={5}
                    align="end"
                >
                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100 mb-1">
                        Select Source Type
                    </div>
                    <div className="space-y-0.5">
                        {options.map((opt, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    opt.onClick()
                                    setOpen(false)
                                }}
                                className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors text-left"
                            >
                                <div className="flex items-center gap-3">
                                    {opt.icon}
                                    <span>{opt.label}</span>
                                </div>
                                {opt.badge && (
                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                                        {opt.badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}
