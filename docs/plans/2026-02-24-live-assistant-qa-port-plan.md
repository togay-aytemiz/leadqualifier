# Live Assistant QA-Port Implementation Plan

> Goal: Move proven QA Assistant behavior improvements into the live assistant stack without porting QA-only generator/judge infrastructure.

## Scope

### In Scope
- Response-language consistency (reply in user turn language, no mixed-language leaks)
- Chat-first continuation (avoid phone/website redirect loops)
- Answer-first ordering on direct user questions
- Refusal-aware intake pressure control
- Repeated engagement suppression
- Non-invasive response-surface normalization

### Out of Scope
- QA Generator/Judge orchestration
- QA run scoring/reporting infrastructure
- QA scenario synthesis and fixture stabilization

## Rollout Phases

### Phase 1 (P0) — Low-risk Response Guards
Apply post-processing guards to all live assistant output surfaces (RAG + fallback):
1. Language consistency guard (`tr`/`en`) with known snippet normalization.
2. External-contact redirect sanitization (`website/phone/contact`) to chat-first continuation.
3. Answer-first ordering for direct questions.
4. Refusal-aware question stripping for intake-pressure phrasing.
5. Repeated engagement question suppression.
6. Surface artifact cleanup (`12. 000` => `12.000`, punctuation/spacing normalization).

Success criteria:
- Mixed-language response leak rate: 0 in manual QA samples.
- No regression in fallback/RAG response delivery.
- No increase in hard handoff/escalation rates.

### Phase 2 (P1) — Contextual Intake Behavior
1. Request-mode-aware intake pressure (`lead_qualification` vs `general_information`/`policy`).
2. No-progress loop-break after repeated non-progress turns.
3. Blocked-field re-ask prevention (already collected/deferred fields).

Success criteria:
- Repetitive questioning findings drop materially.
- Completion quality stable or improved in QA runs and simulator checks.

### Phase 3 (P1/P2) — Intake Strictness Calibration
1. Dynamic minimum intake set for short conversations.
2. Better prioritization for high-impact missing fields.

Success criteria:
- Lower false-negative quality findings on short interactions.
- Improved user experience in resistant flows.

### Phase 4 (P2) — Global Default Rollout (No Flags)
1. Enable QA-port runtime behavior globally for all current organizations.
2. Keep the same behavior as the default for every new organization.
3. Monitor key metrics: language consistency, repeated-question ratio, fallback quality, escalation ratio.

## Implementation Checklist

### Phase 1 Tasks (This iteration)
- [x] Add shared response-guards module for live assistant.
- [x] Wire guards into live fallback generation.
- [x] Wire guards into inbound RAG path (WhatsApp shared pipeline).
- [x] Wire guards into Telegram RAG path.
- [x] Wire guards into simulator RAG path.
- [x] Add unit tests for response guards.
- [x] Update PRD/ROADMAP/RELEASE notes.

### Phase 2 Tasks (Next iteration)
- [x] Introduce request-mode routing and non-qualification intake suppression in live prompt layer.
- [x] Add no-progress loop-break response strategy (guard-enforced concise summary + soft next-step when progress stalls).
- [x] Add blocked-field re-ask guard based on collected/deferred intake state.
- [x] Ground generic unknown fallback with best-available KB context hints before generic topic redirection.

### Phase 3 Tasks (Next iteration)
- [x] Add dynamic minimum required-intake logic for short conversations.
- [x] Calibrate missing-field priority order and wording.

### Phase 4 Tasks (Rollout)
- [x] Adopt no-flag rollout strategy for pre-customer stage.
- [x] Keep QA-port runtime behavior globally enabled for all current organizations.
- [x] Keep QA-port runtime behavior enabled by default for new organizations.
- [ ] Finalize go-live checklist and rollback criteria.
