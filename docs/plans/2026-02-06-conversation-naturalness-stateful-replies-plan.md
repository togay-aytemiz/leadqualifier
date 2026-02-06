# Conversation Naturalness & Stateful Replies Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make KB/fallback conversation replies feel human-like by using real recent history, reducing repeated greetings/questions, and carrying known lead facts into response prompts across Telegram and Simulator.

**Architecture:** Introduce a shared conversation-context helper in `src/lib/ai/` for history normalization, style guidance, and repeated-greeting cleanup. Use this helper in both RAG and fallback response generation paths so final answers (not only routing) are context-aware. Keep changes channel-agnostic where possible and pass lead snapshot context when available.

**Tech Stack:** Next.js server actions/routes, TypeScript, OpenAI chat completions, Vitest.

---

### Task 1: Add shared conversation-context helpers

**Files:**
- Create: `src/lib/ai/conversation.ts`
- Test: `src/lib/ai/conversation.test.ts`

**Step 1: Write failing tests**
- Add tests for:
  - history normalization and latest-user dedupe
  - continuity guidance with lead facts
  - repeated greeting stripping when recent assistant replies already greeted

**Step 2: Run tests to verify failure**
- Run: `npm test -- --run src/lib/ai/conversation.test.ts`

**Step 3: Write minimal implementation**
- Implement helper functions:
  - `normalizeConversationHistory`
  - `toOpenAiConversationMessages`
  - `buildConversationContinuityGuidance`
  - `stripRepeatedGreeting`

**Step 4: Run tests to verify pass**
- Run: `npm test -- --run src/lib/ai/conversation.test.ts`

### Task 2: Make fallback generation history-aware

**Files:**
- Modify: `src/lib/ai/fallback.ts`

**Step 1: Write/extend failing tests**
- Extend helper tests if needed to cover fallback-integration invariants indirectly (history message conversion/greeting stripping behavior).

**Step 2: Run targeted tests**
- Run helper test command.

**Step 3: Implement minimal fallback changes**
- Accept `conversationHistory` and `leadSnapshot` in fallback options.
- Build system prompt with continuity guidance + required-fields guidance.
- Send normalized history turns as assistant/user messages before latest user message.
- Post-process output with `stripRepeatedGreeting`.

**Step 4: Re-run targeted tests**
- Run helper/followup tests.

### Task 3: Use continuity helpers in Simulator + Telegram RAG

**Files:**
- Modify: `src/lib/chat/actions.ts`
- Modify: `src/app/api/webhooks/telegram/route.ts`
- Modify: `src/lib/knowledge-base/router.ts`

**Step 1: Add/adjust tests first where practical**
- Prefer unit tests on helper behavior; keep route/action coverage via focused regression checks.

**Step 2: Implement minimal changes**
- RAG completions include normalized recent history turns, continuity guidance, and greeting-strip post-process.
- Fallback calls pass conversation history + assistant history.
- Router allows more than one recent assistant turn for better follow-up routing.

**Step 3: Run relevant tests**
- Run followup + new helper tests.

### Task 4: Verify and document

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Full verification**
- Run: `npm test -- --run src/lib/ai/followup.test.ts src/lib/ai/conversation.test.ts src/lib/leads/offering-profile-utils.test.ts`
- Run: `npm run build`

**Step 2: Update docs**
- Add roadmap/prod/release notes for stateful natural-reply improvements and cross-channel scope.

**Step 3: Final review**
- Check `git diff` for unintended changes and keep existing user changes intact.
