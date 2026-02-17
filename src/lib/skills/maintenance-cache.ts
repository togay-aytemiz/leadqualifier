const checkedOrganizationIds = new Set<string>()

export function shouldRunSkillsMaintenanceForOrganization(organizationId: string) {
    const normalized = organizationId.trim()
    if (!normalized) return false

    if (checkedOrganizationIds.has(normalized)) {
        return false
    }

    checkedOrganizationIds.add(normalized)
    return true
}

export function resetSkillsMaintenanceCache() {
    checkedOrganizationIds.clear()
}
