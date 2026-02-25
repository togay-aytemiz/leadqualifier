import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BillingLedgerTable, type BillingLedgerTableRow } from './BillingLedgerTable'

const rows: BillingLedgerTableRow[] = [
    {
        id: '1',
        dateLabel: '16 Feb 2026 14:45',
        typeLabel: 'Package grant',
        poolLabel: 'Package pool',
        deltaLabel: '+2,000.0',
        balanceLabel: '4,000.0',
        reasonLabel: 'Monthly package updated',
        isDebit: false
    },
    {
        id: '2',
        dateLabel: '15 Feb 2026 23:47',
        typeLabel: 'Top-up purchase',
        poolLabel: 'Top-up pool',
        deltaLabel: '+1,000.0',
        balanceLabel: '2,500.0',
        reasonLabel: 'Extra credits added',
        isDebit: false
    },
    {
        id: '3',
        dateLabel: '15 Feb 2026 21:47',
        typeLabel: 'Top-up purchase',
        poolLabel: 'Top-up pool',
        deltaLabel: '+1,000.0',
        balanceLabel: '1,500.0',
        reasonLabel: 'Extra credits added',
        isDebit: false
    },
    {
        id: '4',
        dateLabel: '15 Feb 2026 00:02',
        typeLabel: 'Usage debit',
        poolLabel: 'Trial pool',
        deltaLabel: '-0.2',
        balanceLabel: '119.8',
        reasonLabel: 'AI usage debit',
        isDebit: true
    }
]

const EMPTY_TEXT = 'No rows'
const SHOW_MORE_LABEL = 'Show more'
const SHOW_LESS_LABEL = 'Show less'

describe('BillingLedgerTable', () => {
    it('renders a fixed-width table structure for stable column layout', () => {
        const markup = renderToStaticMarkup(
            <BillingLedgerTable
                rows={rows}
                columns={{
                    date: 'Date',
                    type: 'Type',
                    pool: 'Pool',
                    delta: 'Delta',
                    balance: 'Balance',
                    reason: 'Reason'
                }}
                emptyText={EMPTY_TEXT}
                showMoreLabel={SHOW_MORE_LABEL}
                showLessLabel={SHOW_LESS_LABEL}
            />
        )

        expect(markup).toContain('table-fixed')
        expect(markup).toContain('<colgroup>')
        expect(markup.match(/<col /g)?.length).toBe(6)
    })
})
