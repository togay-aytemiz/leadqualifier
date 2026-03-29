import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../../../messages/tr.json'
import { CheckoutLegalConsentModal } from './CheckoutLegalConsentModal'

describe('CheckoutLegalConsentModal', () => {
    it('renders optional summary details and a custom provider notice', () => {
        const html = renderToStaticMarkup(
            <NextIntlClientProvider locale="tr" messages={messages} timeZone="Europe/Istanbul">
                <CheckoutLegalConsentModal
                    flowType="subscription"
                    summary="Gelişmiş • ₺649 / ay • 2.000 kredi"
                    summaryDetails={[
                        {
                            label: 'Mevcut plan',
                            value: 'Temel • ₺349 / ay'
                        },
                        {
                            label: 'Bugünkü tahsilat',
                            value: 'Kesin tutar bu adımda gösterilmez.'
                        }
                    ]}
                    providerNotice="Bu değişiklik Iyzico abonelik altyapısında işlenir."
                    action={() => {}}
                    hiddenFields={[
                        { name: 'organizationId', value: 'org_1' },
                        { name: 'planId', value: 'growth' }
                    ]}
                    onClose={() => {}}
                />
            </NextIntlClientProvider>
        )

        expect(html).toContain('Mevcut plan')
        expect(html).toContain('Temel • ₺349 / ay')
        expect(html).toContain('Bugünkü tahsilat')
        expect(html).toContain('Bu değişiklik Iyzico abonelik altyapısında işlenir.')
    })
})
