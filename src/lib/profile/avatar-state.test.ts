import { describe, expect, it, vi } from 'vitest'
import { commitProfileAvatarSave } from './avatar-state'

describe('commitProfileAvatarSave', () => {
    it('updates avatar state and refreshes the surrounding layout after a successful save', () => {
        let avatarUrlState: string | null = null
        let baselineState = {
            name: 'Seray Aytemiz',
            avatarUrl: null as string | null
        }

        const setAvatarStatus = vi.fn()
        const refreshLayout = vi.fn()

        commitProfileAvatarSave({
            avatarUrl: 'https://cdn.example.com/profile-photo.webp',
            successMessage: 'Profil fotoğrafı güncellendi.',
            setAvatarUrl: (nextAvatarUrl) => {
                avatarUrlState = nextAvatarUrl
            },
            setBaseline: (updater) => {
                baselineState = updater(baselineState)
            },
            setAvatarStatus,
            refreshLayout
        })

        expect(avatarUrlState).toBe('https://cdn.example.com/profile-photo.webp')
        expect(baselineState.avatarUrl).toBe('https://cdn.example.com/profile-photo.webp')
        expect(setAvatarStatus).toHaveBeenCalledWith('Profil fotoğrafı güncellendi.')
        expect(refreshLayout).toHaveBeenCalledTimes(1)
    })
})
