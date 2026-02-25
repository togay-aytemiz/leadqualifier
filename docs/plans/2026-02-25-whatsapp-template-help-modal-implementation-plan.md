# WhatsApp Template Help Modal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a second help/info modal to WhatsApp Template Tools so users can quickly learn how to use template sending correctly.

**Architecture:** Keep the current template send modal as primary flow. Add a lightweight secondary modal triggered by a `How to use` action, backed by i18n keys in TR/EN. Keep behavior read-only and UI-only, without backend changes.

**Tech Stack:** Next.js App Router, React client components, next-intl i18n, existing design `Modal` + `Button` components.

---

### Task 1: Add secondary help modal UI to channel template modal

**Files:**
- Modify: `src/components/channels/WhatsAppTemplateModal.tsx`

### Task 2: Add localized help content (TR/EN)

**Files:**
- Modify: `messages/tr.json`
- Modify: `messages/en.json`

### Task 3: Update product docs and release notes

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

### Task 4: Verification

**Commands:**
- `npm run i18n:check`
- `npm run build`
