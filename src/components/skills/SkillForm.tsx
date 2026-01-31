'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSkill, updateSkill } from '@/lib/skills/actions'
import type { Skill, SkillInsert } from '@/types/database'

interface SkillFormProps {
    organizationId: string
    skill?: Skill
}

export function SkillForm({ organizationId, skill }: SkillFormProps) {
    const t = useTranslations('skills')
    const tc = useTranslations('common')
    const router = useRouter()

    const [title, setTitle] = useState(skill?.title || '')
    const [triggers, setTriggers] = useState<string[]>(skill?.trigger_examples || ['', '', ''])
    const [responseText, setResponseText] = useState(skill?.response_text || '')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleAddTrigger = () => {
        setTriggers([...triggers, ''])
    }

    const handleRemoveTrigger = (index: number) => {
        if (triggers.length <= 3) return
        setTriggers(triggers.filter((_, i) => i !== index))
    }

    const handleTriggerChange = (index: number, value: string) => {
        const newTriggers = [...triggers]
        newTriggers[index] = value
        setTriggers(newTriggers)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        const validTriggers = triggers.filter((t) => t.trim() !== '')
        if (validTriggers.length < 3) {
            setError('At least 3 trigger phrases are required')
            return
        }

        setIsSubmitting(true)
        try {
            if (skill) {
                await updateSkill(skill.id, {
                    title,
                    trigger_examples: validTriggers,
                    response_text: responseText,
                }, skill.trigger_examples)
            } else {
                const data: SkillInsert = {
                    organization_id: organizationId,
                    title,
                    trigger_examples: validTriggers,
                    response_text: responseText,
                    enabled: true,
                }
                await createSkill(data)
            }
            router.push('/skills')
            router.refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
                <div className="rounded-lg bg-red-500/10 p-4 text-sm text-red-400 border border-red-500/20">
                    {error}
                </div>
            )}

            <div>
                <label htmlFor="title" className="block text-sm font-medium text-zinc-300">
                    {t('skillTitle')}
                </label>
                <input
                    id="title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="mt-2 block w-full rounded-lg border border-zinc-600 bg-zinc-700/50 px-4 py-3 text-white placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={t('skillTitlePlaceholder')}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-zinc-300">{t('triggerExamples')}</label>
                <p className="mt-1 text-xs text-zinc-500">{t('triggerExamplesHint')}</p>
                <div className="mt-3 space-y-3">
                    {triggers.map((trigger, index) => (
                        <div key={index} className="flex gap-2">
                            <input
                                type="text"
                                value={trigger}
                                onChange={(e) => handleTriggerChange(index, e.target.value)}
                                className="flex-1 rounded-lg border border-zinc-600 bg-zinc-700/50 px-4 py-2.5 text-white placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder={t('triggerPlaceholder')}
                            />
                            {triggers.length > 3 && (
                                <button
                                    type="button"
                                    onClick={() => handleRemoveTrigger(index)}
                                    className="px-3 py-2 text-zinc-400 hover:text-red-400"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={handleAddTrigger}
                    className="mt-3 text-sm text-blue-400 hover:text-blue-300"
                >
                    + {t('addTrigger')}
                </button>
            </div>

            <div>
                <label htmlFor="response" className="block text-sm font-medium text-zinc-300">
                    {t('responseText')}
                </label>
                <textarea
                    id="response"
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    required
                    rows={5}
                    className="mt-2 block w-full rounded-lg border border-zinc-600 bg-zinc-700/50 px-4 py-3 text-white placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={t('responseTextPlaceholder')}
                />
            </div>

            <div className="flex gap-4">
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                    {isSubmitting ? '...' : tc('save')}
                </button>
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="px-6 py-3 bg-zinc-700 text-zinc-300 font-medium rounded-lg hover:bg-zinc-600"
                >
                    {tc('cancel')}
                </button>
            </div>
        </form>
    )
}
