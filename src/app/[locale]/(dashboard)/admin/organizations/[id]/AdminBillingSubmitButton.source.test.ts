import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const buttonSource = readFileSync(
    'src/app/[locale]/(dashboard)/admin/organizations/[id]/AdminBillingSubmitButton.tsx',
    'utf8'
)
const pageSource = readFileSync(
    'src/app/[locale]/(dashboard)/admin/organizations/[id]/page.tsx',
    'utf8'
)

describe('admin billing submit button source', () => {
    it('uses form pending state to disable repeated billing submissions', () => {
        expect(buttonSource).toContain("'use client'")
        expect(buttonSource).toContain('useFormStatus')
        expect(buttonSource).toContain('Loader2')
        expect(buttonSource).toContain('disabled={pending}')
        expect(buttonSource).toContain("tAdmin('organizationDetail.manualActions.submitting')")
    })

    it('is used by every manual billing action form on the organization detail page', () => {
        expect(pageSource).toContain("import { AdminBillingSubmitButton } from './AdminBillingSubmitButton'")
        expect(pageSource.match(/<AdminBillingSubmitButton/g)?.length).toBeGreaterThanOrEqual(7)
    })
})
