export interface DeleteOrganizationDataInput {
    organizationId: string
    password: string
}

export interface NormalizedDeleteOrganizationDataInput {
    organizationId: string
    password: string
}

export function normalizeDeleteOrganizationDataInput(input: DeleteOrganizationDataInput): NormalizedDeleteOrganizationDataInput {
    const organizationId = (input.organizationId ?? '').trim()
    if (!organizationId) {
        throw new Error('Invalid organization id')
    }

    const password = (input.password ?? '').trim()
    if (!password) {
        throw new Error('Missing password')
    }

    return {
        organizationId,
        password
    }
}
