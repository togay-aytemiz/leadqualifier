import { getLocale, getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { PageHeader } from '@/design'
import KbFixturePreviewCard from '@/components/qa-lab/KbFixturePreviewCard'
import { Link } from '@/i18n/navigation'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { buildQaLabPipelineActionSet } from '@/lib/qa-lab/action-set'
import { calculateQaLabRunUsdCost } from '@/lib/qa-lab/cost'
import {
    parseQaLabRunReportView,
    type QaLabRunFindingView
} from '@/lib/qa-lab/report-view'
import { canAccessQaLab } from '@/lib/qa-lab/access'
import { getCurrentUserQaLabRole, getQaLabRunById } from '@/lib/qa-lab/runs'
import { cn } from '@/lib/utils'
import type { QaLabRunResult, QaLabRunStatus } from '@/types/database'

interface QaLabRunDetailPageProps {
    params: Promise<{
        runId: string
    }>
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

function getSeverityBadgeClass(severity: QaLabRunFindingView['severity']) {
    switch (severity) {
    case 'critical':
        return 'bg-red-100 text-red-700'
    case 'major':
        return 'bg-amber-100 text-amber-800'
    case 'minor':
        return 'bg-slate-100 text-slate-700'
    default:
        return 'bg-slate-100 text-slate-700'
    }
}

function getPipelineStatusBadgeClass(status: 'pass' | 'warn' | 'fail') {
    switch (status) {
    case 'pass':
        return 'bg-emerald-100 text-emerald-700'
    case 'warn':
        return 'bg-amber-100 text-amber-800'
    case 'fail':
        return 'bg-red-100 text-red-700'
    default:
        return 'bg-slate-100 text-slate-700'
    }
}

function getIntakeReadinessBadgeClass(status: 'pass' | 'warn' | 'fail') {
    switch (status) {
    case 'pass':
        return 'bg-emerald-100 text-emerald-700'
    case 'warn':
        return 'bg-amber-100 text-amber-800'
    case 'fail':
        return 'bg-red-100 text-red-700'
    default:
        return 'bg-slate-100 text-slate-700'
    }
}

function formatDateTime(value: string | null, locale: string) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(date)
}

function formatNumber(value: number | null, locale: string) {
    if (typeof value !== 'number') return '-'
    return value.toLocaleString(locale)
}

function formatUsd(value: number | null, locale: string) {
    if (typeof value !== 'number') return '-'
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: value < 1 ? 4 : 2,
        maximumFractionDigits: value < 1 ? 4 : 2
    }).format(value)
}

function formatPercent(value: number | null) {
    if (typeof value !== 'number') return '-'
    return `${Math.round(value * 100)}%`
}

export default async function QaLabRunDetailPage({ params }: QaLabRunDetailPageProps) {
    const locale = await getLocale()
    const tQaLab = await getTranslations('aiQaLab')
    const tCommon = await getTranslations('common')
    const { runId } = await params

    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) return null

    const organizationId = orgContext.activeOrganizationId
    const qaLabListHref = '/settings/qa-lab'

    if (!organizationId) {
        return (
            <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
                <div className="flex-1 flex items-center justify-center text-gray-500">
                    <div className="text-center">
                        <h2 className="text-xl font-bold text-gray-900 mb-2">{tQaLab('noOrganization')}</h2>
                        <p>{tQaLab('noOrganizationDesc')}</p>
                    </div>
                </div>
            </div>
        )
    }

    await enforceWorkspaceAccessOrRedirect({
        organizationId,
        locale,
        currentPath: '/settings/qa-lab',
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

    const userRole = await getCurrentUserQaLabRole(organizationId)
    if (!canAccessQaLab({
        userEmail: orgContext.userEmail,
        userRole,
        isSystemAdmin: orgContext.isSystemAdmin
    })) {
        redirect(`/${locale}/inbox`)
    }

    const run = await getQaLabRunById(runId, organizationId)
    if (!run) {
        return (
            <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
                <PageHeader
                    title={tQaLab('details.pageTitle')}
                    breadcrumb={(
                        <Link
                            href={qaLabListHref}
                            className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm mr-2 transition-colors"
                        >
                            <ArrowLeft size={18} />
                            {tCommon('back')}
                        </Link>
                    )}
                />
                <div className="flex-1 overflow-auto p-8">
                    <div className="w-full rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                        <h2 className="text-base font-semibold text-gray-900">{tQaLab('details.notFoundTitle')}</h2>
                        <p className="mt-2 text-sm text-gray-500">{tQaLab('details.notFoundDescription')}</p>
                        <Link
                            href={qaLabListHref}
                            className="mt-4 inline-flex h-9 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            {tQaLab('details.backToRuns')}
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    const report = parseQaLabRunReportView(run.report)
    const pipelineActionSet = buildQaLabPipelineActionSet(run.report)
    const intakeCoverageByCase = new Map(
        report.intakeCoverage.byCase.map((item) => [item.caseId, item] as const)
    )
    const caseTitleById = new Map(
        report.cases.map((item) => [item.caseId, item.title] as const)
    )
    const estimatedCostUsd = (() => {
        if (typeof report.budget.estimatedCostUsd === 'number') {
            return report.budget.estimatedCostUsd
        }
        if (
            typeof report.budget.consumedInputTokens === 'number'
            && typeof report.budget.consumedOutputTokens === 'number'
        ) {
            return calculateQaLabRunUsdCost({
                inputTokens: report.budget.consumedInputTokens,
                outputTokens: report.budget.consumedOutputTokens,
                cachedInputTokens: report.budget.consumedInputCachedTokens ?? 0
            })
        }
        return null
    })()
    const qaAssistantAutoPortToLiveLabel = report.qaAssistantProfile.autoPortToLive === null
        ? '-'
        : report.qaAssistantProfile.autoPortToLive
            ? tCommon('enabled')
            : tCommon('disabled')

    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <PageHeader
                title={tQaLab('details.pageTitle')}
                breadcrumb={(
                    <Link
                        href={qaLabListHref}
                        className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm mr-2 transition-colors"
                    >
                        <ArrowLeft size={18} />
                        {tCommon('back')}
                    </Link>
                )}
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="w-full space-y-6">
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h2 className="text-base font-semibold text-gray-900">{tQaLab('details.runSummaryTitle')}</h2>

                        <div className="mt-4 grid grid-cols-1 gap-4 text-sm text-gray-700 sm:grid-cols-2 xl:grid-cols-4">
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.runId')}</p>
                                <p className="mt-1 font-mono text-xs text-gray-700 break-all">{run.id}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.preset')}</p>
                                <p className="mt-1">{tQaLab(`presets.${run.preset}.title`)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.status')}</p>
                                <span
                                    className={cn(
                                        'mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium',
                                        getStatusBadgeClass(run.status)
                                    )}
                                >
                                    {tQaLab(`status.${run.status}`)}
                                </span>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.result')}</p>
                                <span
                                    className={cn(
                                        'mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium',
                                        getResultBadgeClass(run.result)
                                    )}
                                >
                                    {tQaLab(`result.${run.result}`)}
                                </span>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.createdAt')}</p>
                                <p className="mt-1">{formatDateTime(run.created_at, locale)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.startedAt')}</p>
                                <p className="mt-1">{formatDateTime(run.started_at, locale)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.finishedAt')}</p>
                                <p className="mt-1">{formatDateTime(run.finished_at, locale)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.generatorModel')}</p>
                                <p className="mt-1 break-all">{run.generator_model}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.judgeModel')}</p>
                                <p className="mt-1 break-all">{run.judge_model}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.qaAssistantId')}</p>
                                <p className="mt-1 break-all">{report.qaAssistantProfile.assistantId}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.qaAssistantProfileVersion')}</p>
                                <p className="mt-1 break-all">{report.qaAssistantProfile.profileVersion}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.qaAssistantIsolation')}</p>
                                <p className="mt-1 break-all">{report.qaAssistantProfile.isolation}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.qaAssistantAutoPortToLive')}</p>
                                <p className="mt-1">{qaAssistantAutoPortToLiveLabel}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.tokenBudget')}</p>
                                <p className="mt-1">{formatNumber(report.budget.limitTokens, locale)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.tokensUsed')}</p>
                                <p className="mt-1">{formatNumber(report.budget.consumedTokens, locale)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.fields.tokensRemaining')}</p>
                                <p className="mt-1">{formatNumber(report.budget.remainingTokens, locale)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500" title={tQaLab('costFormulaTooltip')}>
                                    {tQaLab('details.fields.estimatedCostUsd')}
                                </p>
                                <p className="mt-1">{formatUsd(estimatedCostUsd, locale)}</p>
                            </div>
                        </div>

                        {report.budget.exhausted === true && (
                            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                {tQaLab('details.budgetStoppedNotice')}
                            </div>
                        )}
                    </div>

                    <KbFixturePreviewCard
                        sectionTitle={tQaLab('details.kbFixtureTitle')}
                        lineCountText={tQaLab('details.kbFixtureLineCount', { count: report.kbFixture.lineCount })}
                        fixtureTitle={report.kbFixture.title}
                        fixtureLines={report.kbFixture.lines}
                        emptyText={tQaLab('details.kbFixtureEmpty')}
                        previewLabel={tQaLab('details.kbFixturePreviewLabel')}
                        viewFullText={tQaLab('details.kbFixtureViewFull')}
                        modalTitle={tQaLab('details.kbFixtureModalTitle')}
                        closeText={tQaLab('details.kbFixtureClose')}
                    />

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h2 className="text-base font-semibold text-gray-900">{tQaLab('details.groundTruthTitle')}</h2>

                        <div className="mt-4 grid grid-cols-1 gap-4 text-sm text-gray-700 lg:grid-cols-2">
                            <div>
                                <p className="text-gray-500">{tQaLab('details.groundTruthCanonicalServices')}</p>
                                {report.groundTruth.canonicalServices.length === 0 ? (
                                    <p className="mt-1">-</p>
                                ) : (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {report.groundTruth.canonicalServices.map((service, index) => (
                                            <span key={`${service}-${index}`} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
                                                {service}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.groundTruthRequiredFields')}</p>
                                {report.groundTruth.requiredIntakeFields.length === 0 ? (
                                    <p className="mt-1">-</p>
                                ) : (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {report.groundTruth.requiredIntakeFields.map((field, index) => (
                                            <span key={`${field}-${index}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                                                {field}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.groundTruthCriticalFacts')}</p>
                                {report.groundTruth.criticalPolicyFacts.length === 0 ? (
                                    <p className="mt-1">-</p>
                                ) : (
                                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                                        {report.groundTruth.criticalPolicyFacts.map((fact, index) => (
                                            <li key={`${fact}-${index}`}>{fact}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.groundTruthDisallowedClaims')}</p>
                                {report.groundTruth.disallowedFabricatedClaims.length === 0 ? (
                                    <p className="mt-1">-</p>
                                ) : (
                                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
                                        {report.groundTruth.disallowedFabricatedClaims.map((claim, index) => (
                                            <li key={`${claim}-${index}`}>{claim}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h2 className="text-base font-semibold text-gray-900">{tQaLab('details.generatedSetupTitle')}</h2>
                        <p className="mt-1 text-sm text-gray-600">{report.derivedSetup.offeringProfileSummary || '-'}</p>

                        <div className="mt-4 grid grid-cols-1 gap-4 text-sm text-gray-700 md:grid-cols-2">
                            <div>
                                <p className="text-gray-500">{tQaLab('details.generatedSetupServiceCatalog')}</p>
                                {report.derivedSetup.serviceCatalog.length === 0 ? (
                                    <p className="mt-1">-</p>
                                ) : (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {report.derivedSetup.serviceCatalog.map((service, index) => (
                                            <span key={`${service}-${index}`} className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
                                                {service}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.generatedSetupRequiredFields')}</p>
                                {report.derivedSetup.requiredIntakeFields.length === 0 ? (
                                    <p className="mt-1">-</p>
                                ) : (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {report.derivedSetup.requiredIntakeFields.map((field, index) => (
                                            <span key={`${field}-${index}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                                                {field}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-600 sm:grid-cols-3 lg:grid-cols-6">
                            <p>{tQaLab('details.scenarioMix.hot')}: {formatNumber(report.scenarioMix.hot, locale)}</p>
                            <p>{tQaLab('details.scenarioMix.warm')}: {formatNumber(report.scenarioMix.warm, locale)}</p>
                            <p>{tQaLab('details.scenarioMix.cold')}: {formatNumber(report.scenarioMix.cold, locale)}</p>
                            <p>{tQaLab('details.scenarioMix.cooperative')}: {formatNumber(report.scenarioMix.cooperative, locale)}</p>
                            <p>{tQaLab('details.scenarioMix.partial')}: {formatNumber(report.scenarioMix.partial, locale)}</p>
                            <p>{tQaLab('details.scenarioMix.resistant')}: {formatNumber(report.scenarioMix.resistant, locale)}</p>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h2 className="text-base font-semibold text-gray-900">{tQaLab('details.intakeCoverageTitle')}</h2>
                        <p className="mt-1 text-sm text-gray-500">{tQaLab('details.intakeCoverageDescription')}</p>

                        <div className="mt-4 grid grid-cols-1 gap-4 text-sm text-gray-700 sm:grid-cols-2 xl:grid-cols-4">
                            <div>
                                <p className="text-gray-500">{tQaLab('details.intakeCoverageFields.required')}</p>
                                <p className="mt-1">{formatNumber(report.intakeCoverage.requiredFields.length, locale)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.intakeCoverageFields.avgAsked')}</p>
                                <p className="mt-1">{formatPercent(report.intakeCoverage.totals.averageAskedCoverage)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.intakeCoverageFields.avgFulfilled')}</p>
                                <p className="mt-1">{formatPercent(report.intakeCoverage.totals.averageFulfillmentCoverage)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.intakeCoverageFields.hotCooperativeReadiness')}</p>
                                <p className="mt-1">
                                    {report.intakeCoverage.totals.hotCooperativeCaseCount > 0
                                        ? formatPercent(
                                            report.intakeCoverage.totals.hotCooperativeReadyCount
                                            / report.intakeCoverage.totals.hotCooperativeCaseCount
                                        )
                                        : '-'}
                                </p>
                            </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-600 sm:grid-cols-3">
                            <p>{tQaLab('details.intakeCoverageFields.readyCases')}: {formatNumber(report.intakeCoverage.totals.readyCaseCount, locale)}</p>
                            <p>{tQaLab('details.intakeCoverageFields.warnCases')}: {formatNumber(report.intakeCoverage.totals.warnCaseCount, locale)}</p>
                            <p>{tQaLab('details.intakeCoverageFields.failCases')}: {formatNumber(report.intakeCoverage.totals.failCaseCount, locale)}</p>
                        </div>

                        <div className="mt-4">
                            <p className="text-sm font-medium text-gray-900">{tQaLab('details.intakeCoverageTopMissingTitle')}</p>
                            {report.intakeCoverage.topMissingFields.length === 0 ? (
                                <p className="mt-2 text-sm text-gray-500">{tQaLab('details.intakeCoverageEmpty')}</p>
                            ) : (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {report.intakeCoverage.topMissingFields.map((item, index) => (
                                        <span key={`${item.field}-${index}`} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                                            {item.field} ({item.count})
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-base font-semibold text-gray-900">{tQaLab('details.pipelineChecksTitle')}</h2>
                            <span
                                className={cn(
                                    'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                                    getPipelineStatusBadgeClass(report.pipelineChecks.overall)
                                )}
                            >
                                {tQaLab(`details.pipelineStatus.${report.pipelineChecks.overall}`)}
                            </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-500">{tQaLab('details.pipelineChecksDescription')}</p>

                        {report.pipelineChecks.steps.length === 0 ? (
                            <p className="mt-3 text-sm text-gray-500">{tQaLab('details.pipelineChecksEmpty')}</p>
                        ) : (
                            <div className="mt-4 space-y-2">
                                {report.pipelineChecks.steps.map((step, index) => (
                                    <div key={`${step.id}-${index}`} className="rounded-lg border border-gray-200 p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-medium text-gray-900">
                                                {tQaLab('details.pipelineStepLabel', {
                                                    order: step.order ?? index + 1,
                                                    id: step.id
                                                })}
                                            </p>
                                            <span
                                                className={cn(
                                                    'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                                                    getPipelineStatusBadgeClass(step.status)
                                                )}
                                            >
                                                {tQaLab(`details.pipelineStatus.${step.status}`)}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-sm text-gray-700">{step.note}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h2 className="text-base font-semibold text-gray-900">{tQaLab('details.scoreTitle')}</h2>
                        <div className="mt-4 grid grid-cols-1 gap-4 text-sm text-gray-700 sm:grid-cols-2 xl:grid-cols-4">
                            <div>
                                <p className="text-gray-500">{tQaLab('details.scoreFields.groundedness')}</p>
                                <p className="mt-1">{formatNumber(report.score.groundedness, locale)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.scoreFields.extractionAccuracy')}</p>
                                <p className="mt-1">{formatNumber(report.score.extractionAccuracy, locale)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.scoreFields.conversationQuality')}</p>
                                <p className="mt-1">{formatNumber(report.score.conversationQuality, locale)}</p>
                            </div>
                            <div>
                                <p className="text-gray-500">{tQaLab('details.scoreFields.weightedTotal')}</p>
                                <p className="mt-1 font-semibold">{formatNumber(report.score.weightedTotal, locale)}</p>
                            </div>
                        </div>
                        {report.summary && (
                            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                {report.summary}
                            </p>
                        )}
                        {report.judgeSkippedReason && (
                            <p className="mt-3 text-xs text-amber-700">
                                {tQaLab('details.judgeSkippedPrefix')} {report.judgeSkippedReason}
                            </p>
                        )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h2 className="text-base font-semibold text-gray-900">{tQaLab('details.scenarioAssessmentsTitle')}</h2>
                        <p className="mt-1 text-sm text-gray-500">{tQaLab('details.scenarioAssessmentsDescription')}</p>
                        {report.scenarioAssessments.length === 0 ? (
                            <p className="mt-3 text-sm text-gray-500">{tQaLab('details.scenarioAssessmentsEmpty')}</p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {report.scenarioAssessments.map((assessment, index) => {
                                    const caseTitle = caseTitleById.get(assessment.caseId) ?? assessment.caseId
                                    return (
                                        <div key={`${assessment.caseId}-${index}`} className="rounded-lg border border-gray-200 p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="text-sm font-medium text-gray-900">
                                                    {caseTitle} ({assessment.caseId})
                                                </p>
                                                <span
                                                    className={cn(
                                                        'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                                                        getPipelineStatusBadgeClass(assessment.assistantSuccess)
                                                    )}
                                                >
                                                    {tQaLab(`details.pipelineStatus.${assessment.assistantSuccess}`)}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-xs text-gray-600">
                                                {tQaLab('details.scenarioAssessmentSourceLabel')}: {tQaLab(`details.scenarioAssessmentSource.${assessment.source}`)}
                                            </p>
                                            <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-gray-700 sm:grid-cols-3">
                                                <p>{tQaLab('details.scenarioAssessmentFields.answerQuality')}: {formatNumber(assessment.answerQualityScore, locale)}</p>
                                                <p>{tQaLab('details.scenarioAssessmentFields.logic')}: {formatNumber(assessment.logicScore, locale)}</p>
                                                <p>{tQaLab('details.scenarioAssessmentFields.groundedness')}: {formatNumber(assessment.groundednessScore, locale)}</p>
                                            </div>
                                            <p className="mt-2 text-sm text-gray-700">
                                                <span className="font-medium">{tQaLab('details.scenarioAssessmentSummaryLabel')}:</span>{' '}
                                                {assessment.summary}
                                            </p>
                                            {assessment.strengths.length > 0 && (
                                                <p className="mt-2 text-xs text-emerald-700">
                                                    <span className="font-medium">{tQaLab('details.scenarioAssessmentStrengthsLabel')}:</span>{' '}
                                                    {assessment.strengths.join(', ')}
                                                </p>
                                            )}
                                            {assessment.issues.length > 0 && (
                                                <p className="mt-1 text-xs text-amber-700">
                                                    <span className="font-medium">{tQaLab('details.scenarioAssessmentIssuesLabel')}:</span>{' '}
                                                    {assessment.issues.join(', ')}
                                                </p>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h2 className="text-base font-semibold text-gray-900">{tQaLab('details.topActionsTitle')}</h2>
                        {report.topActions.length === 0 ? (
                            <p className="mt-3 text-sm text-gray-500">{tQaLab('details.emptyTopActions')}</p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {report.topActions.map((action, index) => (
                                    <div key={`${action.action}-${index}`} className="rounded-lg border border-gray-200 p-3">
                                        <p className="text-sm font-medium text-gray-900">
                                            #{action.priority ?? index + 1} {action.action}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-600">
                                            {tQaLab('details.actionMeta', {
                                                layer: action.targetLayer,
                                                effort: action.effort
                                            })}
                                        </p>
                                        <p className="mt-2 text-sm text-gray-700">{action.expectedImpact}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h2 className="text-base font-semibold text-gray-900">{tQaLab('details.pipelineActionSetTitle')}</h2>
                        <p className="mt-1 text-sm text-gray-500">{tQaLab('details.pipelineActionSetDescription')}</p>
                        <p className="mt-3 text-xs text-gray-600">
                            {tQaLab('details.pipelineActionSetSummary', {
                                total: pipelineActionSet.summary.total,
                                critical: pipelineActionSet.summary.criticalCount,
                                quickWins: pipelineActionSet.summary.quickWinCount
                            })}
                        </p>

                        {pipelineActionSet.items.length === 0 ? (
                            <p className="mt-3 text-sm text-gray-500">{tQaLab('details.pipelineActionSetEmpty')}</p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {pipelineActionSet.items.map((item) => (
                                    <div key={item.id} className="rounded-lg border border-gray-200 p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-medium text-gray-900">
                                                {tQaLab('details.pipelineActionSetPriorityLabel', { priority: item.priority })} {item.title}
                                            </p>
                                            <span
                                                className={cn(
                                                    'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                                                    getSeverityBadgeClass(item.severity)
                                                )}
                                            >
                                                {tQaLab(`details.severity.${item.severity}`)}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-xs text-gray-600">
                                            {tQaLab('details.actionMeta', {
                                                layer: item.targetLayer,
                                                effort: item.effort
                                            })}
                                        </p>
                                        <p className="mt-2 text-xs text-gray-600">
                                            {tQaLab('details.pipelineActionSetSourceLabel')}: {tQaLab(`details.pipelineActionSetSource.${item.source}`)}
                                        </p>
                                        <p className="mt-2 text-sm text-gray-700">
                                            <span className="font-medium">{tQaLab('details.pipelineActionSetImpactLabel')}:</span>{' '}
                                            {item.expectedImpact || '-'}
                                        </p>
                                        <p className="mt-2 text-sm text-gray-700">
                                            <span className="font-medium">{tQaLab('details.pipelineActionSetRationaleLabel')}:</span>{' '}
                                            {item.rationale || '-'}
                                        </p>
                                        <p className="mt-2 text-sm text-gray-700">
                                            <span className="font-medium">{tQaLab('details.pipelineActionSetEvidenceLabel')}:</span>{' '}
                                            {item.evidence || '-'}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h2 className="text-base font-semibold text-gray-900">{tQaLab('details.findingsTitle')}</h2>
                        {report.findings.length === 0 ? (
                            <p className="mt-3 text-sm text-gray-500">{tQaLab('details.emptyFindings')}</p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {report.findings.map((finding, index) => (
                                    <div key={`${finding.violatedRule}-${index}`} className="rounded-lg border border-gray-200 p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <span
                                                className={cn(
                                                    'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                                                    getSeverityBadgeClass(finding.severity)
                                                )}
                                            >
                                                {tQaLab(`details.severity.${finding.severity}`)}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {tQaLab('details.confidenceLabel')}: {finding.confidence ?? '-'}
                                            </span>
                                        </div>
                                        <p className="mt-3 text-sm font-medium text-gray-900">
                                            {finding.violatedRule}
                                        </p>
                                        <p className="mt-2 text-sm text-gray-700">
                                            <span className="font-medium">{tQaLab('details.findingEvidenceLabel')}:</span>{' '}
                                            {finding.evidence}
                                        </p>
                                        <p className="mt-2 text-sm text-gray-700">
                                            <span className="font-medium">{tQaLab('details.findingRationaleLabel')}:</span>{' '}
                                            {finding.rationale}
                                        </p>
                                        <p className="mt-2 text-sm text-gray-700">
                                            <span className="font-medium">{tQaLab('details.findingFixLabel')}:</span>{' '}
                                            {finding.suggestedFix}
                                        </p>
                                        <p className="mt-2 text-xs text-gray-600">
                                            {tQaLab('details.actionMeta', {
                                                layer: finding.targetLayer,
                                                effort: finding.effort
                                            })}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                        <h2 className="text-base font-semibold text-gray-900">{tQaLab('details.executionCasesTitle')}</h2>
                        {report.cases.length === 0 ? (
                            <p className="mt-3 text-sm text-gray-500">{tQaLab('details.emptyCases')}</p>
                        ) : (
                            <div className="mt-4 space-y-4">
                                {report.cases.map((caseItem, caseIndex) => (
                                    <div key={`${caseItem.caseId}-${caseIndex}`} className="rounded-lg border border-gray-200 p-3">
                                        {(() => {
                                            const caseCoverage = intakeCoverageByCase.get(caseItem.caseId)
                                            if (!caseCoverage) return null
                                            return (
                                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50 p-2">
                                                    <span
                                                        className={cn(
                                                            'inline-flex rounded-full px-2 py-1 text-xs font-medium',
                                                            getIntakeReadinessBadgeClass(caseCoverage.handoffReadiness)
                                                        )}
                                                    >
                                                        {tQaLab(`details.pipelineStatus.${caseCoverage.handoffReadiness}`)}
                                                    </span>
                                                    <span className="text-xs text-gray-600">
                                                        {tQaLab('details.intakeCoverageCaseSummary', {
                                                            fulfilled: caseCoverage.fulfilledFieldsCount,
                                                            required: caseCoverage.requiredFieldsTotal
                                                        })}{' '}
                                                        ({formatPercent(caseCoverage.fulfillmentCoverage)})
                                                    </span>
                                                </div>
                                            )
                                        })()}
                                        <p className="text-sm font-semibold text-gray-900">
                                            {caseItem.title} ({caseItem.caseId})
                                        </p>
                                        <p className="mt-1 text-xs text-gray-600">
                                            {tQaLab('details.caseGoalLabel')}: {caseItem.goal}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-600">
                                            {tQaLab('details.caseCustomerProfileLabel')}: {caseItem.customerProfile}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-600">
                                            {tQaLab('details.caseTypeLabel')}: {caseItem.leadTemperature}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-600">
                                            {tQaLab('details.caseInfoSharingLabel')}: {caseItem.informationSharing}
                                        </p>
                                        {(() => {
                                            const caseCoverage = intakeCoverageByCase.get(caseItem.caseId)
                                            if (!caseCoverage || caseCoverage.missingFields.length === 0) return null
                                            return (
                                                <p className="mt-1 text-xs text-amber-700">
                                                    {tQaLab('details.intakeCoverageMissingLabel')}: {caseCoverage.missingFields.join(', ')}
                                                </p>
                                            )
                                        })()}

                                        <div className="mt-3 space-y-3">
                                            {caseItem.turns.map((turn, turnIndex) => (
                                                <div key={`${caseItem.caseId}-turn-${turnIndex}`} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                                                    <p className="text-xs font-medium text-gray-600">
                                                        {tQaLab('details.turnLabel')}: {turn.turnIndex ?? turnIndex + 1}
                                                    </p>
                                                    <p className="mt-2 text-sm text-gray-800">
                                                        <span className="font-medium">{tQaLab('details.customerLabel')}:</span>{' '}
                                                        {turn.customerMessage}
                                                    </p>
                                                    <p className="mt-2 text-sm text-gray-800">
                                                        <span className="font-medium">{tQaLab('details.assistantLabel')}:</span>{' '}
                                                        {turn.assistantResponse}
                                                    </p>
                                                    <p className="mt-2 text-xs text-gray-600">
                                                        {tQaLab('details.turnTokensLabel')}: {formatNumber(turn.totalTokens, locale)}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
