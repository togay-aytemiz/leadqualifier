'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { buildLocalizedPath } from '@/lib/i18n/locale-path'

type SaveBillingProfileErrorCode = 'unauthorized' | 'invalid_input' | 'request_failed'

export interface SaveOrganizationBillingProfileState {
    status: 'idle' | 'success' | 'error'
    errorCode: SaveBillingProfileErrorCode | null
}

function readRequiredString(formData: FormData, field: string) {
    return String(formData.get(field) ?? '').trim()
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function saveOrganizationBillingProfile(
    _prevState: SaveOrganizationBillingProfileState | null,
    formData: FormData
): Promise<SaveOrganizationBillingProfileState> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return {
            status: 'error',
            errorCode: 'unauthorized'
        }
    }

    const organizationId = readRequiredString(formData, 'organizationId')
    const locale = readRequiredString(formData, 'locale') || 'tr'
    const companyName = readRequiredString(formData, 'companyName')
    const billingEmail = readRequiredString(formData, 'billingEmail')
    const billingPhone = readRequiredString(formData, 'billingPhone')
    const taxIdentityNumber = readRequiredString(formData, 'taxIdentityNumber')
    const addressLine1 = readRequiredString(formData, 'addressLine1')
    const city = readRequiredString(formData, 'city')
    const postalCode = readRequiredString(formData, 'postalCode')
    const country = readRequiredString(formData, 'country')

    if (
        !organizationId
        || !companyName
        || !billingEmail
        || !billingPhone
        || !taxIdentityNumber
        || !addressLine1
        || !city
        || !postalCode
        || !country
        || !isValidEmail(billingEmail)
    ) {
        return {
            status: 'error',
            errorCode: 'invalid_input'
        }
    }

    const membershipCheck = await supabase.rpc('assert_org_member_or_admin', {
        target_organization_id: organizationId
    })
    if (membershipCheck.error) {
        return {
            status: 'error',
            errorCode: 'unauthorized'
        }
    }

    const { error } = await supabase
        .from('organization_billing_profiles')
        .upsert({
            organization_id: organizationId,
            company_name: companyName,
            billing_email: billingEmail,
            billing_phone: billingPhone,
            tax_identity_number: taxIdentityNumber,
            address_line_1: addressLine1,
            city,
            postal_code: postalCode,
            country
        }, {
            onConflict: 'organization_id'
        })

    if (error) {
        console.error('Failed to save organization billing profile:', error)
        return {
            status: 'error',
            errorCode: 'request_failed'
        }
    }

    revalidatePath(buildLocalizedPath('/settings/billing', locale))
    revalidatePath(buildLocalizedPath('/settings/plans', locale))

    return {
        status: 'success',
        errorCode: null
    }
}
