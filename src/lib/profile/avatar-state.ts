interface ProfileAvatarBaseline {
    name: string
    avatarUrl: string | null
}

interface CommitProfileAvatarSaveOptions {
    avatarUrl: string
    successMessage: string
    setAvatarUrl: (avatarUrl: string) => void
    setBaseline: (updater: (current: ProfileAvatarBaseline) => ProfileAvatarBaseline) => void
    setAvatarStatus: (message: string) => void
    refreshLayout: () => void
}

export function commitProfileAvatarSave(options: CommitProfileAvatarSaveOptions) {
    options.setAvatarUrl(options.avatarUrl)
    options.setBaseline((current) => ({
        ...current,
        avatarUrl: options.avatarUrl
    }))
    options.setAvatarStatus(options.successMessage)
    options.refreshLayout()
}
