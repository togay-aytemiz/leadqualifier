import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import OrganizationSettingsClient from './OrganizationSettingsClient'

const { searchParamsMock } = vi.hoisted(() => ({
    searchParamsMock: vi.fn(() => new URLSearchParams())
}))

vi.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
    useLocale: () => 'tr'
}))

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        refresh: () => {},
        replace: () => {},
        push: () => {}
    }),
    useSearchParams: () => searchParamsMock(),
    usePathname: () => '/settings/organization'
}))

vi.mock('@/i18n/navigation', () => ({
    usePathname: () => '/settings/organization',
    useRouter: () => ({
        push: () => {},
        replace: () => {}
    })
}))

vi.mock('@/components/settings/OfferingProfileSection', () => ({
    OfferingProfileSection: () => <div data-testid="offering-profile-section" />
}))

vi.mock('@/components/settings/RequiredIntakeFieldsSection', () => ({
    RequiredIntakeFieldsSection: () => <div data-testid="required-intake-fields-section" />
}))

vi.mock('@/components/settings/ServiceCatalogSection', () => ({
    ServiceCatalogSection: () => <div data-testid="service-catalog-section" />
}))

vi.mock('@/components/settings/useUnsavedChangesGuard', () => ({
    useUnsavedChangesGuard: () => ({
        isDialogOpen: false,
        isSaving: false,
        closeDialog: () => {},
        handleDiscard: () => {},
        handleSave: () => {}
    })
}))

function renderClient() {
    return renderToStaticMarkup(
        <OrganizationSettingsClient
            initialName="Acme"
            organizationId="org_123"
            offeringProfile={null}
            offeringProfileSuggestions={[]}
            serviceCatalogItems={[]}
            serviceCandidates={[]}
            isReadOnly={false}
        />
    )
}

function renderClientWithKnowledgeExtractionInProgress() {
    return renderToStaticMarkup(
        <OrganizationSettingsClient
            initialName="Acme"
            organizationId="org_123"
            offeringProfile={null}
            offeringProfileSuggestions={[]}
            serviceCatalogItems={[]}
            serviceCandidates={[]}
            initialKnowledgeExtractionInProgress
            isReadOnly={false}
        />
    )
}

describe('OrganizationSettingsClient', () => {
    it('keeps calendar settings out of organization tabs once a dedicated settings page exists', () => {
        const markup = renderClient()

        expect(markup).toContain('tabs.general')
        expect(markup).toContain('tabs.organizationDetails')
        expect(markup).not.toContain('tabs.calendar')
        expect(markup).toContain('tabs.securityAndData')
    })

    it('opens organization details tab when the onboarding focus target requests it', () => {
        searchParamsMock.mockReturnValueOnce(new URLSearchParams('focus=organization-details'))

        const markup = renderClient()

        expect(markup).toContain('id="settings-tab-organizationDetails"')
        expect(markup).toContain('aria-selected="true"')
        expect(markup).toContain('settings-tab-panel-organizationDetails')
    })

    it('shows the AI extraction loading banner while knowledge-derived setup is still processing', () => {
        const markup = renderClientWithKnowledgeExtractionInProgress()

        expect(markup).toContain('knowledgeExtractionInProgressTitle')
        expect(markup).toContain('knowledgeExtractionInProgressDescription')
    })
})
