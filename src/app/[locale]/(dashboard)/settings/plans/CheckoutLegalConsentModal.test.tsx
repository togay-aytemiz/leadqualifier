import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../../../messages/tr.json'
import { CheckoutLegalConsentModal } from './CheckoutLegalConsentModal'

const checkoutLegalMessages = messages.billingPlans.checkoutLegal

describe('CheckoutLegalConsentModal', () => {
    it('uses provider-calculated copy for direct-upgrade charges', () => {
        expect(checkoutLegalMessages.details.chargeProviderCalculated).toBe('Tutar Iyzico tarafından değişiklik anında hesaplanır ve kayıtlı ödeme yöntemiyle tahsil edilir.')
    })

    it('defines a localized pending submit label for direct plan changes', () => {
        expect(checkoutLegalMessages.processing).toBe('İşleniyor...')
    })

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

    it('renders a simplified single-confirmation flow for existing plan changes', () => {
        const html = renderToStaticMarkup(
            <NextIntlClientProvider locale="tr" messages={messages} timeZone="Europe/Istanbul">
                <CheckoutLegalConsentModal
                    flowType="subscription"
                    consentVariant="plan_change"
                    title={checkoutLegalMessages.titleDirectAction}
                    description={checkoutLegalMessages.descriptionDirectAction}
                    summary="Gelişmiş • ₺649 / ay • 2.000 kredi"
                    summaryDetails={[
                        {
                            label: 'Mevcut plan',
                            value: 'Temel • ₺349 / ay'
                        },
                        {
                            label: 'Bugünkü tahsilat',
                            value: checkoutLegalMessages.details.chargeProviderCalculated
                        },
                        {
                            label: checkoutLegalMessages.details.savedPaymentMethodLabel,
                            value: checkoutLegalMessages.details.savedPaymentMethodGeneric
                        }
                    ]}
                    immediateStartLabel={checkoutLegalMessages.acceptPlanChange}
                    continueLabel={checkoutLegalMessages.continueDirectAction}
                    secondaryAction={{
                        label: checkoutLegalMessages.updatePaymentMethodInlineAction,
                        action: () => {},
                        hiddenFields: [
                            { name: 'organizationId', value: 'org_1' }
                        ]
                    }}
                    action={() => {}}
                    hiddenFields={[
                        { name: 'organizationId', value: 'org_1' },
                        { name: 'planId', value: 'growth' }
                    ]}
                    onClose={() => {}}
                />
            </NextIntlClientProvider>
        )

        expect(html).toContain(checkoutLegalMessages.titleDirectAction)
        expect(html).toContain(checkoutLegalMessages.acceptPlanChange)
        expect(html).toContain(checkoutLegalMessages.continueDirectAction)
        expect(html).toContain(checkoutLegalMessages.details.chargeProviderCalculated)
        expect(html).toContain(checkoutLegalMessages.savedPaymentMethodBannerNotice)
        expect(html).toContain(checkoutLegalMessages.savedPaymentMethodBannerHint)
        expect(html).toContain(checkoutLegalMessages.updatePaymentMethodInlineAction)
        expect(html).toContain('bg-amber-50')
        expect(html).toContain('type="hidden" name="acceptedRequiredDocs" value="accepted"')
        expect(html).not.toContain('₺300 ödeme yap')
        expect(html).not.toContain('₺300 plan farkı')
        expect(html).not.toContain('okudum ve kabul ediyorum')
        expect(html).not.toContain('Ödeme bu adımdan sonra Iyzico ekranında tamamlanır.')
    })
})
