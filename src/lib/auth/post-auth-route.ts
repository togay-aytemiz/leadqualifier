export function resolvePostAuthRoute({
    isSystemAdmin,
    hasExplicitOrganizationSelection
}: {
    isSystemAdmin: boolean
    hasExplicitOrganizationSelection: boolean
}): '/admin' | '/inbox' {
    if (isSystemAdmin && !hasExplicitOrganizationSelection) {
        return '/admin'
    }

    return '/inbox'
}
