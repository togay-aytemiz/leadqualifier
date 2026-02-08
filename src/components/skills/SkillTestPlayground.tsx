'use client'

import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'
import { matchSkills } from '@/lib/skills/actions'
import type { SkillMatch } from '@/types/database'

interface SkillTestPlaygroundProps {
    organizationId: string
}

export function SkillTestPlayground({ organizationId }: SkillTestPlaygroundProps) {
    const t = useTranslations('skills')
    const tc = useTranslations('common')
    const [message, setMessage] = useState('')
    const [results, setResults] = useState<SkillMatch[]>([])
    const [isPending, startTransition] = useTransition()
    const [hasSearched, setHasSearched] = useState(false)

    const handleTest = () => {
        if (!message.trim()) return

        startTransition(async () => {
            try {
                const matches = await matchSkills(message, organizationId, 0.3, 5)
                setResults(matches)
                setHasSearched(true)
            } catch (err) {
                console.error('Error matching skills:', err)
                setResults([])
                setHasSearched(true)
            }
        })
    }

    const bestMatch = results[0]

    return (
        <div className="space-y-8">
            <div className="rounded-xl bg-zinc-800/50 p-6 border border-zinc-700/50">
                <h2 className="text-lg font-semibold text-white mb-4">{t('testMessage')}</h2>
                <div className="flex gap-4">
                    <input
                        type="text"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleTest()}
                        placeholder={t('testMessagePlaceholder')}
                        className="flex-1 rounded-lg border border-zinc-600 bg-zinc-700/50 px-4 py-3 text-white placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                        onClick={handleTest}
                        disabled={isPending || !message.trim()}
                        className="px-6 py-3 bg-[#242A40] text-white font-medium rounded-lg hover:bg-[#1B2033] focus:outline-none focus:ring-2 focus:ring-[#242A40]/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPending ? tc('loading') : t('runTest')}
                    </button>
                </div>
            </div>

            {hasSearched && (
                <>
                    {/* Best match */}
                    <div className="rounded-xl bg-zinc-800/50 p-6 border border-zinc-700/50">
                        <h2 className="text-lg font-semibold text-white mb-4">{t('matchedSkill')}</h2>
                        {bestMatch ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xl font-bold text-white">{bestMatch.title}</span>
                                    <span
                                        className={`px-3 py-1 rounded-full text-sm font-medium ${bestMatch.similarity >= 0.8
                                                ? 'bg-green-500/20 text-green-400'
                                                : bestMatch.similarity >= 0.6
                                                    ? 'bg-yellow-500/20 text-yellow-400'
                                                    : 'bg-orange-500/20 text-orange-400'
                                            }`}
                                    >
                                        {t('confidence')}: {(bestMatch.similarity * 100).toFixed(1)}%
                                    </span>
                                </div>
                                <div>
                                    <p className="text-sm text-zinc-400 mb-1">{t('matchedTrigger')}</p>
                                    <p className="text-zinc-300">{bestMatch.trigger_text}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-zinc-400 mb-1">{t('response')}:</p>
                                    <div className="p-4 bg-zinc-700/50 rounded-lg text-white">{bestMatch.response_text}</div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-zinc-400">{t('noMatch')}</p>
                        )}
                    </div>

                    {/* All matches */}
                    {results.length > 1 && (
                        <div className="rounded-xl bg-zinc-800/50 p-6 border border-zinc-700/50">
                            <h2 className="text-lg font-semibold text-white mb-4">{t('topMatches')}</h2>
                            <div className="space-y-3">
                                {results.map((match, index) => (
                                    <div
                                        key={`${match.skill_id}-${index}`}
                                        className="flex items-center justify-between p-3 rounded-lg bg-zinc-700/30"
                                    >
                                        <div>
                                            <span className="text-white font-medium">{match.title}</span>
                                            <span className="ml-2 text-sm text-zinc-400">{match.trigger_text}</span>
                                        </div>
                                        <span className="text-zinc-400">{(match.similarity * 100).toFixed(1)}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
