import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../../../messages/tr.json'
import { SubscriptionPlanManager, type SubscriptionPlanOption } from './SubscriptionPlanManager'

const plans: SubscriptionPlanOption[] = [
    {
        id: 'starter',
        credits: 1000,
        priceTry: 349,
        localizedPrice: 349,
        currency: 'TRY',
        conversationRange: {
            min: 90,
            max: 120
        },
        unitPrice: 0.349
    },
    {
        id: 'growth',
        credits: 2000,
        priceTry: 649,
        localizedPrice: 649,
        currency: 'TRY',
        conversationRange: {
            min: 180,
            max: 240
        },
        unitPrice: 0.3245
    }
]

function renderManager(overrides?: Partial<Parameters<typeof SubscriptionPlanManager>[0]>) {
    return renderToStaticMarkup(
        <NextIntlClientProvider locale="tr" messages={messages} timeZone="Europe/Istanbul">
            {createElement(SubscriptionPlanManager as never, {
                organizationId: 'org_1',
                plans,
                activePlanId: 'starter',
                activePlanCredits: 1000,
                canManage: true,
                autoRenewEnabled: false,
                renewalPeriodEnd: '2026-04-01T00:00:00.000Z',
                pendingPlanId: null,
                pendingPlanName: null,
                pendingPlanEffectiveAt: null,
                supportsAutoRenewResume: false,
                planAction: () => {},
                cancelAction: () => {},
                paymentRecoveryState: {
                    canRetry: true,
                    canUpdateCard: true
                },
                retryPaymentAction: () => {},
                updatePaymentMethodAction: () => {},
                ...overrides
            } as never)}
        </NextIntlClientProvider>
    )
}

describe('SubscriptionPlanManager', () => {
    it('uses the shorter downgrade period-end helper copy', () => {
        expect(messages.billingPlans.packageCatalog.planModal.downgradeHint)
            .toBe('Plan değişikliği dönem sonunda uygulanır.')
    })

    it('does not render a cancellation undo CTA after auto-renew has been turned off', () => {
        const html = renderManager()

        expect(html).toContain('Abonelik iptali planlandı.')
        expect(html).not.toContain('İptali geri al')
        expect(html).toContain('Iyzico tarafında kapatılan yenilemeyi uygulama içinden tekrar açamazsın.')
    })

    it('renders payment recovery actions for past-due subscriptions', () => {
        const html = renderManager()

        expect(html).toContain('Ödeme yöntemini güncelle')
        expect(html).toContain('Ödemeyi tekrar dene')
    })

    it('renders the current monthly package summary and keeps actions in the same card', () => {
        const html = renderManager({
            autoRenewEnabled: true,
            paymentRecoveryState: {
                canRetry: false,
                canUpdateCard: true
            }
        })

        expect(html).toContain('Mevcut aylık paketin')
        expect(html).toContain('Temel')
        expect(html).toContain('1.000 kredi')
        expect(html).not.toContain('1.000 kredi dahil')
        expect(html).toContain('Ayda yaklaşık 90-120 konuşma')
        expect(html).toContain('Kredi başı')
        expect(html).not.toContain('Aboneliğini yönet')
        expect(html).toContain('Yükselt veya değiştir')
        expect(html).toContain('Ödeme yöntemini güncelle')
        expect(html).toContain('flex flex-wrap items-center gap-x-5 gap-y-2 text-sm')
        expect(html).not.toContain('min-w-[200px] items-center justify-center rounded-lg bg-[#242A40]')
    })
})
