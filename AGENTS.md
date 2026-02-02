# AI Agent Guidelines — WhatsApp Lead Qualifier

> **Purpose:** Instructions for AI coding assistants working on this project.

---

## 🎯 Project Overview

This is a **WhatsApp AI Lead Qualifier** SaaS for Turkish SMBs. The system:
- Auto-responds to WhatsApp messages using Skills & Knowledge Base
- Qualifies leads with AI-powered extraction & scoring
- Surfaces only serious leads for human follow-up

**Target Users:** Beauty centers, photographers, clinics (non-technical, small teams).

---

## 📚 Key Documents

| Document | Path | Purpose |
|----------|------|---------|
| PRD | `docs/PRD.md` | Product requirements & feature specs |
| Roadmap | `docs/ROADMAP.md` | Development phases with checkboxes |
| Release Notes | `docs/RELEASE.md` | Track completed work per iteration |
| This File | `AGENTS.md` | AI agent workflow instructions |

---

## ⚠️ Critical Workflow Rules

### After Completing Tasks

**You MUST update these documents after completing work:**

1. **`docs/ROADMAP.md`**
   - Mark completed items with `[x]`
   - Add new items if scope expanded
   - Update "Last Updated" date

2. **`docs/PRD.md`**
   - Update if requirements changed
   - Add decisions to "Tech Decisions" appendix
   - Update "Last Updated" date

3. **`docs/RELEASE.md`**
   - Add completed features under `[Unreleased]` → `Added`
   - Note any changes under `Changed`
   - Document bug fixes under `Fixed`

4. **Commit messages**
   - Reference the roadmap phase: `feat(phase-3): implement skill CRUD`
   - **Always provide a commit message in every response** (even if no commit is requested)

5. **Build Verification**
   - Run `npm run build` to ensure no regressions or type errors.

---

## 🛠️ Development Principles

### Code Style
- **DRY** — Don't Repeat Yourself
- **YAGNI** — You Aren't Gonna Need It
- **TDD** — Write tests first when possible

### Architecture
- **Multi-tenant first** — All data isolated by `organization_id`
- **Supabase RLS** — Row-level security for data isolation
- **Supabase RLS** — Row-level security for data isolation
- **Edge functions** — For serverless API endpoints
- **Realtime** — Use `supabase_realtime` for live features (Inbox)

### AI Features
- **No hallucination** — AI responds ONLY from Skills/KB
- **Graceful fallback** — Unknown → human handoff
- **Confidence thresholds** — Don't respond if uncertain

---

## 🌍 Internationalization

- **Always maintain TR and EN Support:** Every new UI text must be translatable.
- **No Hardcoded Strings:** Use `messages/en.json` and `messages/tr.json` for all visible text.
- **Hooks:** Use `useTranslations` (for Client Components) or `getTranslations` (for Server Components).

---

## 📋 Skills to Use

Before starting work, check these skills:

| Skill | When to Use |
|-------|-------------|
| `@brainstorming` | Before any new feature or design decision |
| `@writing-plans` | Before implementing multi-step tasks |
| `@troubleshooting` | When debugging or handling errors |

---

## 🔄 Typical Workflow

```
1. Read PRD.md to understand requirements
2. Check ROADMAP.md for current phase
3. Use @brainstorming for new features
4. Use @writing-plans for implementation
5. Implement with TDD
6. Update ROADMAP.md (mark [x])
7. Update PRD.md if specs changed
8. Commit with meaningful messages
```

---

## 🏗️ Tech Stack (Finalized)

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router) |
| Backend | Supabase Edge Functions |
| Database | Supabase (PostgreSQL + pgvector + RLS) |
| Auth | Supabase Auth (Email/Password) |
| AI/LLM | OpenAI GPT-4o-mini |
| Embeddings | OpenAI text-embedding-3-small + pgvector |
| WhatsApp | Meta Cloud API |
| Hosting | Vercel |
| i18n | next-intl (TR + EN) |

---

## 📝 Commit Convention

```
feat(phase-N): description    # New feature
fix(phase-N): description     # Bug fix
docs: description             # Documentation only
refactor: description         # Code restructure
test: description             # Adding tests
```

---

## 🚫 Out of Scope (MVP)

Do NOT implement these features:
Do NOT implement these features:
- Calendar integration
- Auto follow-up sequences
- Campaigns / broadcasts
- Flow builder

These are planned for post-MVP.
