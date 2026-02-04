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
- Crisp-inspired main sidebar with collapsible state and active navigation pill.
- Refined collapsed sidebar icon sizing and header toggle placement.
- Centered collapsed logo alignment to match icon stack.
- Eyebrow section labels added for Workspace, AI Tools, and Other groups.
- Added extra top padding between the sidebar header and first section label.
- **Enterprise RAG Hardening:** Knowledge documents + chunks schema, chunking with overlap, token-budgeted context assembly, and chunk-level retrieval RPC with service-role-safe search for webhooks.
- Knowledge Base UI now shows indexing status badges (Ready / Processing / Error).
- Contextual KB routing with LLM-based decision + follow-up query rewrite.
- Router now receives the last bot reply and the last five user messages with timestamps to improve follow-up handling.
- Simulator now shows per-message token usage (input/output/total) plus router/RAG breakdown and conversation totals in debug and bubbles.
- Automated i18n guard: hardcoded UI string scan + EN/TR key parity check (`npm run i18n:check`) wired into lint.
- Expanded EN/TR translations for admin, channels, simulator, inbox details, and auth placeholders.

### Added
- **v0.5.0: Knowledge Base Parity**
  - **Simulator RAG Fallback:** Implemented RAG (Retrieval-Augmented Generation) in the `ChatSimulator`. It now falls back to the Knowledge Base (OpenAI + Embeddings) if no skill matches, mirroring the production Telegram behavior.
  - **Documentation:** Updated PRD and Roadmap to reflect current status.

### Added
- **v0.4.0: Active Agent & Realtime Inbox**
  - **Explicit Active State**: Added `active_agent` column ('bot' | 'operator') to prevent AI interference.
  - **Double-Lock Logic**: AI is now blocked if `active_agent === 'operator'` OR `assignee_id` is present.
  - **Assignee System**: Operators can "Claim" conversations; replying automatically assigns the user.
  - **Realtime Updates**: Enabled `supabase_realtime` for instant message delivery and inbox sorting.
  - **Optimistic UI**: Instant feedback on send, with "temp" message deduplication logic.
  - **Inbox Polish**: Robust auto-scroll, "Unassigned" filters, and simplified Details Panel (Status/Platform icons refined).
  - **Developer**: Added error boundaries to `sendMessage` and strictly typed DB interfaces.
- **Workflow**: Agents must always include a commit message in responses.

### Changed
- Global font updated to Plus Jakarta Sans via Google Fonts import.
- Sidebar toggle now uses arrow-from-line icons for clearer affordance.
- Removed legacy `knowledge_base` table in favor of documents/chunks.
- Replaced remaining hardcoded UI strings with translation keys across the app.
- Updated AGENTS.md to enforce multilingual-first feature development.
- KB routing now favors definition-style questions and retries with a lower similarity threshold when initial KB search is empty.
- Chunk overlap now aligns to paragraph/sentence boundaries to avoid mid-sentence splits.
- Knowledge sidebar now lists uncategorized items (max 10 with expand) and shows accurate all-content counts.
- Simulator debug panel now hides per-request token breakdown (per-bubble + conversation totals remain).
- Knowledge Base UI terminology now uses "folder" instead of "collection".
- Knowledge Base search now falls back to keyword matching when embeddings fail or return no results.
- Simulator fallback now suggests available topics based on existing skills and knowledge documents when no match is found.
- Org-level AI settings with always-on Flexible mode, single threshold, and single prompt for fallback behavior.
- Settings pages now use a two-column section layout for clearer configuration.
- Added Profile and Organization settings pages with header save + unsaved change confirmation.
- Settings pages now show a top-right save button that activates only when changes are detected.
- Removed redundant current-value summaries above settings inputs and selections.
- Unsaved changes modal now uses soft-danger discard, single-line save CTA, and content-hugging secondary buttons.
- Channels page title standardized to "Channels" with wider channel cards.
- AI settings load now falls back quietly unless debug logging is enabled.
- Flexible fallback now uses only the UI-configured prompt (no hardcoded system append).

### Fixed
- Inbox now refreshes messages on conversation updates to surface bot/contact replies in realtime.
- Manual replies atomically assign the current operator to prevent "Unassigned" state until refresh.
- Realtime subscriptions now attach the session token before subscribing (fixes missing live updates).
- RAG now enforces NO_ANSWER fallback and handles retrieval errors without failing the webhook.
- Knowledge base sidebar now refreshes after folder create/delete actions triggered outside the sidebar.
- Simulator KB fallback now answers definition-style questions that previously fell through routing.

---

## Version History

| Version | Date | Summary |
|---------|------|---------|
| 0.5.0 | 2026-02-02 | Knowledge Base Parity (Simulator RAG) |
| 0.4.0 | 2026-02-02 | Active Agent State, Realtime Inbox, & Assignee System |
| 0.3.5 | 2026-01-31 | Phase 3.5: WhatsApp Simulator & Dynamic Thresholds |
| 0.3.0 | 2026-01-31 | Phase 3: Skill System |
| 0.2.0 | 2026-01-31 | Phase 1: Multi-tenant infrastructure + auth |
| 0.1.0 | 2026-01-31 | Phase 0: Project setup complete |
| 0.0.0 | 2026-01-31 | Project kickoff, documentation created |
