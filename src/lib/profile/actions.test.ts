import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createClientMock,
    createServiceClientMock,
    storageCreateSignedUploadUrlMock,
    storageGetPublicUrlMock,
    storageRemoveMock
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    createServiceClientMock: vi.fn(),
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

import { prepareProfileAvatarUpload, saveProfileAvatarUpload } from './actions'

function createAuthSupabaseMock() {
    return {
        auth: {
            getUser: vi.fn(async () => ({
                data: {
                    user: {
                        id: 'user-1'
                    }
                }
            }))
        }
    }
}

describe('profile avatar actions', () => {
    beforeEach(() => {
        createClientMock.mockReset()
        createServiceClientMock.mockReset()
        storageCreateSignedUploadUrlMock.mockReset()
        storageGetPublicUrlMock.mockReset()
        storageRemoveMock.mockReset()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

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

    it('prepares a signed upload target for the current user avatar', async () => {
        createClientMock.mockResolvedValue(createAuthSupabaseMock())
        storageCreateSignedUploadUrlMock.mockResolvedValue({
            data: { token: 'upload-token-1' },
            error: null
        })
        storageGetPublicUrlMock.mockReturnValue({
            data: {
                publicUrl: 'https://project.supabase.co/storage/v1/object/public/profile-avatars/user-1/avatar-20260313120000.webp'
            }
        })

        const result = await prepareProfileAvatarUpload()

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.storagePath).toContain('user-1/avatar-')
        expect(result.storagePath.endsWith('.webp')).toBe(true)
        expect(result.uploadToken).toBe('upload-token-1')
        expect(result.publicUrl).toContain('/profile-avatars/user-1/avatar-')
    })

    it('persists avatar url and removes previous avatar object on replacement', async () => {
        const currentSupabase = createAuthSupabaseMock()
        const profileMaybeSingleMock = vi.fn(async () => ({
            data: {
                avatar_url: 'https://project.supabase.co/storage/v1/object/public/profile-avatars/user-1/avatar-old.webp'
            },
            error: null
        }))
        const profileEqForSelectMock = vi.fn(() => ({ maybeSingle: profileMaybeSingleMock }))

        const profileUpdateEqMock = vi.fn(async () => ({ error: null }))
        const profileUpdateMock = vi.fn(() => ({ eq: profileUpdateEqMock }))

        currentSupabase.from = vi.fn((table: string) => {
            if (table !== 'profiles') throw new Error(`Unexpected table ${table}`)

            if (profileEqForSelectMock.mock.calls.length === 0) {
                return {
                    select: vi.fn(() => ({ eq: profileEqForSelectMock }))
                }
            }

            return {
                update: profileUpdateMock
            }
        })

        createClientMock.mockResolvedValue(currentSupabase)
        storageGetPublicUrlMock.mockReturnValue({
            data: {
                publicUrl: 'https://project.supabase.co/storage/v1/object/public/profile-avatars/user-1/avatar-new.webp'
            }
        })
        storageRemoveMock.mockResolvedValue({
            data: null,
            error: null
        })

        const result = await saveProfileAvatarUpload('user-1/avatar-new.webp')

        expect(result.avatarUrl).toBe('https://project.supabase.co/storage/v1/object/public/profile-avatars/user-1/avatar-new.webp')
        expect(profileUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
            avatar_url: 'https://project.supabase.co/storage/v1/object/public/profile-avatars/user-1/avatar-new.webp'
        }))
        expect(storageRemoveMock).toHaveBeenCalledWith(['user-1/avatar-old.webp'])
    })
})
