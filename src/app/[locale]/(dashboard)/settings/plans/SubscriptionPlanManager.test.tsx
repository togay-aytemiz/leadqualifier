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

function renderManager() {
    return renderToStaticMarkup(
        <NextIntlClientProvider locale="tr" messages={messages} timeZone="Europe/Istanbul">
            <SubscriptionPlanManager
                organizationId="org_1"
                plans={plans}
                activePlanId="starter"
                activePlanCredits={1000}
                canManage
                autoRenewEnabled={false}
                renewalPeriodEnd="2026-04-01T00:00:00.000Z"
                pendingPlanId={null}
                pendingPlanName={null}
                pendingPlanEffectiveAt={null}
                supportsAutoRenewResume={false}
                planAction={() => {}}
                cancelAction={() => {}}
            />
        </NextIntlClientProvider>
    )
}

describe('SubscriptionPlanManager', () => {
    it('does not render a cancellation undo CTA after auto-renew has been turned off', () => {
        const html = renderManager()

        expect(html).toContain('Abonelik iptali planlandı.')
        expect(html).not.toContain('İptali geri al')
        expect(html).toContain('Iyzico tarafında kapatılan yenilemeyi uygulama içinden tekrar açamazsın.')
    })
})
