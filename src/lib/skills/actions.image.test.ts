import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
    assertTenantWriteAllowedMock,
    createClientMock,
    createServiceClientMock,
    resolveActiveOrganizationContextMock,
    storageCreateSignedUploadUrlMock,
    storageGetPublicUrlMock,
    storageRemoveMock
} = vi.hoisted(() => ({
    assertTenantWriteAllowedMock: vi.fn(),
    createClientMock: vi.fn(),
    createServiceClientMock: vi.fn(),
    resolveActiveOrganizationContextMock: vi.fn(),
    storageCreateSignedUploadUrlMock: vi.fn(),
    storageGetPublicUrlMock: vi.fn(),
    storageRemoveMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createServiceClientMock
}))

vi.mock('@/lib/organizations/active-context', () => ({
    assertTenantWriteAllowed: assertTenantWriteAllowedMock,
    resolveActiveOrganizationContext: resolveActiveOrganizationContextMock
}))

vi.mock('@/lib/skills/skill-actions', () => ({
    sanitizeSkillActions: vi.fn((value) => value)
}))

vi.mock('@/lib/ai/embeddings', () => ({
    generateEmbeddings: vi.fn(),
    formatEmbeddingForPgvector: vi.fn()
}))

vi.mock('@/lib/skills/default-system-skills', () => ({
    buildDefaultSystemSkills: vi.fn()
}))

vi.mock('@/lib/leads/offering-profile', () => ({
    appendServiceCatalogCandidates: vi.fn(),
    appendOfferingProfileSuggestion: vi.fn(),
    appendRequiredIntakeFields: vi.fn()
}))

vi.mock('@/lib/skills/maintenance-cache', () => ({
    shouldRunSkillsMaintenanceForOrganization: vi.fn(() => false)
}))

import {
    deleteSkill,
    prepareSkillImageUpload,
    removeSkillImageUpload,
    updateSkill
} from './actions'

function createServerSupabaseMock() {
    return {
        from: vi.fn()
    }
}

describe('skill image server actions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
        resolveActiveOrganizationContextMock.mockResolvedValue({
            activeOrganizationId: 'org-1'
        })
        storageCreateSignedUploadUrlMock.mockResolvedValue({
            data: { token: 'upload-token-1' },
            error: null
        })
        storageGetPublicUrlMock.mockImplementation((storagePath: string) => ({
            data: {
                publicUrl: `https://project.supabase.co/storage/v1/object/public/skill-images/${storagePath}`
            }
        }))

        createServiceClientMock.mockReturnValue({
            storage: {
                from: vi.fn(() => ({
                    createSignedUploadUrl: storageCreateSignedUploadUrlMock,
                    getPublicUrl: storageGetPublicUrlMock,
                    remove: storageRemoveMock
                }))
            }
        })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('prepares a signed upload target for a skill image', async () => {
        const supabase = createServerSupabaseMock()
        createClientMock.mockResolvedValue(supabase)

        const result = await prepareSkillImageUpload('org-1')

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.storagePath).toContain('org-1/skill-image-')
        expect(result.storagePath.endsWith('.webp')).toBe(true)
        expect(result.uploadToken).toBe('upload-token-1')
        expect(result.publicUrl).toContain('/skill-images/org-1/')
    })

    it('creates unique upload targets when two uploads start in the same second', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-04-06T12:00:00.000Z'))
        const supabase = createServerSupabaseMock()
        createClientMock.mockResolvedValue(supabase)

        const firstResult = await prepareSkillImageUpload('org-1')
        const secondResult = await prepareSkillImageUpload('org-1')

        expect(firstResult.ok).toBe(true)
        expect(secondResult.ok).toBe(true)
        if (!firstResult.ok || !secondResult.ok) return

        expect(firstResult.storagePath).not.toBe(secondResult.storagePath)
    })

    it('rejects preparing uploads for a non-active organization', async () => {
        const supabase = createServerSupabaseMock()
        createClientMock.mockResolvedValue(supabase)

        await expect(prepareSkillImageUpload('org-2')).rejects.toThrow(
            'Skill image upload path does not belong to the active organization'
        )
    })

    it('removes the previous stored image when a skill image is replaced', async () => {
        const singleMock = vi
            .fn()
            .mockResolvedValueOnce({
                data: {
                    id: 'skill-1',
                    organization_id: 'org-1',
                    image_storage_path: 'org-1/skill-image-old.webp'
                },
                error: null
            })
            .mockResolvedValueOnce({
                data: {
                    id: 'skill-1',
                    organization_id: 'org-1',
                    title: 'Pricing',
                    response_text: 'Prices',
                    trigger_examples: ['price', 'pricing', 'cost'],
                    enabled: true,
                    requires_human_handover: false,
                    image_storage_path: 'org-1/skill-image-new.webp',
                    created_at: '2026-04-06T10:00:00.000Z',
                    updated_at: '2026-04-06T10:00:00.000Z'
                },
                error: null
            })
        const selectMock = vi.fn(() => ({ eq: vi.fn(() => ({ single: singleMock })) }))
        const updateEqMock = vi.fn(() => ({ select: vi.fn(() => ({ single: singleMock })) }))
        const updateMock = vi.fn(() => ({ eq: updateEqMock }))
        const supabase = {
            from: vi.fn((table: string) => {
                if (table !== 'skills') throw new Error(`Unexpected table ${table}`)
                if (selectMock.mock.calls.length === 0) {
                    return { select: selectMock }
                }
                return { update: updateMock }
            })
        }
        createClientMock.mockResolvedValue(supabase)
        storageRemoveMock.mockResolvedValue({ data: null, error: null })

        await updateSkill('skill-1', {
            image_storage_path: 'org-1/skill-image-new.webp',
            image_public_url: 'https://cdn.example.com/skill-image-new.webp',
            image_mime_type: 'image/webp',
            image_width: 1600,
            image_height: 900,
            image_size_bytes: 120000,
            image_original_filename: 'offer.webp'
        })

        expect(storageRemoveMock).toHaveBeenCalledWith(['org-1/skill-image-old.webp'])
    })

    it('removes the stored image object when deleting a skill', async () => {
        const singleMock = vi.fn(async () => ({
            data: {
                id: 'skill-1',
                organization_id: 'org-1',
                image_storage_path: 'org-1/skill-image-old.webp'
            },
            error: null
        }))
        const deleteEqMock = vi.fn(async () => ({ error: null }))
        const supabase = {
            from: vi.fn((table: string) => {
                if (table !== 'skills') throw new Error(`Unexpected table ${table}`)
                if (singleMock.mock.calls.length === 0) {
                    return {
                        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: singleMock })) }))
                    }
                }
                return {
                    delete: vi.fn(() => ({ eq: deleteEqMock }))
                }
            })
        }
        createClientMock.mockResolvedValue(supabase)
        storageRemoveMock.mockResolvedValue({ data: null, error: null })

        await deleteSkill('skill-1')

        expect(storageRemoveMock).toHaveBeenCalledWith(['org-1/skill-image-old.webp'])
        expect(deleteEqMock).toHaveBeenCalledWith('id', 'skill-1')
    })

    it('cleans up an uploaded skill image object on explicit removal', async () => {
        createClientMock.mockResolvedValue(createServerSupabaseMock())
        storageRemoveMock.mockResolvedValue({ data: null, error: null })

        await removeSkillImageUpload('org-1', 'org-1/skill-image-temp.webp')

        expect(storageRemoveMock).toHaveBeenCalledWith(['org-1/skill-image-temp.webp'])
    })

    it('rejects removing uploaded skill images outside the active organization', async () => {
        createClientMock.mockResolvedValue(createServerSupabaseMock())

        await expect(removeSkillImageUpload('org-2', 'org-2/skill-image-temp.webp')).rejects.toThrow(
            'Skill image upload path does not belong to the active organization'
        )
    })
})
