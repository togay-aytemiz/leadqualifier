# Instagram Disclaimer Format Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Instagram bot mesajlarında disclaimer bloğunu WhatsApp blockquote hissini koruyacak şekilde ayirici cizgiyle formatlamak ve Inbox'ta bu bloğu gorunur metinden gizlemeye devam etmek.

**Architecture:** Mevcut merkezi disclaimer formatter platform bilgisi alacak ve varsayilan davranisi korurken Instagram icin ozel bir trailing format uretecek. Inbox disclaimer parser'i hem eski standart quote formatini hem de yeni Instagram ayirici + quote varyantini taniyacak; degisiklik TDD ile dogrulanacak.

**Tech Stack:** Next.js 14, TypeScript, Vitest

---

### Task 1: Disclaimer formatting tests

**Files:**
- Modify: `src/lib/ai/bot-disclaimer.test.ts`
- Test: `src/lib/ai/bot-disclaimer.test.ts`

**Step 1: Write the failing test**

Add a test that expects Instagram disclaimer output to be:

```ts
Merhaba

------
> Bu mesaj AI bot tarafindan olusturuldu, hata icerebilir.
```

while non-Instagram output remains unchanged.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/ai/bot-disclaimer.test.ts`
Expected: FAIL because formatter does not yet accept platform-specific output.

### Task 2: Inbox parser tests

**Files:**
- Modify: `src/components/inbox/botMessageContent.test.ts`
- Test: `src/components/inbox/botMessageContent.test.ts`

**Step 1: Write the failing test**

Add a test that expects `splitBotMessageDisclaimer` to strip:

```ts
Merhaba

------
> disclaimer
```

into `body = "Merhaba"` and `disclaimer = "disclaimer"`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/inbox/botMessageContent.test.ts`
Expected: FAIL because parser only recognizes the old trailing quote-line format.

### Task 3: Minimal implementation

**Files:**
- Modify: `src/lib/ai/bot-disclaimer.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`
- Modify: `src/components/inbox/botMessageContent.ts`

**Step 1: Add platform-aware disclaimer formatting**

Extend the formatter input with platform context and keep `whatsapp` / `telegram` output as:

```ts
${baseMessage}\n\n> ${disclaimerMessage}
```

Add Instagram output as:

```ts
${baseMessage}\n\n------\n> ${disclaimerMessage}
```

**Step 2: Pass platform from the shared inbound pipeline**

Use the conversation platform when formatting outbound bot content so Instagram gets the new variant and other channels keep the old one.

**Step 3: Teach Inbox parsing both variants**

Parse either the original trailing quote block or the Instagram separator-plus-quote block without affecting normal `>` usage inside message text.

### Task 4: Verification

**Files:**
- Verify only

**Step 1: Run targeted tests**

Run:
- `npm test -- --run src/lib/ai/bot-disclaimer.test.ts`
- `npm test -- --run src/components/inbox/botMessageContent.test.ts`

Expected: PASS

**Step 2: Run required regression/build commands**

Run:
- `npm test -- --run src/lib/ai/followup.test.ts`
- `npm test -- --run src/lib/ai/response-guards.test.ts`
- `npm run build`

Expected: PASS

### Task 5: Documentation

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

**Step 1: Update docs**

Record the new Instagram disclaimer formatting behavior, refresh `Last Updated` dates, and add release-note entries under `[Unreleased]`.
