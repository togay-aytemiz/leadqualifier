# Inbox Details Information Hierarchy Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the duplicate `Önemli bilgiler` hierarchy in Inbox Details by making the top metadata block a collapsible conversation-details section and moving required-info fields inside the `Kişi` section.

**Architecture:** Keep the existing disclosure system, extend it with one more section state for conversation metadata, and replace the standalone required-info section with a compact inline sub-block inside the lead/person section. Avoid new server behavior; this is information architecture and UI polish only.

**Tech Stack:** Next.js App Router, React 19, Tailwind CSS, next-intl, Vitest

---

### Task 1: Add failing presentation tests

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/components/inbox/importantInfoSummary.test.tsx`
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/LeadRequiredInfoBlock.test.tsx`

1. Add a failing test for a compact required-info block that renders summary rows plus one header action without a section-card wrapper.
2. Extend the summary test so the summary stays wrapper-light and button-free.

### Task 2: Extract compact required-info block

**Files:**
- Create: `/Users/togay/Desktop/leadqualifier/src/components/inbox/LeadRequiredInfoBlock.tsx`

1. Create a presentational component for the in-person-section required-info block.
2. Keep it compact: small subheading, inline `Düzenle`, then summary rows.

### Task 3: Rework Inbox details hierarchy

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/src/components/inbox/InboxContainer.tsx`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/tr.json`
- Modify: `/Users/togay/Desktop/leadqualifier/messages/en.json`

1. Add a disclosure state for the top metadata section and rename `keyInfo` to conversation-level wording.
2. Wrap the top metadata section in `InboxDetailsSection` for both mobile and desktop.
3. Remove the standalone lower required-info section and render the new compact block inside `Kişi`.

### Task 4: Update docs and verify

**Files:**
- Modify: `/Users/togay/Desktop/leadqualifier/docs/PRD.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/ROADMAP.md`
- Modify: `/Users/togay/Desktop/leadqualifier/docs/RELEASE.md`

1. Update product docs to reflect the new information hierarchy and naming.
2. Run targeted tests.
3. Run `npm run build`.
