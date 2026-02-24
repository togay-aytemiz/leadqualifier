'use server'

import { createHash } from 'node:crypto'

import { createClient } from '@/lib/supabase/server'
import {
    assertTenantWriteAllowed,
    resolveActiveOrganizationContext
} from '@/lib/organizations/active-context'
import type { Json, QaLabRun, QaLabRunPreset, UserRole } from '@/types/database'
import { getQaLabPresetConfig, isQaLabPreset } from '@/lib/qa-lab/presets'
import { executeQaLabRunById } from '@/lib/qa-lab/executor'
import { getCompatFixtureMinLinesForInsert } from '@/lib/qa-lab/run-insert-compat'
import { canAccessQaLab } from '@/lib/qa-lab/access'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

const DEFAULT_RUN_LIST_LIMIT = 20
const MAX_RUN_LIST_LIMIT = 100
const DEFAULT_WORKER_BATCH_SIZE = 1
const MAX_WORKER_BATCH_SIZE = 3

interface OrganizationMembershipRow {
    organization_id: string
    role: UserRole
}

interface QaLabRunWriteAccess {
    userId: string
    organizationId: string
}

interface QueuedQaLabRunCandidate {
    id: string
    started_at: string | null
}

export interface QaLabQueueWorkerBatchResult {
    requested: number
    claimed: number
    executed: number
    failed: number
    claimedRunIds: string[]
    failedRunIds: string[]
}

function clampRunListLimit(limit: number | undefined): number {
    const numericLimit = typeof limit === 'number' ? limit : Number.NaN
    if (!Number.isFinite(numericLimit)) {
        return DEFAULT_RUN_LIST_LIMIT
    }
    return Math.min(MAX_RUN_LIST_LIMIT, Math.max(1, Math.floor(numericLimit)))
}

function clampWorkerBatchSize(value: number | undefined): number {
    const numeric = typeof value === 'number' ? value : Number.NaN
    if (!Number.isFinite(numeric)) {
        return DEFAULT_WORKER_BATCH_SIZE
    }
    return Math.min(MAX_WORKER_BATCH_SIZE, Math.max(1, Math.floor(numeric)))
}

function resolveQaLabModelNames() {
    const generatorModel = process.env.AI_QA_LAB_GENERATOR_MODEL?.trim() || 'gpt-4o-mini'
    const judgeModel = process.env.AI_QA_LAB_JUDGE_MODEL?.trim() || 'gpt-4o-mini'

    return {
        generatorModel,
        judgeModel
    }
}

async function getCurrentUserId(supabase: SupabaseClientLike) {
    const {
        data: { user },
        error
    } = await supabase.auth.getUser()

    if (error || !user) {
        throw new Error('Unauthorized')
    }

    return user.id
}

async function getMembershipForUser(
    supabase: SupabaseClientLike,
    userId: string,
    organizationId: string
): Promise<OrganizationMembershipRow | null> {
    const { data, error } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .maybeSingle()

    if (error) {
        throw new Error(`Failed to load organization membership: ${error.message}`)
    }

    if (!data) {
        return null
    }

    return data as OrganizationMembershipRow
}

async function assertQaLabRunWriteAccess(
    supabase: SupabaseClientLike,
    options?: { allowSystemAdmin?: boolean }
): Promise<QaLabRunWriteAccess> {
    const userId = await getCurrentUserId(supabase)
    const activeOrgContext = await resolveActiveOrganizationContext(supabase)
    const activeOrganizationId = activeOrgContext?.activeOrganizationId
    if (!activeOrganizationId) {
        throw new Error('No active organization selected')
    }

    if (activeOrgContext?.isSystemAdmin) {
        if (!options?.allowSystemAdmin) {
            throw new Error('Read-only impersonation mode')
        }
        if (!canAccessQaLab({
            userEmail: activeOrgContext.userEmail,
            isSystemAdmin: true
        })) {
            throw new Error('Forbidden')
        }
        return {
            userId,
            organizationId: activeOrganizationId
        }
    }

    await assertTenantWriteAllowed(supabase)

    const membership = await getMembershipForUser(supabase, userId, activeOrganizationId)

    if (!membership) {
        throw new Error('No organization membership found')
    }

    if (!canAccessQaLab({
        userEmail: activeOrgContext.userEmail,
        userRole: membership.role
    })) {
        throw new Error('Forbidden')
    }

    return {
        userId,
        organizationId: membership.organization_id
    }
}

export async function listQaLabRuns(organizationId: string, options?: { limit?: number }) {
    const supabase = await createClient()
    const limit = clampRunListLimit(options?.limit)

    const { data, error } = await supabase
        .from('qa_runs')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        throw new Error(`Failed to load QA runs: ${error.message}`)
    }

    return (data ?? []) as QaLabRun[]
}

export async function getQaLabRunById(runId: string, organizationId: string) {
    const normalizedRunId = runId.trim()
    if (!normalizedRunId) return null

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('qa_runs')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('id', normalizedRunId)
        .maybeSingle()

    if (error) {
        throw new Error(`Failed to load QA run: ${error.message}`)
    }

    return (data ?? null) as QaLabRun | null
}

export async function getCurrentUserQaLabRole(organizationId: string): Promise<UserRole | null> {
    const supabase = await createClient()
    const userId = await getCurrentUserId(supabase)

    const { data, error } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .maybeSingle()

    if (error) {
        throw new Error(`Failed to resolve QA Lab role: ${error.message}`)
    }

    return (data?.role as UserRole | null | undefined) ?? null
}

export async function createQaLabRun(
    presetInput: QaLabRunPreset | string,
    options?: { allowSystemAdmin?: boolean }
) {
    if (!isQaLabPreset(presetInput)) {
        throw new Error('Invalid QA Lab preset')
    }

    const supabase = await createClient()
    const access = await assertQaLabRunWriteAccess(supabase, options)

    const preset = getQaLabPresetConfig(presetInput)
    const models = resolveQaLabModelNames()
    const buildRunPayload = (fixtureMinLines: number) => {
        const runConfigSnapshot = {
            version: 'v1',
            preset: preset.id,
            source: 'manual_admin',
            surface: 'simulator',
            tokenBudget: preset.maxTokenBudget,
            scenarioCount: preset.scenarioCount,
            maxTurnsPerScenario: preset.maxTurnsPerScenario,
            fixtureMinLines,
            fixtureStyleMix: preset.fixtureStyleMix,
            generatorModel: models.generatorModel,
            judgeModel: models.judgeModel
        }
        const runConfigHash = createHash('sha256')
            .update(JSON.stringify(runConfigSnapshot))
            .digest('hex')

        return {
            organization_id: access.organizationId,
            requested_by: access.userId,
            preset: preset.id,
            status: 'queued',
            result: 'pending',
            source: 'manual_admin',
            surface: 'simulator',
            token_budget: preset.maxTokenBudget,
            scenario_count: preset.scenarioCount,
            max_turns_per_scenario: preset.maxTurnsPerScenario,
            fixture_min_lines: fixtureMinLines,
            fixture_style_mix: preset.fixtureStyleMix as unknown as Json,
            generator_model: models.generatorModel,
            judge_model: models.judgeModel,
            run_config_hash: runConfigHash,
            run_config_snapshot: runConfigSnapshot as unknown as Json,
            report: {} as Json,
            started_at: null,
            finished_at: null
        } satisfies Omit<QaLabRun, 'id' | 'created_at' | 'updated_at'>
    }

    const insertRunPayload = async (
        payload: Omit<QaLabRun, 'id' | 'created_at' | 'updated_at'>
    ) => supabase
        .from('qa_runs')
        .insert(payload)
        .select('*')
        .single()

    let payload = buildRunPayload(preset.fixtureMinLines)
    let { data, error } = await insertRunPayload(payload)

    if (error) {
        const compatFixtureMinLines = getCompatFixtureMinLinesForInsert(
            payload.fixture_min_lines,
            error.message
        )

        if (compatFixtureMinLines !== payload.fixture_min_lines) {
            payload = buildRunPayload(compatFixtureMinLines)
            const retry = await insertRunPayload(payload)
            data = retry.data
            error = retry.error
        }
    }

    if (error) {
        throw new Error(`Failed to create QA run: ${error.message}`)
    }

    return data as QaLabRun
}

export async function executeQaLabRun(
    runId: string,
    options?: { allowSystemAdmin?: boolean }
) {
    const normalizedRunId = runId.trim()
    if (!normalizedRunId) {
        throw new Error('Run id is required')
    }

    const supabase = await createClient()
    const access = await assertQaLabRunWriteAccess(supabase, options)

    const { data: run, error } = await supabase
        .from('qa_runs')
        .select('id, organization_id')
        .eq('id', normalizedRunId)
        .maybeSingle()

    if (error) {
        throw new Error(`Failed to load QA run: ${error.message}`)
    }

    if (!run) {
        throw new Error('QA run not found')
    }

    if (run.organization_id !== access.organizationId) {
        throw new Error('Forbidden')
    }

    return executeQaLabRunById(normalizedRunId, { supabase })
}

export async function executeQaLabRunForAdmin(runId: string) {
    return executeQaLabRun(runId, { allowSystemAdmin: true })
}

export async function createAndExecuteQaLabRun(
    presetInput: QaLabRunPreset | string,
    options?: { allowSystemAdmin?: boolean }
) {
    const run = await createQaLabRun(presetInput, options)
    return executeQaLabRun(run.id, options)
}

export async function createAndExecuteQaLabRunForAdmin(presetInput: QaLabRunPreset | string) {
    return createAndExecuteQaLabRun(presetInput, { allowSystemAdmin: true })
}

export async function createAndQueueQaLabRun(
    presetInput: QaLabRunPreset | string,
    options?: { allowSystemAdmin?: boolean }
) {
    return createQaLabRun(presetInput, options)
}

export async function createAndQueueQaLabRunForAdmin(presetInput: QaLabRunPreset | string) {
    return createQaLabRun(presetInput, { allowSystemAdmin: true })
}

async function claimQueuedRunsForOrganization(
    supabase: SupabaseClientLike,
    organizationId: string,
    batchSize: number
) {
    const { data: queueRows, error: queueError } = await supabase
        .from('qa_runs')
        .select('id, started_at')
        .eq('organization_id', organizationId)
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(batchSize)

    if (queueError) {
        throw new Error(`Failed to load queued QA runs: ${queueError.message}`)
    }

    const claimedRuns: QueuedQaLabRunCandidate[] = []
    const candidates = (queueRows ?? []) as QueuedQaLabRunCandidate[]

    for (const candidate of candidates) {
        const now = new Date().toISOString()
        const { data: claimed, error: claimError } = await supabase
            .from('qa_runs')
            .update({
                status: 'running',
                started_at: candidate.started_at ?? now,
                updated_at: now
            })
            .eq('id', candidate.id)
            .eq('organization_id', organizationId)
            .eq('status', 'queued')
            .select('id, started_at')
            .maybeSingle()

        if (claimError) {
            throw new Error(`Failed to claim QA run: ${claimError.message}`)
        }

        if (claimed) {
            claimedRuns.push(claimed as QueuedQaLabRunCandidate)
        }
    }

    return claimedRuns
}

function buildWorkerErrorReport(error: unknown): Json {
    const message = error instanceof Error
        ? error.message
        : 'Unknown queue worker error'

    return {
        version: 'v2',
        worker_error: {
            message
        },
        generated_at: new Date().toISOString()
    } as unknown as Json
}

export async function runQaLabQueueWorkerBatch(
    maxRuns?: number,
    options?: { allowSystemAdmin?: boolean }
): Promise<QaLabQueueWorkerBatchResult> {
    const supabase = await createClient()
    const access = await assertQaLabRunWriteAccess(supabase, options)
    const requested = clampWorkerBatchSize(maxRuns)
    const claimedRuns = await claimQueuedRunsForOrganization(
        supabase,
        access.organizationId,
        requested
    )

    let executed = 0
    let failed = 0
    const failedRunIds: string[] = []

    for (const run of claimedRuns) {
        try {
            await executeQaLabRunById(run.id, { supabase })
            executed += 1
        } catch (error) {
            failed += 1
            failedRunIds.push(run.id)

            const { error: updateError } = await supabase
                .from('qa_runs')
                .update({
                    status: 'failed',
                    result: 'pending',
                    report: buildWorkerErrorReport(error),
                    finished_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', run.id)
                .eq('organization_id', access.organizationId)

            if (updateError) {
                throw new Error(`Failed to update QA run after worker error: ${updateError.message}`)
            }
        }
    }

    return {
        requested,
        claimed: claimedRuns.length,
        executed,
        failed,
        claimedRunIds: claimedRuns.map((run) => run.id),
        failedRunIds
    }
}

export async function runQaLabQueueWorkerBatchForAdmin(maxRuns?: number) {
    return runQaLabQueueWorkerBatch(maxRuns, { allowSystemAdmin: true })
}
