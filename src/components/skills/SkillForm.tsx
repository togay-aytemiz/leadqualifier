'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSkill, updateSkill } from '@/lib/skills/actions'
import type { Skill, SkillInsert } from '@/types/database'
import { Input, TextArea, Button, Alert } from '@/design'

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
    const [requiresHumanHandover, setRequiresHumanHandover] = useState(skill?.requires_human_handover ?? false)
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
            setError(t('validation.minTriggers'))
            return
        }

        setIsSubmitting(true)
        try {
            if (skill) {
                await updateSkill(skill.id, {
                    title,
                    trigger_examples: validTriggers,
                    response_text: responseText,
                    requires_human_handover: requiresHumanHandover
                }, skill.trigger_examples)
            } else {
                const data: SkillInsert = {
                    organization_id: organizationId,
                    title,
                    trigger_examples: validTriggers,
                    response_text: responseText,
                    enabled: true,
                    requires_human_handover: requiresHumanHandover
                }
                await createSkill(data)
            }
            router.push('/skills')
            router.refresh()
        } catch (err) {
            setError(err instanceof Error ? err.message : t('validation.genericError'))
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
                <Alert variant="error">
                    {error}
                </Alert>
            )}

            <Input
                label={t('skillTitle')}
                value={title}
                onChange={(val: string) => setTitle(val)}
                className="bg-white"
                placeholder={t('skillTitlePlaceholder')}
                required
            />

            <div>
                <label className="block text-sm font-medium text-gray-700">{t('triggerExamples')}</label>
                <p className="mt-1 text-xs text-gray-500">{t('triggerExamplesHint')}</p>
                <div className="mt-3 space-y-3">
                    {triggers.map((trigger, index) => (
                        <div key={index} className="flex gap-2">
                            <input
                                type="text"
                                value={trigger}
                                onChange={(e) => handleTriggerChange(index, e.target.value)}
                                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm shadow-sm"
                                placeholder={t('triggerPlaceholder')}
                            />
                            {triggers.length > 3 && (
                                <button
                                    type="button"
                                    onClick={() => handleRemoveTrigger(index)}
                                    className="px-3 py-2 text-gray-400 hover:text-red-500"
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
                    className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                    + {t('addTrigger')}
                </button>
            </div>

            <TextArea
                label={t('responseText')}
                value={responseText}
                onChange={(val: string) => setResponseText(val)}
                rows={5}
                className="bg-white"
                placeholder={t('responseTextPlaceholder')}
                required
            />

            <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                    type="checkbox"
                    checked={requiresHumanHandover}
                    onChange={(event) => setRequiresHumanHandover(event.target.checked)}
                />
                {t('requiresHumanHandover')}
            </label>

            <div className="flex gap-4">
                <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-[#242A40] hover:bg-[#1B2033] border-transparent text-white"
                >
                    {isSubmitting ? tc('loading') : tc('save')}
                </Button>
                <Button
                    type="button"
                    onClick={() => router.back()}
                    variant="secondary"
                >
                    {tc('cancel')}
                </Button>
            </div>
        </form>
    )
}
