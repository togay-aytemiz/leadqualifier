'use client'

import { useTranslations } from 'next-intl'
import type { Skill } from '@/types/database'
import { toggleSkill, deleteSkill } from '@/lib/skills/actions'
import { Link } from '@/i18n/navigation'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Badge, Button } from '@/design'

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
        <div className="rounded-xl bg-white p-6 border border-gray-200 shadow-sm">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900">{skill.title}</h3>
                        <Badge variant={skill.enabled ? 'success' : 'neutral'}>
                            {skill.enabled ? tc('enabled') : tc('disabled')}
                        </Badge>
                    </div>
                    <p className="mt-2 text-sm text-gray-500 line-clamp-2">{skill.response_text}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {skill.trigger_examples.slice(0, 3).map((trigger, i) => (
                            <span
                                key={i}
                                className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-md border border-gray-200"
                            >
                                {trigger}
                            </span>
                        ))}
                        {skill.trigger_examples.length > 3 && (
                            <span className="px-2 py-1 text-xs text-gray-500">
                                +{skill.trigger_examples.length - 3} more
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-4 flex items-center gap-3 pt-4 border-t border-gray-100">
                <Button
                    onClick={handleToggle}
                    disabled={isPending}
                    variant={skill.enabled ? 'secondary' : 'primary'}
                    size="sm"
                >
                    {skill.enabled ? tc('disable') : tc('enable')}
                </Button>
                <Link href={`/skills/${skill.id}/edit`}>
                    <Button variant="secondary" size="sm">
                        {tc('edit')}
                    </Button>
                </Link>
                <Button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    variant="danger"
                    size="sm"
                >
                    {tc('delete')}
                </Button>
            </div>
        </div>
    )
}
