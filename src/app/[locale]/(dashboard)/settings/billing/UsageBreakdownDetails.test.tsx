import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { UsageBreakdownTable, type UsageBreakdownTableRow } from './UsageBreakdownDetails'

const rows: UsageBreakdownTableRow[] = [
    {
        label: 'Credits',
        monthly: 30.3,
        total: 30.3,
        isPrimary: true
    },
    {
        label: 'Conversation summary',
        monthly: 0.2,
        total: 0.2
    }
]

describe('UsageBreakdownTable', () => {
    it('renders a single-table layout with operation labels shown once', () => {
        const markup = renderToStaticMarkup(
            <UsageBreakdownTable
                rows={rows}
                monthHeading="This month • February 2026"
                totalHeading="All-time total"
                operationHeading="Operation"
                creditsUnit="credits"
                formatCredits={(value) => value.toFixed(1)}
            />
        )

        expect(markup).toContain('<table')
        expect(markup).toContain('This month • February 2026')
        expect(markup).toContain('All-time total')
        expect(markup.match(/Conversation summary/g)?.length).toBe(1)
    })

    it('keeps credit values in a single non-wrapping line', () => {
        const markup = renderToStaticMarkup(
            <UsageBreakdownTable
                rows={rows}
                monthHeading="This month • February 2026"
                totalHeading="All-time total"
                operationHeading="Operation"
                creditsUnit="credits"
                formatCredits={(value) => value.toFixed(1)}
            />
        )

        expect(markup).toContain('whitespace-nowrap')
    })
})
