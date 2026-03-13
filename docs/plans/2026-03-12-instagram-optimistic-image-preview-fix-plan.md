# Instagram Optimistic Image Preview Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep outbound Instagram image bubbles visually stable while sending, so the composer shows the actual selected image plus footer text instead of a broken placeholder image.

**Architecture:** The optimistic bubble currently renders a `blob:` preview URL copied from the pending attachment, but the same send flow revokes that URL immediately when it clears the attachment tray. The fix is to separate pending-composer cleanup from optimistic-preview cleanup: keep preview URLs alive while temporary optimistic messages still reference them, then revoke them when those temp messages are replaced, failed, or the conversation changes.

**Tech Stack:** Next.js App Router, React client state, Vitest

---

### Task 1: Reproduce the optimistic preview revocation bug

**Files:**
- Modify: `src/components/inbox/messageMedia.test.ts`
- Read: `src/components/inbox/InboxContainer.tsx`

**Step 1: Write the failing test**

Add a regression test proving media metadata can carry a local optimistic preview URL plus an explicit temporary preview token/ownership marker without being treated as missing media.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/inbox/messageMedia.test.ts`

Expected: FAIL until the metadata contract and extraction logic support the optimistic-preview marker.

### Task 2: Keep optimistic preview URLs alive until message lifecycle ends

**Files:**
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `src/components/inbox/messageMedia.ts`

**Step 1: Add explicit optimistic preview metadata**

Store a dedicated preview URL/token in optimistic outbound message metadata instead of relying on pending attachment lifecycle.

**Step 2: Track and revoke preview URLs from optimistic message lifecycle**

Revoke local preview URLs only when:
- optimistic messages are replaced by refreshed server messages
- optimistic messages fail and are no longer needed
- conversation/component cleanup removes the temp message

Do not revoke them when merely clearing pending composer attachments.

**Step 3: Keep footer/text layout unchanged**

Continue rendering the image bubble as a normal outbound image with the existing `You · HH:mm · Sending...` footer so Instagram send UX stays consistent with the intended design.

### Task 3: Verify and document

**Files:**
- Modify: `docs/PRD.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/RELEASE.md`

**Step 1: Run targeted tests**

Run:
- `npm test -- --run src/components/inbox/messageMedia.test.ts`
- `npm test -- --run src/components/inbox/instagramRequestState.test.ts`

**Step 2: Run build**

Run: `npm run build`

**Step 3: Update docs**

Document that outbound Instagram image optimistic rendering now preserves the selected image preview during send instead of briefly showing a broken placeholder.
