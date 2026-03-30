import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ONBOARDING_PAGE_PATH = path.resolve(process.cwd(), 'src/components/channels/WhatsAppOnboardingPage.tsx')
const CONNECT_MODAL_PATH = path.resolve(process.cwd(), 'src/components/channels/ConnectWhatsAppModal.tsx')

describe('WhatsApp embedded signup mode source guard', () => {
    it('passes the selected mode from the onboarding page into signup completion', () => {
        const source = fs.readFileSync(ONBOARDING_PAGE_PATH, 'utf8')

        expect(source).toContain('const result = await completeWhatsAppEmbeddedSignupChannel(organizationId, {')
        expect(source).toContain('                mode,')
    })

    it('passes the selected mode from the connect modal into signup completion', () => {
        const source = fs.readFileSync(CONNECT_MODAL_PATH, 'utf8')

        expect(source).toContain('const result = await completeWhatsAppEmbeddedSignupChannel(organizationId, {')
        expect(source).toContain('                mode,')
    })
})
