# Pricing & Credit Strategy Guide (Pre-Pilot)

> **Date:** 2026-02-16  
> **Status:** Finalized baseline (website-ready, implemented in app/admin on 2026-02-16)  
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

## 6. External Benchmark (Vibe-Coding Pattern)

As of `2026-02-16`, pricing mechanics from comparable tools show a common pattern:

1. **Monthly plan includes a fixed credit budget.**
2. **Upgrade is the primary path** when usage is repeatedly above plan.
3. **Top-up exists as burst insurance**, usually at a higher unit price than recurring plan credits.

Reference points:

- Lovable docs:
  - https://docs.lovable.dev/introduction/pricing-and-limits
  - https://docs.lovable.dev/introduction/pricing-and-limits#what-happens-when-i-upgrade-from-starter-to-pro-halfway-through-my-billing-cycle
- Bolt docs:
  - https://support.bolt.new/account-and-subscription/billing
- v0 pricing page:
  - https://v0.dev/pricing

This supports a clear **upgrade-first** strategy for Qualy.

---

## 7. Recommended Baseline (Lovable-Like)

## 7.1 Trial

- Keep trial duration: `14 days`
- Keep lock precedence: `time OR credits (first reached)`
- **Change default trial credits from `120` -> `200`** (next policy revision)

Rationale:

- Improves first-value experience materially versus 120.
- Cost impact is negligible at model level.
- Preserves conversion pressure unlike 1000-credit trials.

## 7.2 Recurring plans (upgrade-first ladder)

| Plan | Monthly Price (TRY) | Included Credits | Unit Price (TRY/credit) |
|---|---:|---:|---:|
| Starter | 349 | 1000 | 0.349 |
| Growth | 649 | 2000 | 0.325 |
| Scale | 999 | 4000 | 0.250 |

Design intent:

- Entry remains near low-friction `~USD 10` equivalent.
- Higher tiers provide better credit economics.
- Users with recurring overage have a strong reason to upgrade instead of repeatedly buying top-up.

## 7.3 Upgrade behavior (Lovable-style logic)

When user upgrades mid-cycle:

- Charge only the plan-difference amount (prorated in real payment integration).
- Current cycle entitlement becomes target-plan entitlement.
- Do **not** stack both old + new monthly credits.
- If user downgrades, apply the lower tier at next cycle start (period-end scheduling), not immediately.

This keeps billing predictable and avoids accidental over-crediting.

## 7.4 Extra credits (burst-only, premium unit price)

Top-up packs (one-time):

| Pack | Price (TRY) | Unit Price (TRY/credit) |
|---|---:|---:|
| 250 credits | 99 | 0.396 |
| 500 credits | 189 | 0.378 |
| 1000 credits | 349 | 0.349 |

Positioning:

- Small top-up packs are intentionally priced above recurring plan unit economics.
- Largest top-up pack (`1000`) aligns with Starter unit price to nudge bundle-up (`250 -> 500 -> 1000`) while still keeping Growth/Scale as the better recurring choice.
- Top-up is for temporary spikes, not normal monthly baseline.
- Default CTA priority in UI should be: `Upgrade Plan` first, `Add credits` second.

## 7.5 Policy recommendation

- Keep current entitlement rule: top-up available only for premium-active organizations.
- Add product rule: if user is on Starter and has high recurring usage, show upgrade recommendation before top-up action.

## 7.6 Renewal and cancellation UX (MVP)

- Active premium users should be able to manage renewal themselves from `Settings > Plans`:
  - `Turn off auto-renew` -> apply `cancel at period end` (service continues until current cycle end).
  - `Turn on auto-renew` -> resume normal renewal for next cycle.
- This keeps cancellation friction low (standard SaaS expectation) while preserving prepaid value until period end.
- In MVP, this control is implemented through mock subscription metadata (`auto_renew`, `cancel_at_period_end`) and can later map 1:1 to real payment-provider subscription lifecycle.

---

## 8. Unit Economics Snapshot (Illustrative)

Assumption for conversion: `1 USD = 35 TRY` (illustrative only).

### 8.1 Raw model COGS only (no overhead multiplier)

- `1000 credits` cost: `$0.45`
- Starter (`349 TRY`): gross margin vs model COGS `~95.5%`
- Growth (`649 TRY`): gross margin vs model COGS `~95.1%`
- Scale (`999 TRY`): gross margin vs model COGS `~93.7%`
- Top-up 1000 (`349 TRY`): gross margin vs model COGS `~95.5%`

### 8.2 Safety multipliers (to include retries, embeddings, infra, noise)

At `5x` effective COGS:

- Starter gross margin: `~77.4%`
- Growth gross margin: `~75.7%`
- Scale gross margin: `~68.5%`
- Top-up 1000 gross margin: `~77.4%`

Conclusion: margins stay healthy even with conservative multipliers; pricing should optimize for conversion and usage behavior.

---

## 9. Decision Rules and Revisit Triggers

After rollout, review monthly:

1. Trial lock timing:
   - If >40% of trial orgs lock in first 3 days, test `200 -> 250`.
2. Trial to paid conversion:
   - If conversion does not improve after credit increase, trial credits are not the primary bottleneck.
3. Upgrade vs top-up mix:
   - If top-up is used repeatedly for 2 consecutive cycles, push stronger upgrade nudges.
4. Top-up attach quality:
   - If one-time top-up conversion is weak, test lower entry pack emphasis (`250`) and pricing micro-adjustments.
5. Gross margin guardrail:
   - Keep blended gross margin >=70% under conservative cost multipliers.

---

## 10. Implementation Snapshot (Completed 2026-02-16)

1. Trial default moved to `200` credits in platform billing defaults and migration seed.
2. Platform billing settings expanded for multi-tier plans (`Starter/Growth/Scale`) and multi-pack top-ups (`250/500/1000`) with TRY+USD fields.
3. `/settings/plans` updated to show package ladder + top-up ladder with locale-based currency rendering (`tr` -> TRY, `en` -> USD).
4. `/admin/billing` updated so system admins can set TRY/USD values for each plan and top-up pack.
5. EN/TR copy parity updated for pricing surfaces and conversation-range language.
6. Verification step remains mandatory before release (`npm run build`).

---

## 11. Final Decision (Website + Product UI)

- **Trial:** `14 days` and `200 credits` (time OR credits lock, whichever is reached first)
- **Recurring plans:** `Starter 349 TRY`, `Growth 649 TRY`, `Scale 999 TRY`
- **Monthly included credits:** `1000 / 2000 / 4000`
- **Top-up packs:** `250 -> 99 TRY`, `500 -> 189 TRY`, `1000 -> 349 TRY`
- **Behavior:** `upgrade-first`, top-up as temporary burst insurance

Safe marketing copy for website and in-app package cards:

| Package | Safe monthly conversation range |
|---|---|
| Starter (1000 credits) | `Ayda yaklaşık 90-120 konuşma` |
| Growth (2000 credits) | `Ayda yaklaşık 180-240 konuşma` |
| Scale (4000 credits) | `Ayda yaklaşık 360-480 konuşma` |

Copy footnote to keep on website:

- `Konuşma aralığı; mesaj uzunluğu, dil ve yanıt karmaşıklığına göre değişebilir.`

---

## 12. Conversation Equivalents (User-Friendly Packaging)

Users do not reason in credits; they reason in "How many customer conversations can I handle this month?"

Assumption set used for conversion (conservative, includes lead extraction on each inbound message):

- Every inbound customer message triggers router + reply path + lead extraction.
- Conversation summary / lead-reasoning actions happen occasionally and are included as overhead in per-conversation credits.
- **Light:** ~`8` total messages/conversation (`4 customer + 4 bot`) -> ~`5.0 credits / conversation`
- **Base:** ~`12` total messages/conversation (`6 customer + 6 bot`) -> ~`9.5 credits / conversation`
- **Heavy:** ~`16` total messages/conversation (`8 customer + 8 bot`) -> ~`16.0 credits / conversation`

Conversation equivalents by package:

| Package | Credits | Light Conversations | Base Conversations | Heavy Conversations |
|---|---:|---:|---:|---:|
| Starter | 1000 | 200 | 105 | 62 |
| Growth | 2000 | 400 | 210 | 125 |
| Scale | 4000 | 800 | 421 | 250 |
| Top-up 250 | 250 | 50 | 26 | 15 |
| Top-up 500 | 500 | 100 | 52 | 31 |
| Top-up 1000 | 1000 | 200 | 105 | 62 |

Recommended customer-facing simplification (safe marketing language):

- **Starter (1000 credits):** "about `90-120` conversations/month"
- **Growth (2000 credits):** "about `180-240` conversations/month"
- **Scale (4000 credits):** "about `360-480` conversations/month"

---

## 13. Cost & Profit Table by Package

Assumptions:

- `gpt-4o-mini` prices as provided
- Credit formula: `(input + 4 * output) / 3000`, rounded up to `0.1`
- Conservative no-cache model COGS: `1 credit = $0.00045`
- FX for illustration: `1 USD = 35 TRY`

Two views:

1. **Raw model COGS only** (token cost only)
2. **5x safety COGS** (token cost multiplied by 5 to include retries/infra/noise)

| Package | Price (TRY) | Credits | Raw COGS (TRY) | Raw Profit (TRY) | Raw Margin | 5x COGS (TRY) | 5x Profit (TRY) | 5x Margin |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Starter | 349 | 1000 | 15.75 | 333.25 | 95.5% | 78.75 | 270.25 | 77.4% |
| Growth | 649 | 2000 | 31.50 | 617.50 | 95.1% | 157.50 | 491.50 | 75.7% |
| Scale | 999 | 4000 | 63.00 | 936.00 | 93.7% | 315.00 | 684.00 | 68.5% |
| Top-up 250 | 99 | 250 | 3.94 | 95.06 | 96.0% | 19.69 | 79.31 | 80.1% |
| Top-up 500 | 189 | 500 | 7.88 | 181.13 | 95.8% | 39.38 | 149.63 | 79.2% |
| Top-up 1000 | 349 | 1000 | 15.75 | 333.25 | 95.5% | 78.75 | 270.25 | 77.4% |

Interpretation:

- Even with a strict 5x safety multiplier, gross margins remain healthy.
- Therefore pricing decisions should optimize for conversion and behavior shaping (`upgrade-first`), not raw token-cost protection.
