# Release Notes

> Track completed work after each iteration.

---

## [Unreleased]

### Added
- Next.js 14 project with App Router and TypeScript
- Strict TypeScript configuration (`noUncheckedIndexedAccess`, `noImplicitReturns`)
- Prettier + ESLint with strict rules
- Supabase client/server setup (`src/lib/supabase/`)
- i18n support with next-intl (Turkish + English)
- Locale-aware routing (`/[locale]/`)
- Environment variables template (`.env.local.example`)
- Comprehensive README with setup instructions
- Project documentation (PRD, Roadmap, AGENTS.md)
- **Phase 1: Multi-Tenant Infrastructure**
  - Supabase migrations (schema, RLS policies, auth triggers)
  - Database types (`src/types/database.ts`)
  - Organizations, profiles, organization_members tables
  - Auth pages (login, register) with i18n
  - Protected dashboard with organization display
  - OrganizationContext for client-side org management
  - Sign out API route
- **Phase 3: Skill System**
  - Skills table with pgvector for semantic search
  - Embedding generation with OpenAI text-embedding-3-small
  - Skill CRUD operations (create, edit, delete, toggle)
  - Skills admin UI (list, create, edit pages)
  - Skill test playground with similarity matching
  - i18n translations for skills (EN/TR)
- **Phase 3.5: WhatsApp Simulator**
  - Realistic WhatsApp-style chat UI
  - Real-time skill matching simulation
  - Org-specific simulation context
  - Debug panel with confidence scores and matched skill details
  - Dynamic sensitivity threshold slider (0.0 - 1.0)
- **Phase 3.6: Refinements & Inbox**
  - **Refactoring:** Replaced all `material-symbols-outlined` with `lucide-react` icons for modern consistency.
  - **Inbox:** Implemented lazy loading (infinite scroll) for conversations.
  - **Inbox:** Added "Delete Conversation" functionality with cascading database deletes.
  - **Inbox:** UI improvements (message previews, simplified list items).
  - **Inbox:** Removed mock data creation; now fully driven by real database data.

### Added
- **v0.4.0: Active Agent & Realtime Inbox**
  - **Explicit Active State**: Added `active_agent` column ('bot' | 'operator') to prevent AI interference.
  - **Double-Lock Logic**: AI is now blocked if `active_agent === 'operator'` OR `assignee_id` is present.
  - **Assignee System**: Operators can "Claim" conversations; replying automatically assigns the user.
  - **Realtime Updates**: Enabled `supabase_realtime` for instant message delivery and inbox sorting.
  - **Optimistic UI**: Instant feedback on send, with "temp" message deduplication logic.
  - **Inbox Polish**: Robust auto-scroll, "Unassigned" filters, and simplified Details Panel (Status/Platform icons refined).
  - **Developer**: Added error boundaries to `sendMessage` and strictly typed DB interfaces.

### Changed
- N/A

### Fixed
- Inbox now refreshes messages on conversation updates to surface bot/contact replies in realtime.
- Manual replies atomically assign the current operator to prevent "Unassigned" state until refresh.

---

## Version History

| Version | Date | Summary |
|---------|------|---------|
| 0.4.0 | 2026-02-02 | Active Agent State, Realtime Inbox, & Assignee System |
| 0.3.5 | 2026-01-31 | Phase 3.5: WhatsApp Simulator & Dynamic Thresholds |
| 0.3.0 | 2026-01-31 | Phase 3: Skill System |
| 0.2.0 | 2026-01-31 | Phase 1: Multi-tenant infrastructure + auth |
| 0.1.0 | 2026-01-31 | Phase 0: Project setup complete |
| 0.0.0 | 2026-01-31 | Project kickoff, documentation created |
