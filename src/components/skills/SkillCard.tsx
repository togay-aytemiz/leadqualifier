'use client'

import { useTranslations } from 'next-intl'
import type { Skill } from '@/types/database'
import { toggleSkill, deleteSkill } from '@/lib/skills/actions'
import { Link } from '@/i18n/navigation'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

interface SkillCardProps {
    skill: Skill
}

export function SkillCard({ skill }: SkillCardProps) {
    const t = useTranslations('skills')
    const tc = useTranslations('common')
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [isDeleting, setIsDeleting] = useState(false)

    const handleToggle = () => {
        startTransition(async () => {
            await toggleSkill(skill.id, !skill.enabled)
            router.refresh()
        })
    }

    const handleDelete = async () => {
        if (!confirm(t('deleteConfirm'))) return
        setIsDeleting(true)
        try {
            await deleteSkill(skill.id)
            router.refresh()
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <div className="rounded-xl bg-zinc-800/50 p-6 border border-zinc-700/50">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-white">{skill.title}</h3>
                        <span
                            className={`px-2 py-0.5 text-xs font-medium rounded-full ${skill.enabled
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-zinc-600/50 text-zinc-400'
                                }`}
                        >
                            {skill.enabled ? tc('enabled') : tc('disabled')}
                        </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-400 line-clamp-2">{skill.response_text}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {skill.trigger_examples.slice(0, 3).map((trigger, i) => (
                            <span
                                key={i}
                                className="px-2 py-1 text-xs bg-zinc-700/50 text-zinc-300 rounded-md"
                            >
                                {trigger}
                            </span>
                        ))}
                        {skill.trigger_examples.length > 3 && (
                            <span className="px-2 py-1 text-xs text-zinc-500">
                                +{skill.trigger_examples.length - 3} more
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-4 flex items-center gap-3 pt-4 border-t border-zinc-700/50">
                <button
                    onClick={handleToggle}
                    disabled={isPending}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${skill.enabled
                            ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                >
                    {skill.enabled ? tc('disable') : tc('enable')}
                </button>
                <Link
                    href={`/skills/${skill.id}/edit`}
                    className="px-3 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-700 rounded-lg hover:bg-zinc-600 transition-colors"
                >
                    {tc('edit')}
                </Link>
                <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-3 py-1.5 text-sm font-medium text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors"
                >
                    {tc('delete')}
                </button>
            </div>
        </div>
    )
}
