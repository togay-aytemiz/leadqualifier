# Pricing & Credit Strategy Guide (Pre-Pilot)

> **Date:** 2026-02-16  
> **Status:** Decision guide (recommended baseline, implementation pending)  
> **Owner:** Product + Billing

---

## 1. Objective

This guide answers three questions:

1. Is the current `120` trial credit default too low, too high, or balanced?
2. Should we move to `100`, `200`, `250`, or `1000` trial credits?
3. How many extra credits should we sell, and at what price, while preserving healthy margin?

The goal is to align pricing decisions with:

- Real usage mechanics in the codebase (token caps + credit formula),
- OpenAI `gpt-4o-mini` token pricing shared by product,
- Conversion and anti-abuse balance for Turkish SMB pilots.

---

## 2. Code-Backed Inputs (Source of Truth)

### 2.1 Model and token-consuming flow

- Runtime model is `gpt-4o-mini` in inbound pipeline usage records:
  - `src/lib/channels/inbound-ai-pipeline.ts` (`model: 'gpt-4o-mini'`)
- Router output cap:
  - `src/lib/knowledge-base/router.ts` (`ROUTER_MAX_OUTPUT_TOKENS = 120`)
- Main RAG output cap:
  - `src/lib/channels/inbound-ai-pipeline.ts` (`RAG_MAX_OUTPUT_TOKENS = 320`)
- Fallback output cap:
  - `src/lib/ai/fallback.ts` (`FALLBACK_MAX_OUTPUT_TOKENS = 320`)
- Lead extraction output cap:
  - `src/lib/leads/extraction.ts` (`LEAD_EXTRACTION_MAX_OUTPUT_TOKENS = 320`)

### 2.2 Credit formula used by product

Product credit logic is:

- `credits = ceil_to_0.1((input_tokens + 4 * output_tokens) / 3000)`

Implemented in:

- SQL: `supabase/migrations/00057_billing_subscription_foundation.sql` (`compute_credit_cost`)
- App helper: `src/lib/billing/usage.ts` (`calculateAiCreditsFromTokens`)

### 2.3 Current UI extra-credit defaults

- Current top-up credit amount is fixed at `1000`:
  - `src/app/[locale]/(dashboard)/settings/plans/page.tsx`
- Current top-up price is derived from monthly per-credit price (same unit price as package, no premium multiplier yet):
  - `topupAmountTry = topupCredits * (monthlyPriceTry / monthlyCredits)`

---

## 3. Cost Model (How We Calculated)

## 3.1 Token prices (provided)

For `gpt-4o-mini`:

- Input: `$0.15 / 1M tokens`
- Cached input: `$0.075 / 1M tokens`
- Output: `$0.60 / 1M tokens`

## 3.2 Formulas

Raw model cost:

```text
cost_usd =
  (uncached_input_tokens * 0.15
 + cached_input_tokens   * 0.075
 + output_tokens         * 0.60) / 1_000_000
```

Credit usage:

```text
credits = ceil_to_0.1((input_tokens + 4 * output_tokens) / 3000)
```

## 3.3 Key normalization insight

Because:

- output price is exactly `4x` input price, and
- credit formula weights output by `4x`,

the credit unit is cost-aligned to model pricing.

Conservative (no cache) **cost per 1 credit**:

```text
3000 weighted tokens * (0.15 / 1_000_000) = $0.00045
```

So:

- `100 credits` -> `$0.045`
- `120 credits` -> `$0.054`
- `200 credits` -> `$0.090`
- `250 credits` -> `$0.1125`
- `1000 credits` -> `$0.45`

At example FX `1 USD = 35 TRY` (assumption for illustration):

- `120 credits` raw model COGS is only `~1.89 TRY`
- `200 credits` raw model COGS is only `~3.15 TRY`

Important: cached input reduces this further. For planning safety, we used no-cache COGS as baseline.

---

## 4. Usage Assumptions (Messages -> Credits)

We modelled three average consumption bands per inbound customer message:

- **Lean:** `0.6 credit/message`
- **Base:** `0.9 credit/message`
- **Heavy:** `1.2 credit/message`

These bands reflect that one inbound message can trigger multiple AI calls (router + response + extraction/reasoning), with output limits enforced by current caps.

Messages covered by each trial option:

| Trial Credits | Lean (0.6) | Base (0.9) | Heavy (1.2) |
|---|---:|---:|---:|
| 100 | 166 | 111 | 83 |
| 120 | 200 | 133 | 100 |
| 200 | 333 | 222 | 166 |
| 250 | 416 | 277 | 208 |
| 1000 | 1666 | 1111 | 833 |

---

## 5. Trial Credit Option Evaluation

## 5.1 `100` credits

- Pro: very low abuse risk.
- Con: many real SMBs may hit lock too fast before value realization.
- Verdict: too tight for activation quality.

## 5.2 `120` credits (current)

- Pro: conservative and abuse-resistant.
- Con: base scenario gives ~133 inbound messages over 14 days; can feel restrictive for active businesses.
- Verdict: likely slightly low for conversion in pilots.

## 5.3 `200` credits

- Pro: strong middle ground (base ~222 messages in trial), still controlled.
- Con: slightly wider abuse window than 120.
- Verdict: **recommended default** for next pricing iteration.

## 5.4 `250` credits

- Pro: better first-week product experience for high activity.
- Con: broader abuse surface before anti-abuse controls are fully enforced.
- Verdict: good fallback if `200` still locks too early.

## 5.5 `1000` credits

- Pro: almost no trial lock friction.
- Con: effectively removes paywall pressure; high abuse risk for trial-only onboarding.
- Verdict: not suitable as default trial.

---

## 6. Recommended Baseline

## 6.1 Trial

- Keep trial duration: `14 days`
- Keep lock precedence: `time OR credits (first reached)`
- **Change default trial credits from `120` -> `200`** (next policy revision)

Rationale:

- Improves first-value experience materially versus 120.
- Cost impact is negligible at model level.
- Preserves conversion pressure unlike 1000-credit trials.

## 6.2 Paid package anchor (starter)

For pre-pilot low-entry target (~USD 10 equivalent):

- **Starter monthly:** `349 TRY`
- **Included credits:** `1000`

This keeps messaging simple: "about 1000 inbound AI responses/month in base usage".

## 6.3 Extra credit (one-time)

Recommended immediate one-pack setup:

- **Extra pack:** `1000 credits`
- **Price:** `449 TRY` one-time

Why:

- Keeps top-up per-credit price higher than package per-credit (healthy overage design).
- Matches current UI assumption of fixed `1000` top-up credits.

Optional second pack (future):

- `500 credits` at `249 TRY` for lower checkout friction.

---

## 7. Unit Economics Snapshot (Illustrative)

Assumption for conversion: `1 USD = 35 TRY` (illustrative only).

### 7.1 Raw model COGS only (no overhead multiplier)

- `1000 credits` cost: `$0.45`
- Starter (`349 TRY` ~ `$9.97`) gross margin vs model COGS: `~95.5%`
- Extra (`449 TRY` ~ `$12.83`) gross margin vs model COGS: `~96.5%`

### 7.2 Safety multipliers (to include retries, embeddings, infra, noise)

Using `1000-credit` COGS:

- `3x` multiplier -> `$1.35` effective COGS
- `5x` multiplier -> `$2.25` effective COGS

Even at `5x`:

- Starter gross margin remains `~77%`
- Extra pack gross margin remains `~82%`

Conclusion: pricing is value/conversion constrained, not model-token constrained.

---

## 8. Decision Rules and Revisit Triggers

After rollout, review monthly:

1. Trial lock timing:
   - If >40% of trial orgs lock in first 3 days, test `200 -> 250`.
2. Trial to paid conversion:
   - If conversion does not improve after credit increase, trial credits are not the primary bottleneck.
3. Top-up attach rate:
   - If top-up purchase rate is too low among active premium orgs, add a smaller 500-credit pack.
4. Gross margin guardrail:
   - Keep blended gross margin >=70% under conservative cost multipliers.

---

## 9. Implementation Notes (When Executing This Decision)

1. Update trial credit default from `120` to `200` in platform billing settings defaults and migration strategy.
2. Update plans top-up pricing logic to apply a premium multiplier (instead of equal per-credit package pricing).
3. Keep/verify EN-TR i18n copy parity for all pricing and credit text updates.
4. Run full verification (`npm run build`) before release.

---

## 10. Final Recommendation (Short Form)

- **Trial:** move to `200 credits` (keep 14 days, same lock precedence)
- **Starter paid:** `349 TRY / month`, `1000 credits`
- **Extra credit:** `1000 credits` one-time at `449 TRY`
- **Future optional:** add `500 credits` pack for lower-ticket top-up conversion testing
