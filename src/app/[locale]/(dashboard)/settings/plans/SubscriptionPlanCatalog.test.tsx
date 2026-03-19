import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../../../messages/en.json'
import { SubscriptionPlanCatalog } from './SubscriptionPlanCatalog'
import type { SubscriptionPlanOption } from './SubscriptionPlanManager'

const plans: SubscriptionPlanOption[] = [
  {
    id: 'starter',
    credits: 1000,
    priceTry: 349,
    localizedPrice: 349,
    currency: 'TRY',
    conversationRange: {
      min: 90,
      max: 120,
    },
    unitPrice: 0.349,
  },
  {
    id: 'growth',
    credits: 2000,
    priceTry: 649,
    localizedPrice: 649,
    currency: 'TRY',
    conversationRange: {
      min: 180,
      max: 240,
    },
    unitPrice: 0.3245,
  },
  {
    id: 'scale',
    credits: 4000,
    priceTry: 949,
    localizedPrice: 949,
    currency: 'TRY',
    conversationRange: {
      min: 360,
      max: 480,
    },
    unitPrice: 0.23725,
  },
]

function renderCatalog() {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Europe/Istanbul">
      <SubscriptionPlanCatalog
        organizationId="org_1"
        plans={plans}
        canSubmit
        planAction={() => {}}
      />
    </NextIntlClientProvider>
  )
}

describe('SubscriptionPlanCatalog', () => {
  it('anchors every plan CTA row to the bottom of the card', () => {
    const html = renderCatalog()

    expect(html.match(/mt-auto pt-4/g)).toHaveLength(plans.length)
  })
})
