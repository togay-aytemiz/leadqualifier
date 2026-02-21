'use client'

import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Info } from 'lucide-react'

import { Button, PageHeader } from '@/design'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import type { QaLabPreset, QaLabPresetConfig } from '@/lib/qa-lab/presets'
import {
    createAndQueueQaLabRun,
    createAndQueueQaLabRunForAdmin,
    runQaLabQueueWorkerBatch,
    runQaLabQueueWorkerBatchForAdmin
} from '@/lib/qa-lab/runs'
import {
    calculateUsageCreditCost,
    estimateUsageCreditCostFromTotalTokens
} from '@/lib/billing/credit-cost'
import { calculateQaLabRunUsdCost } from '@/lib/qa-lab/cost'
import type { QaLabRun, QaLabRunResult, QaLabRunStatus } from '@/types/database'

interface QaLabSettingsClientProps {
    initialRuns: QaLabRun[]
    presets: QaLabPresetConfig[]
    canStartRuns: boolean
    isReadOnlyTenantMode: boolean
    runDetailBasePath?: '/settings/qa-lab' | '/admin/qa-lab'
    headerTitle?: string
    headerBackHref?: string
    adminMode?: boolean
}

interface QaLabFeedbackState {
    type: 'success' | 'error'
    message: string
}

function toPercent(value: number) {
    return Math.round(value * 100)
}

function formatRunTimestamp(value: string, locale: string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(date)
}

function getLocalizedHref(locale: string, href: string) {
    if (locale === 'tr') return href
    return `/${locale}${href}`
}

function getStatusBadgeClass(status: QaLabRunStatus) {
    switch (status) {
    case 'queued':
        return 'bg-slate-100 text-slate-700'
    case 'running':
        return 'bg-blue-100 text-blue-700'
    case 'completed':
        return 'bg-emerald-100 text-emerald-700'
    case 'failed':
        return 'bg-red-100 text-red-700'
    case 'budget_stopped':
        return 'bg-amber-100 text-amber-800'
    default:
        return 'bg-slate-100 text-slate-700'
    }
}

function getResultBadgeClass(result: QaLabRunResult) {
    switch (result) {
    case 'pending':
        return 'bg-slate-100 text-slate-700'
    case 'pass_clean':
        return 'bg-emerald-100 text-emerald-700'
    case 'pass_with_findings':
        return 'bg-amber-100 text-amber-800'
    case 'fail_critical':
        return 'bg-red-100 text-red-700'
    default:
        return 'bg-slate-100 text-slate-700'
    }
}

function readRunReportMetrics(report: QaLabRun['report']) {
    if (!report || typeof report !== 'object' || Array.isArray(report)) {
        return {
            consumedTokens: null,
            consumedInputTokens: null,
            consumedInputCachedTokens: null,
            consumedOutputTokens: null,
            creditsUsed: null,
            estimatedCostUsd: null,
            scenarioCountForAverage: null,
            turnCountForAverage: null,
            weightedScore: null,
            findingCount: null
        }
    }

    const reportRecord = report as Record<string, unknown>
    const budget = (
        reportRecord.budget && typeof reportRecord.budget === 'object' && !Array.isArray(reportRecord.budget)
            ? reportRecord.budget as Record<string, unknown>
            : {}
    )
    const judge = (
        reportRecord.judge && typeof reportRecord.judge === 'object' && !Array.isArray(reportRecord.judge)
            ? reportRecord.judge as Record<string, unknown>
            : {}
    )
    const scoreBreakdown = (
        judge.score_breakdown && typeof judge.score_breakdown === 'object' && !Array.isArray(judge.score_breakdown)
            ? judge.score_breakdown as Record<string, unknown>
            : {}
    )
    const execution = (
        reportRecord.execution && typeof reportRecord.execution === 'object' && !Array.isArray(reportRecord.execution)
            ? reportRecord.execution as Record<string, unknown>
            : {}
    )

    const consumedTokens = typeof budget.consumed_tokens === 'number'
        ? budget.consumed_tokens
        : null
    const consumedInputTokens = typeof budget.consumed_input_tokens === 'number'
        ? budget.consumed_input_tokens
        : null
    const consumedInputCachedTokens = typeof budget.consumed_input_cached_tokens === 'number'
        ? budget.consumed_input_cached_tokens
        : null
    const consumedOutputTokens = typeof budget.consumed_output_tokens === 'number'
        ? budget.consumed_output_tokens
        : null
    const weightedScore = typeof scoreBreakdown.weighted_total === 'number'
        ? scoreBreakdown.weighted_total
        : null
    const findingCount = Array.isArray(judge.findings)
        ? judge.findings.length
        : null
    const scenarioCountForAverage = typeof execution.executed_scenarios === 'number'
        ? execution.executed_scenarios
        : (typeof execution.target_scenarios === 'number' ? execution.target_scenarios : null)
    const turnCountForAverage = typeof execution.executed_turns === 'number'
        ? execution.executed_turns
        : null
    const creditsUsed = (() => {
        if (typeof consumedInputTokens === 'number' && typeof consumedOutputTokens === 'number') {
            return calculateUsageCreditCost({
                inputTokens: consumedInputTokens,
                outputTokens: consumedOutputTokens
            })
        }
        if (typeof consumedTokens === 'number') {
            return estimateUsageCreditCostFromTotalTokens(consumedTokens)
        }
        return null
    })()
    const estimatedCostUsd = (() => {
        if (typeof budget.estimated_cost_usd === 'number') {
            return budget.estimated_cost_usd
        }
        if (typeof consumedInputTokens === 'number' && typeof consumedOutputTokens === 'number') {
            return calculateQaLabRunUsdCost({
                inputTokens: consumedInputTokens,
                outputTokens: consumedOutputTokens,
                cachedInputTokens: (
                    typeof consumedInputCachedTokens === 'number'
                        ? consumedInputCachedTokens
                        : 0
                )
            })
        }
        return null
    })()

    return {
        consumedTokens,
        consumedInputTokens,
        consumedInputCachedTokens,
        consumedOutputTokens,
        creditsUsed,
        estimatedCostUsd,
        scenarioCountForAverage,
        turnCountForAverage,
        weightedScore,
        findingCount
    }
}

export default function QaLabSettingsClient({
    initialRuns,
    presets,
    canStartRuns,
    isReadOnlyTenantMode,
    runDetailBasePath = '/settings/qa-lab',
    headerTitle,
    headerBackHref,
    adminMode = false
}: QaLabSettingsClientProps) {
    const locale = useLocale()
    const router = useRouter()
    const tQaLab = useTranslations('aiQaLab')
    const tSidebar = useTranslations('Sidebar')
    const tCommon = useTranslations('common')
    const [isPending, startTransition] = useTransition()
    const [activePreset, setActivePreset] = useState<QaLabPreset | null>(null)
    const [feedback, setFeedback] = useState<QaLabFeedbackState | null>(null)

    const canTriggerRuns = canStartRuns && !isReadOnlyTenantMode
    const runRows = initialRuns.map((run) => ({
        run,
        metrics: readRunReportMetrics(run.report)
    }))
    const usageSummary = runRows.reduce((summary, row) => {
        const creditsUsed = row.metrics.creditsUsed
        if (typeof creditsUsed === 'number') {
            summary.totalCredits += creditsUsed
            summary.runsWithCredits += 1
            summary.totalScenarios += (
                typeof row.metrics.scenarioCountForAverage === 'number'
                    ? row.metrics.scenarioCountForAverage
                    : row.run.scenario_count
            )
            summary.totalTurns += (
                typeof row.metrics.turnCountForAverage === 'number'
                    ? row.metrics.turnCountForAverage
                    : row.run.scenario_count * row.run.max_turns_per_scenario
            )
        }
        if (typeof row.metrics.consumedTokens === 'number') {
            summary.totalTokens += row.metrics.consumedTokens
        }
        if (typeof row.metrics.estimatedCostUsd === 'number') {
            summary.totalCostUsd += row.metrics.estimatedCostUsd
            summary.runsWithCost += 1
        }
        return summary
    }, {
        totalCredits: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        runsWithCredits: 0,
        runsWithCost: 0,
        totalScenarios: 0,
        totalTurns: 0
    })
    const formatCredits = (value: number) => value.toLocaleString(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    })
    const formatUsd = (value: number) => new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: value < 1 ? 4 : 2,
        maximumFractionDigits: value < 1 ? 4 : 2
    }).format(value)
    const summaryTooltip = tQaLab('usageSummaryTooltip', {
        perRun: formatCredits(
            usageSummary.runsWithCredits > 0
                ? usageSummary.totalCredits / usageSummary.runsWithCredits
                : 0
        ),
        perScenario: formatCredits(
            usageSummary.totalScenarios > 0
                ? usageSummary.totalCredits / usageSummary.totalScenarios
                : 0
        ),
        perTurn: formatCredits(
            usageSummary.totalTurns > 0
                ? usageSummary.totalCredits / usageSummary.totalTurns
                : 0
        )
    })

    const handleStartRun = (presetId: QaLabPreset) => {
        if (!canTriggerRuns) return

        setFeedback(null)
        setActivePreset(presetId)

        startTransition(async () => {
            try {
                if (adminMode) {
                    await createAndQueueQaLabRunForAdmin(presetId)
                } else {
                    await createAndQueueQaLabRun(presetId)
                }
                setFeedback({
                    type: 'success',
                    message: tQaLab('enqueueRunSuccess')
                })
                void (adminMode
                    ? runQaLabQueueWorkerBatchForAdmin(1)
                    : runQaLabQueueWorkerBatch(1)
                ).then(() => {
                    router.refresh()
                }).catch((error) => {
                    console.error(error)
                })
                router.refresh()
            } catch (error) {
                console.error(error)
                setFeedback({
                    type: 'error',
                    message: tQaLab('enqueueRunError')
                })
            } finally {
                setActivePreset(null)
            }
        })
    }

    return (
        <>
            <PageHeader
                title={headerTitle ?? tSidebar('qaLab')}
                breadcrumb={headerBackHref ? (
                    <Link
                        href={headerBackHref}
                        className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm mr-2 transition-colors"
                    >
                        <ArrowLeft size={18} />
                        {tCommon('back')}
                    </Link>
                ) : undefined}
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="w-full space-y-6">
                    <div className="space-y-2">
                        <p className="text-sm text-gray-500">{tQaLab('description')}</p>
                        {isReadOnlyTenantMode && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                {tQaLab('readOnlyMode')}
                            </div>
                        )}
                        {!isReadOnlyTenantMode && !canStartRuns && (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                {tQaLab('roleRestricted')}
                            </div>
                        )}
                        {feedback && (
                            <div
                                className={cn(
                                    'rounded-lg border px-3 py-2 text-sm',
                                    feedback.type === 'success'
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : 'border-red-200 bg-red-50 text-red-700'
                                )}
                            >
                                {feedback.message}
                            </div>
                        )}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                        {presets.map((preset) => (
                            <div
                                key={preset.id}
                                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                            >
                                <div className="mb-4">
                                    <h2 className="text-base font-semibold text-gray-900">
                                        {tQaLab(`presets.${preset.id}.title`)}
                                    </h2>
                                    <p className="mt-1 text-sm text-gray-500">
                                        {tQaLab(`presets.${preset.id}.description`)}
                                    </p>
                                </div>

                                <dl className="grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-2">
                                    <div>
                                        <dt className="text-gray-500" title={tQaLab('scenarioDefinition')}>
                                            {tQaLab('presetScenarios')}
                                        </dt>
                                        <dd className="font-medium">{preset.scenarioCount}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-gray-500" title={tQaLab('turnDefinition')}>
                                            {tQaLab('presetMaxTurns')}
                                        </dt>
                                        <dd className="font-medium">{preset.maxTurnsPerScenario}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-gray-500">{tQaLab('presetTokenBudget')}</dt>
                                        <dd className="font-medium">{preset.maxTokenBudget.toLocaleString(locale)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-gray-500">{tQaLab('presetFixtureRule')}</dt>
                                        <dd className="font-medium">
                                            {tQaLab('fixtureMinLinesValue', { count: preset.fixtureMinLines })}
                                        </dd>
                                    </div>
                                </dl>

                                <p className="mt-3 text-xs text-gray-500">
                                    {tQaLab('presetStyleMixValue', {
                                        clean: toPercent(preset.fixtureStyleMix.clean),
                                        semiNoisy: toPercent(preset.fixtureStyleMix.semiNoisy),
                                        messy: toPercent(preset.fixtureStyleMix.messy)
                                    })}
                                </p>

                                <div className="mt-4">
                                    <Button
                                        disabled={!canTriggerRuns || isPending}
                                        onClick={() => handleStartRun(preset.id)}
                                    >
                                        {activePreset === preset.id && isPending
                                            ? tQaLab('startingRun')
                                            : tQaLab('startRun')}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h2 className="text-base font-semibold text-gray-900">{tQaLab('lastRunsTitle')}</h2>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-600">
                            {usageSummary.runsWithCredits > 0 || usageSummary.totalTokens > 0 ? (
                                <>
                                    <span
                                        className="cursor-help font-medium text-gray-700 underline decoration-dotted underline-offset-2"
                                        title={summaryTooltip}
                                    >
                                        {tQaLab('usageSummaryTitle')}
                                    </span>
                                    <span>{tQaLab('usageSummaryCredits', { value: formatCredits(usageSummary.totalCredits) })}</span>
                                    <span>{tQaLab('usageSummaryTokens', { value: usageSummary.totalTokens.toLocaleString(locale) })}</span>
                                    <span>{tQaLab('usageSummaryCost', { value: formatUsd(usageSummary.totalCostUsd) })}</span>
                                    <span
                                        className="inline-flex cursor-help items-center text-gray-500"
                                        title={summaryTooltip}
                                        aria-label={summaryTooltip}
                                    >
                                        <Info size={14} />
                                    </span>
                                </>
                            ) : (
                                <span className="text-gray-500">{tQaLab('usageSummaryEmpty')}</span>
                            )}
                        </div>

                        {initialRuns.length === 0 ? (
                            <p className="mt-3 text-sm text-gray-500">{tQaLab('emptyRuns')}</p>
                        ) : (
                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead>
                                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            <th className="px-2 py-2">{tQaLab('columns.runId')}</th>
                                            <th className="px-2 py-2">{tQaLab('columns.preset')}</th>
                                            <th className="px-2 py-2">{tQaLab('columns.status')}</th>
                                            <th className="px-2 py-2">{tQaLab('columns.result')}</th>
                                            <th className="px-2 py-2">{tQaLab('columns.score')}</th>
                                            <th className="px-2 py-2">{tQaLab('columns.findings')}</th>
                                            <th className="px-2 py-2">{tQaLab('columns.tokenBudget')}</th>
                                            <th className="px-2 py-2">{tQaLab('columns.tokensUsed')}</th>
                                            <th className="px-2 py-2">
                                                <span
                                                    className="cursor-help underline decoration-dotted underline-offset-2"
                                                    title={summaryTooltip}
                                                >
                                                    {tQaLab('columns.creditsUsed')}
                                                </span>
                                            </th>
                                            <th className="px-2 py-2">
                                                <span
                                                    className="cursor-help underline decoration-dotted underline-offset-2"
                                                    title={tQaLab('costFormulaTooltip')}
                                                >
                                                    {tQaLab('columns.costUsd')}
                                                </span>
                                            </th>
                                            <th className="px-2 py-2">{tQaLab('columns.createdAt')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-gray-700">
                                        {runRows.map(({ run, metrics }) => {
                                            return (
                                                <tr key={run.id}>
                                                <td className="px-2 py-3 font-mono text-xs text-gray-600">
                                                    <a
                                                        href={getLocalizedHref(locale, `${runDetailBasePath}/${run.id}`)}
                                                        className="underline decoration-dotted underline-offset-2 hover:text-gray-900"
                                                    >
                                                        {run.id.slice(0, 8)}
                                                    </a>
                                                </td>
                                                <td className="px-2 py-3">
                                                    {tQaLab(`presets.${run.preset}.title`)}
                                                </td>
                                                <td className="px-2 py-3">
                                                    <span
                                                        className={cn(
                                                            'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                                                            getStatusBadgeClass(run.status)
                                                        )}
                                                    >
                                                        {tQaLab(`status.${run.status}`)}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-3">
                                                    <span
                                                        className={cn(
                                                            'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                                                            getResultBadgeClass(run.result)
                                                        )}
                                                    >
                                                        {tQaLab(`result.${run.result}`)}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-3">
                                                    {typeof metrics.weightedScore === 'number'
                                                        ? metrics.weightedScore
                                                        : '-'}
                                                </td>
                                                <td className="px-2 py-3">
                                                    {typeof metrics.findingCount === 'number'
                                                        ? metrics.findingCount
                                                        : '-'}
                                                </td>
                                                <td className="px-2 py-3">
                                                    {run.token_budget.toLocaleString(locale)}
                                                </td>
                                                <td className="px-2 py-3">
                                                    {typeof metrics.consumedTokens === 'number'
                                                        ? metrics.consumedTokens.toLocaleString(locale)
                                                        : '-'}
                                                </td>
                                                <td className="px-2 py-3">
                                                    {typeof metrics.creditsUsed === 'number'
                                                        ? formatCredits(metrics.creditsUsed)
                                                        : '-'}
                                                </td>
                                                <td className="px-2 py-3">
                                                    {typeof metrics.estimatedCostUsd === 'number'
                                                        ? formatUsd(metrics.estimatedCostUsd)
                                                        : '-'}
                                                </td>
                                                <td className="px-2 py-3 text-gray-500">
                                                    {formatRunTimestamp(run.created_at, locale)}
                                                </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}
