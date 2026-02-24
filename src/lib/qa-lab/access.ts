import type { UserRole } from '@/types/database'

export const QA_LAB_ALLOWED_ADMIN_EMAIL = 'togayaytemiz@gmail.com'

function normalizeEmail(email: string | null | undefined) {
    return (email ?? '').trim().toLowerCase()
}

export function isQaLabAllowedAdminEmail(email: string | null | undefined) {
    return normalizeEmail(email) === QA_LAB_ALLOWED_ADMIN_EMAIL
}

export function canAccessQaLab(options: {
    userEmail?: string | null
    userRole?: UserRole | null
    isSystemAdmin?: boolean
}) {
    if (!isQaLabAllowedAdminEmail(options.userEmail)) {
        return false
    }

    if (options.isSystemAdmin) {
        return true
    }

    return options.userRole === 'admin'
}
