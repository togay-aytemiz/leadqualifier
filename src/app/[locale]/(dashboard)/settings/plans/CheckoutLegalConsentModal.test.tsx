import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../../../messages/tr.json'
import { CheckoutLegalConsentModal } from './CheckoutLegalConsentModal'

const checkoutLegalMessages = messages.billingPlans.checkoutLegal

describe('CheckoutLegalConsentModal', () => {
    it('uses hosted-checkout copy for direct-upgrade payment step messaging', () => {
        expect(checkoutLegalMessages.providerNoticeDirectAction).toBe('Onaydan sonra güvenli Iyzico ödeme ekranına geçersiniz. Kart bilgisi istenirse işlemi orada tamamlarsınız.')
        expect(checkoutLegalMessages.continueDirectAction).toBe('Ödeme ekranına devam et')
        expect(checkoutLegalMessages.continueDirectActionWithCharge).toBe('{price} ödeme için devam et')
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
                            value: 'Bugün ₺300 plan farkı tahsil edilir.'
                        },
                    ]}
                    immediateStartLabel={checkoutLegalMessages.acceptPlanChange}
                    continueLabel={checkoutLegalMessages.continueDirectAction}
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
        expect(html).toContain(checkoutLegalMessages.providerNoticeDirectAction)
        expect(html).toContain('type="hidden" name="acceptedRequiredDocs" value="accepted"')
        expect(html).not.toContain('₺300 ödeme yap')
        expect(html).not.toContain('okudum ve kabul ediyorum')
        expect(html).not.toContain('ayrı bir ödeme ekranı açılmaz')
        expect(html).not.toContain('kayıtlı kartınızdan')
    })
})
