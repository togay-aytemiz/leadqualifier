# YİÜ OpenAI Cost Comparison

**Date:** 2026-06-20  
**Scope:** Two completed, same-seed 100-question production-route artifacts  
**Pricing source:** [OpenAI API pricing](https://developers.openai.com/api/docs/pricing), standard tier prices on 2026-06-20

## Executive Summary

The measured 100-question cost rose from approximately **$4.49 to $9.96**, or **2.22x**. Total token volume rose only **3.7%** (`1,853,799 -> 1,921,939`), so the credit loss was not caused mainly by “more tokens.” The dominant change was moving the RAG answer stage from GPT-4.1-mini to GPT-5.5 while keeping a large retrieved context.

The RAG stage by itself rose from approximately **$0.39 to $5.98 per 100 questions**, including File Search calls: a **15.2x** increase. The GPT-5.5 selector was already present in both artifacts and remained approximately **$4 per 100**.

## Price Inputs

Standard API rates used in this estimate:

| Item | Input / 1M | Cached input / 1M | Output / 1M | Tool call |
|---|---:|---:|---:|---:|
| GPT-4.1-mini | $0.40 | $0.10 | $1.60 | — |
| GPT-5.5 | $5.00 | $0.50 | $30.00 | — |
| text-embedding-3-small | $0.02 | — | — | — |
| File Search | — | — | — | $2.50 / 1,000 calls |

The calculation uses uncached standard-token prices because the artifacts do not expose cached-token counts. It excludes vector-store storage, regional-processing uplift, and embedding queries. Embedding query cost is negligible at `$0.02/M` compared with the selector and GPT-5.5 answer stages. File Search storage is `$0.10/GB/day` after the first free GB.

## Same-Seed 100 Comparison

| Stage | Previous calls | Previous tokens | Previous cost | Current calls | Current tokens | Current cost |
|---|---:|---:|---:|---:|---:|---:|
| Query rewriter / GPT-4.1-mini | 84 | 149,021 | $0.067 | 83 | 147,223 | $0.066 |
| Skill selector / GPT-5.5 | 81 | 761,174 | $4.032 | 79 | 739,242 | $3.914 |
| RAG answer | 65 | 943,604 | $0.394 | 63 | 1,035,474 | $5.819 |
| File Search tool calls | 0 | — | $0.000 | 66 | — | $0.165 |
| **Total** | — | **1,853,799** | **$4.493** | — | **1,921,939** | **$9.964** |

Artifacts:

- Previous: `tmp/crawl-output/yiu-routing-random-100-2026-06-20T07-32-22-180Z.json`
- Current: `tmp/crawl-output/yiu-routing-random-100-2026-06-20T09-08-38-439Z.json`

Formula: `input_tokens * input_rate / 1,000,000 + output_tokens * output_rate / 1,000,000 + File Search calls * $0.0025`.

## Why Credits Depleted Faster

1. GPT-5.5 input is **12.5x** and output is **18.75x** the GPT-4.1-mini standard rate.
2. The File Search stage sends roughly one million tokens per 100 questions into that GPT-5.5 rate.
3. RAG output tokens rose from `13,835` to `25,660`; medium reasoning is included in billed output usage.
4. File Search adds about `$0.165` per 100 here, but this is not the main driver.
5. The selector alone remains about `$3.91` per 100, roughly **39%** of current measured spend, because each decision receives a broad 20-unique-Skill candidate payload.

Raising `max_output_tokens` from `800` to `2000` does not reserve or charge all 2,000 tokens automatically; actual consumed tokens are billed. It does, however, allow expensive broad questions to consume more reasoning/output when needed. The two successful broad-ranking controls used `29,320` and `56,834` total File Search-stage tokens and cost roughly `$0.19` and `$0.33` each, including one tool call.

## Effect of the New Clarification Flow

From the current artifact averages:

- one rewriter call: about **$0.0008**;
- one selector call: about **$0.0495**;
- one GPT-5.5 File Search route: about **$0.0950**.

An underspecified first turn now stops after the rewriter, avoiding about **$0.145** of selector + File Search work. If the user answers the clarification and the second turn needs the full route, the two-turn journey is approximately **$0.146**, versus roughly **$0.291** when both the ambiguous first turn and the retry run the full expensive path. This is an approximate **50% saving per clarification journey**, in addition to improving answer quality.

## Operating Recommendation

1. Keep the new early clarification branch: it is the highest-confidence cost reduction because it removes provably premature calls.
2. Use a 20-case smoke before every 100-case run. Continue to 100 only when quota, route attribution, and error rate are healthy.
3. Stop an eval immediately on `insufficient_quota`, repeated pipeline errors, or missing provider output; invalid runs must not consume the remaining sample.
4. Report estimated USD by stage on every run, not only token totals or internal Qualy credits.
5. Keep the `2000` correctness ceiling for now; do not lower it merely to hide cost, because `800` already produced empty structured output.
6. Do not change the model blindly. The next controlled cost experiment should replay the same frozen RAG red set with GPT-5.4-mini versus GPT-5.5. GPT-5.4-mini is priced at `$0.75/M` input and `$4.50/M` output, but it should ship only if direct-evidence safety and supported recall remain acceptable.
7. Separately test a compact selector payload or top `8-12` unique candidates. This can address the selector's 39% share, but only after measuring Skill recall; it is not part of the clarification fix.
8. Set OpenAI project budget alerts/limits around the intended evaluation budget. At the measured rate, each healthy full 100 costs about `$10`, so repeated full runs accumulate quickly.

## Decision

Ship the router-level clarification fix without another model change. Run targeted clarification tests first. When API quota is available, run the 20 clarification cases and a 20-question cost smoke; only then authorize a new disjoint 100.

