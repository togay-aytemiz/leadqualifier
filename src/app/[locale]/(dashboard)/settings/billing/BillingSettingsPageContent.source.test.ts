import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const BILLING_SETTINGS_PAGE_CONTENT_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.tsx'
)

describe('billing settings page source guard', () => {
    it('keeps billing settings focused on usage and ledger instead of plan billing controls', () => {
        expect(fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(BILLING_SETTINGS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).not.toContain(".from('organization_billing_profiles')")
        expect(source).not.toContain('BillingInformationCard')
        expect(source).not.toContain('buildBillingHistoryRows')
    })

    it('resolves package grants written with subscription_record_id metadata', () => {
        expect(fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(BILLING_SETTINGS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain("readString(metadata, 'subscription_record_id')")
    })

    it('does not pass callback props inside aggregate labels to the client ledger table', () => {
        expect(fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(BILLING_SETTINGS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).not.toContain('recordsCount: ({ count })')
        expect(source).not.toContain('recordsCountLabel:')
        expect(source).toContain("loadAggregateRows={loadAggregateLedgerRows}")
    })

    it('keeps aggregate loading period-based instead of raw-row based', () => {
        expect(fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(BILLING_SETTINGS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain('getOrganizationBillingLedgerWindow')
        expect(source).toContain('movement: input.movement')
        expect(source).toContain('view: input.view')
    })

    it('labels knowledge base embedding debits from the linked AI usage metadata', () => {
        expect(fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(BILLING_SETTINGS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain(".from('organization_ai_usage')")
        expect(source).toContain(".select('id, category, model, input_tokens, output_tokens, metadata')")
        expect(source).toContain('knowledgeBaseIndexing')
        expect(source).toContain('crawl_corpus_import')
        expect(source).toContain('knowledge_chunk_index_embedding')
    })

    it('recalculates displayed usage debit deltas from linked AI usage token rows', () => {
        expect(fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(BILLING_SETTINGS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain('calculateAiUsageCreditCost')
        expect(source).toContain(".select('id, category, model, input_tokens, output_tokens, metadata')")
        expect(source).toContain('resolveDisplayCreditsDelta')
    })

    it('marks same-day knowledge base indexing debit rows as compactable for the customer ledger', () => {
        expect(fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(BILLING_SETTINGS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain('resolveIstanbulDateKey')
        expect(source).toContain("reasonDetailLabel === input.tBilling('ledger.reasonMap.knowledgeBaseIndexing')")
        expect(source).toContain('compactGroupKey')
        expect(source).toContain('knowledge-base-indexing:')
    })

    it('localizes automatic text embedding credit correction ledger adjustments', () => {
        expect(fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(BILLING_SETTINGS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain("normalizedReason === 'text embedding credit correction'")
        expect(source).toContain('ledger.reasonMap.embeddingCreditCorrection')
    })
})
