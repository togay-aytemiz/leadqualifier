import type { Message, Profile } from '@/types/database'

export interface InboxSenderProfile extends Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'> {}

export interface MessageSenderIdentity {
    kind: 'user' | 'contact' | 'bot' | 'system'
    displayName: string
    footerLabel: string
    avatarUrl: string | null
}

interface ResolveMessageSenderIdentityOptions {
    message: Message
    currentUserId: string | null
    currentUserProfile: InboxSenderProfile | null
    senderProfilesById: Record<string, InboxSenderProfile>
    contactName: string
    contactAvatarUrl: string | null
    youLabel: string
    botName: string
}

function trimString(value: string | null | undefined) {
    return typeof value === 'string' ? value.trim() : ''
}

function resolveProfileDisplayName(profile: InboxSenderProfile | null | undefined) {
    const fullName = trimString(profile?.full_name)
    if (fullName) return fullName

    const email = trimString(profile?.email)
    if (!email) return 'User'

    const localPart = email.split('@')[0]?.trim()
    return localPart || email
}

export function resolveMessageSenderIdentity(
    options: ResolveMessageSenderIdentityOptions
): MessageSenderIdentity {
    if (options.message.sender_type === 'bot') {
        return {
            kind: 'bot',
            displayName: options.botName,
            footerLabel: options.botName,
            avatarUrl: null
        }
    }

    if (options.message.sender_type === 'contact') {
        return {
            kind: 'contact',
            displayName: options.contactName,
            footerLabel: options.contactName,
            avatarUrl: options.contactAvatarUrl
        }
    }

    if (options.message.sender_type === 'system') {
        return {
            kind: 'system',
            displayName: 'System',
            footerLabel: 'System',
            avatarUrl: null
        }
    }

    const createdBy = trimString(options.message.created_by)
    const isCurrentUser = createdBy.length > 0 && createdBy === options.currentUserId
    const profile = isCurrentUser
        ? options.currentUserProfile
        : (createdBy ? options.senderProfilesById[createdBy] ?? null : null)
    const displayName = resolveProfileDisplayName(profile)

    return {
        kind: 'user',
        displayName,
        footerLabel: isCurrentUser ? options.youLabel : displayName,
        avatarUrl: trimString(profile?.avatar_url) || null
    }
}
