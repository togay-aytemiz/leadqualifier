import { describe, expect, it } from 'vitest'
import type { BillingLedgerEntry } from '@/lib/billing/server'
import { buildBillingHistoryRows } from './history'

describe('buildBillingHistoryRows', () => {
    it('builds purchase history rows for package upgrades and top-up payments', () => {
        const entries: BillingLedgerEntry[] = [
            {
                id: 'ledger_upgrade',
                entryType: 'package_grant',
                creditPool: 'package_pool',
                creditsDelta: 1000,
                balanceAfter: 1700,
                reason: 'Iyzico subscription upgrade success',
                metadata: {
                    source: 'iyzico_subscription_upgrade',
                    subscription_id: 'sub_1',
                    charged_amount_try: 300
                },
                createdAt: '2026-04-10T12:00:00.000Z'
            },
            {
                id: 'ledger_topup',
                entryType: 'purchase_credit',
                creditPool: 'topup_pool',
                creditsDelta: 500,
                balanceAfter: 2200,
                reason: 'Iyzico top-up checkout success',
                metadata: {
                    source: 'iyzico_checkout_form',
                    order_id: 'order_1'
                },
                createdAt: '2026-04-09T12:00:00.000Z'
            }
        ]

        const rows = buildBillingHistoryRows({
            entries,
            subscriptions: new Map([
                ['sub_1', { metadata: { change_type: 'upgrade', requested_monthly_price_try: 649 } }]
            ]),
            orders: new Map([
                ['order_1', { credits: 500, amountTry: 200, currency: 'TRY' }]
            ]),
            formatDate: (value) => value.slice(0, 10),
            formatCurrency: (amount, currency) => `${currency ?? 'TRY'} ${amount}`,
            labels: {
                statusSuccess: 'Success',
                amountUnavailable: '—',
                packageStart: 'Package start',
                packageUpgrade: 'Package upgrade',
                packageRenewal: 'Package renewal',
                packageUpdate: 'Package update',
                topupPurchase: 'Credit purchase'
            }
        })

        expect(rows).toEqual([
            {
                id: 'ledger_upgrade',
                dateLabel: '2026-04-10',
                amountLabel: 'TRY 300',
                statusLabel: 'Success',
                detailLabel: 'Package upgrade'
            },
            {
                id: 'ledger_topup',
                dateLabel: '2026-04-09',
                amountLabel: 'TRY 200',
                statusLabel: 'Success',
                detailLabel: 'Credit purchase'
            }
        ])
    })
})
