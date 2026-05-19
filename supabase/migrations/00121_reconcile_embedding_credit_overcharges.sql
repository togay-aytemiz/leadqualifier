-- Reconcile current-period credit balances for embedding usage rows that were
-- already debited with the old chat-token weighting before 00120 shipped.

WITH raw_embedding_debits AS (
    SELECT
        ledger.id AS ledger_id,
        ledger.organization_id,
        ledger.credit_pool,
        ledger.created_at,
        ABS(ledger.credits_delta)::NUMERIC(14, 1) AS original_debit,
        GREATEST(
            public.compute_ai_usage_credit_cost(usage_rows.category, usage_rows.model, usage_rows.input_tokens, usage_rows.output_tokens),
            0
        )::NUMERIC(14, 1) AS corrected_debit,
        CASE
            WHEN jsonb_typeof(ledger.metadata->'package_debit') IN ('number', 'string')
                AND (ledger.metadata->>'package_debit') ~ '^[0-9]+(\.[0-9]+)?$'
                THEN (ledger.metadata->>'package_debit')::NUMERIC
            WHEN ledger.credit_pool = 'package_pool'::public.billing_credit_pool_type THEN ABS(ledger.credits_delta)
            WHEN ledger.credit_pool = 'mixed'::public.billing_credit_pool_type THEN ABS(ledger.credits_delta)
            ELSE 0
        END::NUMERIC(14, 1) AS original_package_debit,
        CASE
            WHEN jsonb_typeof(ledger.metadata->'topup_debit') IN ('number', 'string')
                AND (ledger.metadata->>'topup_debit') ~ '^[0-9]+(\.[0-9]+)?$'
                THEN (ledger.metadata->>'topup_debit')::NUMERIC
            WHEN ledger.credit_pool = 'topup_pool'::public.billing_credit_pool_type THEN ABS(ledger.credits_delta)
            ELSE 0
        END::NUMERIC(14, 1) AS original_topup_debit
    FROM public.organization_credit_ledger ledger
    INNER JOIN public.organization_ai_usage usage_rows
        ON usage_rows.id = ledger.usage_id
        AND usage_rows.organization_id = ledger.organization_id
    INNER JOIN public.organization_billing_accounts accounts
        ON accounts.organization_id = ledger.organization_id
    WHERE
        ledger.entry_type = 'usage_debit'::public.billing_credit_ledger_type
        AND ledger.credits_delta < 0
        AND lower(btrim(COALESCE(usage_rows.category, ''))) = 'embedding'
        AND NOT EXISTS (
            SELECT 1
            FROM public.organization_credit_ledger existing_adjustment
            WHERE
                existing_adjustment.organization_id = ledger.organization_id
                AND existing_adjustment.entry_type = 'adjustment'::public.billing_credit_ledger_type
                AND existing_adjustment.metadata->>'source' = 'embedding_credit_cost_reconciliation'
        )
        AND (
            (
                accounts.membership_state = 'trial_active'
                AND accounts.trial_credit_used < accounts.trial_credit_limit
                AND ledger.credit_pool = 'trial_pool'::public.billing_credit_pool_type
                AND ledger.created_at >= accounts.trial_started_at
                AND ledger.created_at <= accounts.trial_ends_at
            )
            OR (
                accounts.membership_state = 'premium_active'
                AND accounts.lock_reason <> 'package_credits_exhausted'
                AND accounts.monthly_package_credit_used < accounts.monthly_package_credit_limit
                AND ledger.credit_pool IN (
                    'package_pool'::public.billing_credit_pool_type,
                    'topup_pool'::public.billing_credit_pool_type,
                    'mixed'::public.billing_credit_pool_type
                )
                AND ledger.created_at >= COALESCE(accounts.current_period_start, accounts.premium_assigned_at, accounts.created_at)
                AND (
                    accounts.current_period_end IS NULL
                    OR ledger.created_at < accounts.current_period_end
                )
            )
        )
),
embedding_refunds AS (
    SELECT
        ledger_id,
        organization_id,
        credit_pool,
        original_debit,
        corrected_debit,
        GREATEST(original_debit - corrected_debit, 0)::NUMERIC(14, 1) AS refund_total,
        CASE
            WHEN credit_pool = 'trial_pool'::public.billing_credit_pool_type
                THEN GREATEST(original_debit - corrected_debit, 0)
            ELSE 0
        END::NUMERIC(14, 1) AS trial_refund,
        CASE
            WHEN credit_pool IN ('package_pool'::public.billing_credit_pool_type, 'mixed'::public.billing_credit_pool_type)
                THEN GREATEST(
                    original_package_debit - LEAST(original_package_debit, GREATEST(corrected_debit - original_topup_debit, 0)),
                    0
                )
            ELSE 0
        END::NUMERIC(14, 1) AS package_refund,
        CASE
            WHEN credit_pool IN ('topup_pool'::public.billing_credit_pool_type, 'mixed'::public.billing_credit_pool_type)
                THEN GREATEST(original_topup_debit - LEAST(original_topup_debit, corrected_debit), 0)
            ELSE 0
        END::NUMERIC(14, 1) AS topup_refund
    FROM raw_embedding_debits
    WHERE corrected_debit < original_debit
),
organization_refunds AS (
    SELECT
        organization_id,
        SUM(original_debit)::NUMERIC(14, 1) AS original_debit_total,
        SUM(corrected_debit)::NUMERIC(14, 1) AS corrected_debit_total,
        SUM(refund_total)::NUMERIC(14, 1) AS refund_total,
        SUM(trial_refund)::NUMERIC(14, 1) AS trial_refund,
        SUM(package_refund)::NUMERIC(14, 1) AS package_refund,
        SUM(topup_refund)::NUMERIC(14, 1) AS topup_refund,
        COUNT(*)::INTEGER AS reconciled_debit_count
    FROM embedding_refunds
    GROUP BY organization_id
    HAVING SUM(refund_total) > 0
),
updated_accounts AS (
    UPDATE public.organization_billing_accounts accounts
    SET
        trial_credit_used = GREATEST(0, accounts.trial_credit_used - organization_refunds.trial_refund),
        monthly_package_credit_used = GREATEST(0, accounts.monthly_package_credit_used - organization_refunds.package_refund),
        topup_credit_balance = accounts.topup_credit_balance + organization_refunds.topup_refund,
        membership_state = CASE
            WHEN
                accounts.membership_state = 'trial_exhausted'
                AND now() <= accounts.trial_ends_at
                AND GREATEST(0, accounts.trial_credit_used - organization_refunds.trial_refund) < accounts.trial_credit_limit
                THEN 'trial_active'::public.billing_membership_state
            ELSE accounts.membership_state
        END,
        lock_reason = CASE
            WHEN
                accounts.membership_state IN ('trial_active', 'trial_exhausted')
                AND now() <= accounts.trial_ends_at
                AND GREATEST(0, accounts.trial_credit_used - organization_refunds.trial_refund) < accounts.trial_credit_limit
                THEN 'none'::public.billing_lock_reason
            WHEN
                accounts.membership_state = 'premium_active'
                AND accounts.lock_reason IN ('none', 'package_credits_exhausted')
                AND (
                    GREATEST(0, accounts.monthly_package_credit_limit - GREATEST(0, accounts.monthly_package_credit_used - organization_refunds.package_refund))
                    + accounts.topup_credit_balance
                    + organization_refunds.topup_refund
                ) > 0
                THEN 'none'::public.billing_lock_reason
            ELSE accounts.lock_reason
        END,
        updated_at = now()
    FROM organization_refunds
    WHERE accounts.organization_id = organization_refunds.organization_id
    RETURNING
        accounts.organization_id,
        accounts.membership_state,
        accounts.trial_credit_limit,
        accounts.trial_credit_used,
        accounts.monthly_package_credit_limit,
        accounts.monthly_package_credit_used,
        accounts.topup_credit_balance,
        organization_refunds.original_debit_total,
        organization_refunds.corrected_debit_total,
        organization_refunds.refund_total,
        organization_refunds.trial_refund,
        organization_refunds.package_refund,
        organization_refunds.topup_refund,
        organization_refunds.reconciled_debit_count
)
INSERT INTO public.organization_credit_ledger (
    organization_id,
    entry_type,
    credit_pool,
    credits_delta,
    balance_after,
    reason,
    metadata
)
SELECT
    updated_accounts.organization_id,
    'adjustment'::public.billing_credit_ledger_type,
    CASE
        WHEN updated_accounts.trial_refund > 0 THEN 'trial_pool'::public.billing_credit_pool_type
        WHEN updated_accounts.package_refund > 0 AND updated_accounts.topup_refund > 0 THEN 'mixed'::public.billing_credit_pool_type
        WHEN updated_accounts.package_refund > 0 THEN 'package_pool'::public.billing_credit_pool_type
        ELSE 'topup_pool'::public.billing_credit_pool_type
    END,
    updated_accounts.refund_total,
    CASE
        WHEN updated_accounts.membership_state IN ('trial_active', 'trial_exhausted')
            THEN GREATEST(0, updated_accounts.trial_credit_limit - updated_accounts.trial_credit_used)
        ELSE GREATEST(0, updated_accounts.monthly_package_credit_limit - updated_accounts.monthly_package_credit_used)
            + updated_accounts.topup_credit_balance
    END::NUMERIC(14, 1),
    'Text embedding credit correction',
    jsonb_build_object(
        'source', 'embedding_credit_cost_reconciliation',
        'original_debit_total', updated_accounts.original_debit_total,
        'corrected_debit_total', updated_accounts.corrected_debit_total,
        'refund_total', updated_accounts.refund_total,
        'trial_refund', updated_accounts.trial_refund,
        'package_refund', updated_accounts.package_refund,
        'topup_refund', updated_accounts.topup_refund,
        'reconciled_debit_count', updated_accounts.reconciled_debit_count
    )
FROM updated_accounts;
