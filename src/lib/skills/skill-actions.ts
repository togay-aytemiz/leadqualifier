import { v4 as uuidv4 } from 'uuid'

import type { SkillAction } from '@/types/database'

const SKILL_ACTION_BUTTON_ID_PREFIX = 'skill_action'
const WHATSAPP_REPLY_BUTTON_LIMIT = 3
const MAX_BUTTON_TITLE_LENGTH = 20

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function truncateButtonTitle(label: string) {
    return Array.from(label).slice(0, MAX_BUTTON_TITLE_LENGTH).join('')
}

function normalizeUrl(value: string): string | null {
    try {
        const parsed = new URL(value)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
        return parsed.toString()
    } catch {
        return null
    }
}

function normalizeSkillAction(raw: unknown): SkillAction | null {
    if (!isRecord(raw)) return null

    const type = asTrimmedString(raw.type)
    const label = asTrimmedString(raw.label)
    if (!type || !label) return null

    const id = asTrimmedString(raw.id) ?? uuidv4()
    const normalizedLabel = truncateButtonTitle(label)
    if (!normalizedLabel) return null

    if (type === 'trigger_skill') {
        const targetSkillId = asTrimmedString(raw.target_skill_id)
        if (!targetSkillId) return null
        return {
            id,
            type: 'trigger_skill',
            label: normalizedLabel,
            target_skill_id: targetSkillId
        }
    }

    if (type === 'open_url') {
        const rawUrl = asTrimmedString(raw.url)
        if (!rawUrl) return null

        const normalizedUrl = normalizeUrl(rawUrl)
        if (!normalizedUrl) return null

        return {
            id,
            type: 'open_url',
            label: normalizedLabel,
            url: normalizedUrl
        }
    }

    return null
}

export function sanitizeSkillActions(input: unknown): SkillAction[] {
    if (!Array.isArray(input)) return []

    const dedupedIds = new Set<string>()
    const normalized: SkillAction[] = []

    for (const rawAction of input) {
        const action = normalizeSkillAction(rawAction)
        if (!action) continue
        if (dedupedIds.has(action.id)) continue
        dedupedIds.add(action.id)
        normalized.push(action)
    }

    return normalized
}

export function buildSkillActionButtonId(skillId: string, actionId: string) {
    return `${SKILL_ACTION_BUTTON_ID_PREFIX}:${skillId}:${actionId}`
}

export function parseSkillActionButtonId(input: string | null): { sourceSkillId: string; actionId: string } | null {
    if (!input) return null

    const match = input.match(/^skill_action:([^:]+):([^:]+)$/)
    if (!match) return null

    const sourceSkillId = match[1]?.trim()
    const actionId = match[2]?.trim()
    if (!sourceSkillId || !actionId) return null

    return {
        sourceSkillId,
        actionId
    }
}

export function buildReplyButtonsForSkill(skillId: string, actions: SkillAction[]) {
    return actions
        .slice(0, WHATSAPP_REPLY_BUTTON_LIMIT)
        .map((action) => ({
            id: buildSkillActionButtonId(skillId, action.id),
            title: truncateButtonTitle(action.label)
        }))
        .filter((button) => button.id.length > 0 && button.title.length > 0)
}
