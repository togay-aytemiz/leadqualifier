import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SOURCE_PATH = path.resolve(process.cwd(), 'src/components/channels/WebOnboardingPage.tsx')
const TR_MESSAGES_PATH = path.resolve(process.cwd(), 'messages/tr.json')

describe('WebOnboardingPage source', () => {
    it('generates a configurable embed script and sandboxed preview', () => {
        const source = fs.readFileSync(SOURCE_PATH, 'utf8')

        expect(source).toContain('data-qualy-title')
        expect(source).toContain('data-qualy-subtitle')
        expect(source).toContain('data-qualy-open-label')
        expect(source).toContain('data-qualy-logo-url')
        expect(source).toContain('data-qualy-theme-color')
        expect(source).toContain('data-qualy-show-logo')
        expect(source).toContain('data-qualy-show-launcher-text')
        expect(source).toContain('data-qualy-show-launcher-subtitle')
        expect(source).toContain('data-qualy-show-header-subtitle')
        expect(source).toContain('data-qualy-show-footer')
        expect(source).toContain('data-qualy-footer-text')
        expect(source).toContain('PUBLIC_WIDGET_ORIGIN')
        expect(source).toContain('process.env.NEXT_PUBLIC_APP_URL')
        expect(source).toContain('previewScriptTag')
        expect(source).toContain('themeSwatches')
        expect(source).toContain("type=\"color\"")
        expect(source).toContain('/embed/web/')
        expect(source).toContain('organizationId')
        expect(source).not.toContain('/embed/demo/')
        expect(source).toContain('prepareWebWidgetLogoUpload')
        expect(source).toContain('uploadToSignedUrl')
        expect(source).toContain('buildDefaultTitle(botName, organizationName)')
        expect(source).toContain('buildDefaultOpenLabel(organizationName)')
        expect(source).toContain("t.raw('onboarding.web.defaults')")
        expect(source).toContain('navigator.clipboard.writeText')
        expect(source).toContain('previewSrcDoc')
        expect(source).toContain('<iframe')
        expect(source).not.toContain("t('onboarding.web.fields.slug')")
    })

    it('keeps Turkish web appearance labels free of English UI terms', () => {
        const messages = JSON.parse(fs.readFileSync(TR_MESSAGES_PATH, 'utf8'))
        const webMessages = messages.Channels.onboarding.web
        const visibleLabels = JSON.stringify({
            fields: webMessages.fields,
            toggles: webMessages.toggles,
        })

        expect(visibleLabels).not.toMatch(/\b(Launcher|Header|Footer)\b/)
    })
})
