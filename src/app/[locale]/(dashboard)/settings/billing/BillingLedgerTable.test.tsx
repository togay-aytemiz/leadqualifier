import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import {
    BillingLedgerTable,
    buildBillingLedgerAggregateRows,
    type BillingLedgerTableRow
} from './BillingLedgerTable'

const rows: BillingLedgerTableRow[] = [
    {
        id: '1',
        dateLabel: '16 Feb 2026 14:45',
        typeLabel: 'Package grant',
        poolLabel: 'Package pool',
        deltaLabel: '+2,000.0',
        balanceLabel: '4,000.0',
        reasonLabel: 'Monthly package updated',
        reasonDetailLabel: 'Monthly package updated',
        createdAt: '2026-02-16T14:45:00.000Z',
        creditsDelta: 2000,
        balanceAfter: 4000,
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
        reasonDetailLabel: 'Extra credits added',
        createdAt: '2026-02-15T23:47:00.000Z',
        creditsDelta: 1000,
        balanceAfter: 2500,
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
        reasonDetailLabel: 'Extra credits added',
        createdAt: '2026-02-15T21:47:00.000Z',
        creditsDelta: 1000,
        balanceAfter: 1500,
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
        reasonDetailLabel: 'AI usage debit',
        createdAt: '2026-02-15T00:02:00.000Z',
        creditsDelta: -0.2,
        balanceAfter: 119.8,
        isDebit: true
    }
]

const EMPTY_TEXT = 'No rows'
const SHOW_MORE_LABEL = 'Show more'
const SHOW_LESS_LABEL = 'Show less'
const LOAD_MORE_LABEL = 'Load more'
const LOADING_LABEL = 'Loading...'
const FILTER_LABEL = 'Period'
const VIEW_LABEL = 'View'
const MOVEMENT_LABEL = 'Movement'

function renderLedgerTable(markup: ReactNode) {
    return renderToStaticMarkup(
        <NextIntlClientProvider locale="en" timeZone="Europe/Istanbul" messages={{
            billingUsage: {
                ledger: {
                    aggregate: {
                        movementsCount: '{count} movements'
                    }
                }
            }
        }}>
            {markup}
        </NextIntlClientProvider>
    )
}

describe('BillingLedgerTable', () => {
    it('renders a fixed-width table structure for stable column layout', () => {
        const markup = renderLedgerTable(
            <BillingLedgerTable
                rows={rows}
                columns={{
                    date: 'Date',
                    movement: 'Movement',
                    delta: 'Change',
                    balance: 'Balance',
                    detail: 'Detail',
                    period: 'Period',
                    usage: 'Usage',
                    added: 'Added',
                    net: 'Net',
                    movements: 'Movements'
                }}
                emptyText={EMPTY_TEXT}
                showMoreLabel={SHOW_MORE_LABEL}
                showLessLabel={SHOW_LESS_LABEL}
                loadMoreLabel={LOAD_MORE_LABEL}
                loadingLabel={LOADING_LABEL}
                filterLabel={FILTER_LABEL}
                viewLabel={VIEW_LABEL}
                movementLabel={MOVEMENT_LABEL}
                selectedPeriod="current_month"
                selectedView="entries"
                selectedMovement="all"
                periodOptions={[
                    { value: 'current_month', label: 'This month' },
                    { value: 'previous_month', label: 'Previous month' },
                    { value: 'all', label: 'All' }
                ]}
                viewOptions={[
                    { value: 'entries', label: 'Records' },
                    { value: 'day', label: 'Daily' },
                    { value: 'week', label: 'Weekly' },
                    { value: 'month', label: 'Monthly' }
                ]}
                movementOptions={[
                    { value: 'all', label: 'All' },
                    { value: 'usage', label: 'Usage' },
                    { value: 'loads', label: 'Loads' }
                ]}
                hasMoreRows={false}
            />
        )

        expect(markup).toContain('table-fixed')
        expect(markup).toContain('w-full')
        expect(markup).not.toContain('min-w-\\[760px\\]')
        expect(markup).toContain('<colgroup>')
        expect(markup.match(/<col /g)?.length).toBe(5)
        expect(markup).not.toContain('Pool')
        expect(markup).not.toContain('Reason')
    })

    it('renders period and aggregation controls for ledger exploration', () => {
        const markup = renderLedgerTable(
            <BillingLedgerTable
                rows={rows}
                columns={{
                    date: 'Date',
                    movement: 'Movement',
                    delta: 'Change',
                    balance: 'Balance',
                    detail: 'Detail',
                    period: 'Period',
                    usage: 'Usage',
                    added: 'Added',
                    net: 'Net',
                    movements: 'Movements'
                }}
                emptyText={EMPTY_TEXT}
                showMoreLabel={SHOW_MORE_LABEL}
                showLessLabel={SHOW_LESS_LABEL}
                loadMoreLabel={LOAD_MORE_LABEL}
                loadingLabel={LOADING_LABEL}
                filterLabel={FILTER_LABEL}
                viewLabel={VIEW_LABEL}
                movementLabel={MOVEMENT_LABEL}
                selectedPeriod="current_month"
                selectedView="entries"
                selectedMovement="all"
                periodOptions={[
                    { value: 'current_month', label: 'This month' },
                    { value: 'previous_month', label: 'Previous month' },
                    { value: 'all', label: 'All' }
                ]}
                viewOptions={[
                    { value: 'entries', label: 'Records' },
                    { value: 'day', label: 'Daily' },
                    { value: 'week', label: 'Weekly' },
                    { value: 'month', label: 'Monthly' }
                ]}
                movementOptions={[
                    { value: 'all', label: 'All' },
                    { value: 'usage', label: 'Usage' },
                    { value: 'loads', label: 'Loads' }
                ]}
                hasMoreRows
            />
        )

        expect(markup).toContain('Period')
        expect(markup).toContain('This month')
        expect(markup).toContain('Previous month')
        expect(markup).toContain('Records')
        expect(markup).toContain('Weekly')
        expect(markup).toContain('Loads')
        expect(markup).toContain('Load more')
    })

    it('keeps all filter groups side by side while labels stay above controls', () => {
        const markup = renderLedgerTable(
            <BillingLedgerTable
                rows={rows}
                columns={{
                    date: 'Date',
                    movement: 'Movement',
                    delta: 'Change',
                    balance: 'Balance',
                    detail: 'Detail',
                    period: 'Period',
                    usage: 'Usage',
                    added: 'Added',
                    net: 'Net',
                    movements: 'Movements'
                }}
                emptyText={EMPTY_TEXT}
                showMoreLabel={SHOW_MORE_LABEL}
                showLessLabel={SHOW_LESS_LABEL}
                loadMoreLabel={LOAD_MORE_LABEL}
                loadingLabel={LOADING_LABEL}
                filterLabel={FILTER_LABEL}
                viewLabel={VIEW_LABEL}
                movementLabel={MOVEMENT_LABEL}
                selectedPeriod="current_month"
                selectedView="entries"
                selectedMovement="loads"
                periodOptions={[
                    { value: 'current_month', label: 'This month' },
                    { value: 'previous_month', label: 'Previous month' },
                    { value: 'all', label: 'All' }
                ]}
                viewOptions={[
                    { value: 'entries', label: 'Records' },
                    { value: 'day', label: 'Daily' },
                    { value: 'week', label: 'Weekly' },
                    { value: 'month', label: 'Monthly' }
                ]}
                movementOptions={[
                    { value: 'all', label: 'All' },
                    { value: 'usage', label: 'Usage' },
                    { value: 'loads', label: 'Loads' }
                ]}
                hasMoreRows={false}
            />
        )

        expect(markup).toContain('data-ledger-filter-layout="labeled-inline"')
        expect(markup).toContain('lg:grid-cols-[auto_180px_180px]')
        expect(markup.indexOf('>Period<')).toBeLessThan(markup.indexOf('>Movement<'))
        expect(markup.indexOf('>Movement<')).toBeLessThan(markup.indexOf('>View<'))
    })

    it('aggregates loaded records by month into usage, added, net, and latest balance', () => {
        const aggregateRows = buildBillingLedgerAggregateRows({
            rows,
            view: 'month',
            locale: 'en',
            labels: {
                movementsCount: ({ count }) => `${count} movements`
            },
            formatCredit: (value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`,
            formatBalance: (value) => value.toFixed(1)
        })

        expect(aggregateRows).toEqual([
            expect.objectContaining({
                id: 'aggregate-month-2026-02',
                addedLabel: '+4000.0',
                usageLabel: '-0.2',
                netLabel: '+3999.8',
                balanceLabel: '4000.0',
                movementsLabel: '4 movements',
                isNetDebit: false
            })
        ])
    })

    it('renders aggregate views without ledger implementation columns or truncated summary labels', () => {
        const markup = renderLedgerTable(
            <BillingLedgerTable
                rows={rows}
                columns={{
                    date: 'Date',
                    movement: 'Movement',
                    delta: 'Change',
                    balance: 'Balance',
                    detail: 'Detail',
                    period: 'Period',
                    usage: 'Usage',
                    added: 'Added',
                    net: 'Net',
                    movements: 'Movements'
                }}
                emptyText={EMPTY_TEXT}
                showMoreLabel={SHOW_MORE_LABEL}
                showLessLabel={SHOW_LESS_LABEL}
                loadMoreLabel={LOAD_MORE_LABEL}
                loadingLabel={LOADING_LABEL}
                filterLabel={FILTER_LABEL}
                viewLabel={VIEW_LABEL}
                movementLabel={MOVEMENT_LABEL}
                selectedPeriod="current_month"
                selectedView="week"
                selectedMovement="all"
                periodOptions={[
                    { value: 'current_month', label: 'This month' },
                    { value: 'previous_month', label: 'Previous month' },
                    { value: 'all', label: 'All' }
                ]}
                viewOptions={[
                    { value: 'entries', label: 'Records' },
                    { value: 'day', label: 'Daily' },
                    { value: 'week', label: 'Weekly' },
                    { value: 'month', label: 'Monthly' }
                ]}
                movementOptions={[
                    { value: 'all', label: 'All' },
                    { value: 'usage', label: 'Usage' },
                    { value: 'loads', label: 'Loads' }
                ]}
                hasMoreRows={false}
            />
        )

        expect(markup).toContain('Period')
        expect(markup).toContain('Added')
        expect(markup).toContain('Net')
        expect(markup).toContain('Movements')
        expect(markup).not.toContain('Pool')
        expect(markup).not.toContain('Reason')
        expect(markup).not.toContain('Summary')
        expect(markup).not.toContain('Mixed')
        expect(markup).not.toContain('truncate')
    })
})
