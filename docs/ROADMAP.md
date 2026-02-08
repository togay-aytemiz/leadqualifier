# WhatsApp AI Lead Qualifier — Roadmap

> **Last Updated:** 2026-02-08 (desktop settings now keeps inner sidebar mounted while only detail content transitions/loading updates; mobile settings back navigation now uses client-side routing to avoid refresh-like behavior/stuck transitions; mobile knowledge edit header copy simplified to icon-only back + short `Düzenle/Kaydet`; skills detail actions now use standardized delete/save icons; mobile navbar transition lag reduced via route prefetch warmup; mobile skills detail header copy simplified to short labels; mobile skills single-pane list→detail flow; mobile settings single-pane list→detail flow with animated back transition; mobile knowledge base single-pane flow with responsive file cards; mobile leads list compact-card layout + tighter mobile spacing; summary panel reopen now regenerates; mobile inbox details payload + visible operator-exit action + slide transitions; compact shadow/off inbox assistant-state banner copy; inbox list header chevron removal; scroll-to-latest CTA anchored on composer divider with subtle gray tone; tighter summary-to-banner composer spacing; extraction summary-window alignment; Telegram skill-match fail-open fallback hardening)  
> Mark items with `[x]` when completed.

---

## Phase 0: Project Setup ✅
- [x] Initialize project repository
- [x] Set up development environment
- [x] Choose and configure tech stack
- [x] Set up CI/CD pipeline (Vercel auto-deploys)
- [x] Configure database (Supabase client ready)
- [x] Set up environment variables
- [x] Codify agent workflow rules (always provide commit message)
- [x] Add subagent-driven-development skill for plan execution workflow
- [x] Use system fonts in app shell to avoid CI font-fetch issues

---

## Phase 1: Core Infrastructure ✅
- [x] **Multi-Tenant Foundation**
  - [x] Create organization model
  - [x] Implement `organization_id` isolation
  - [x] Set up RLS policies
- [x] **Auth & User Management**
  - [x] Supabase Auth integration
  - [x] User-organization relationship
  - [x] Role-based access (admin, member)

---

## Phase 2: Messaging Channels (WhatsApp Pending)
- [ ] **WhatsApp (Meta Cloud API)**
  - [ ] Choose provider (Twilio / 360dialog / Meta Cloud API)
  - [ ] Webhook endpoint for incoming messages
  - [ ] Outgoing message API
- [x] **Telegram (Sandbox)**
  - [x] Channel connect + webhook registration
  - [x] Incoming message webhook
  - [x] Outgoing message API
  - [x] Skill-match failures fail open to KB/fallback instead of dropping reply flow
- [x] **Message Handling Core**
  - [x] Store incoming messages
  - [x] Store outgoing messages
  - [x] Conversation threading

---

## Phase 3: Skill System ✅
- [x] **Skill CRUD**
  - [x] Create skill model
  - [x] Admin UI for skill management
  - [x] Enable/disable toggle
- [x] **Skill Matching Engine**
  - [x] Embedding generation for triggers
  - [x] Embedding generation now includes skill titles in addition to triggers
  - [x] Similarity search (top-5)
  - [x] LLM re-ranking
  - [x] Confidence threshold logic
- [ ] **Skill Testing**
  - [ ] Per-skill playground in admin (use Simulator for now)

## Phase 3.5: Chat Simulator (WhatsApp-Style UI) ✅
- [x] **Chat Interface**
  - [x] WhatsApp-like UI (bubbles, ticks, input)
  - [x] Org-specific simulator URL
- [x] **Simulation Logic**
  - [x] Connect to Skill Matching Engine
  - [x] Simulate typing delay
  - [x] Debug mode for matching details
  - [x] **RAG Fallback:** Matches production logic (KB search if no skill found)
- [x] **Dynamic Controls**
  - [x] Sensitivity threshold slider
  - [x] Token usage breakdown (input/output) per message
  - [x] Conversation-level token usage totals
  - [x] Hide debug token breakdown (keep per-message + conversation totals)
- [x] **Fallback Guidance:** Offer topic suggestions from skills/KB when no match is found

## Phase 3.6: Refinements & Inbox ✅
- [x] **Inbox UI**
  - [x] Conversation list with lazy loading
  - [x] Message history view
  - [x] Delete conversation functionality
  - [x] Composer banner copy + centered layout
  - [x] Details avatar initials match conversation list
  - [x] Conversation avatars use shared initials/colors across list, chat, and details
  - [x] Lead snapshot grouped under Key Information with contact header restored
  - [x] Score reasoning UI uses locale-aware copy and labels
  - [x] Lead extraction paused notice + manual refresh in details panel
  - [x] Lead snapshot header shows AI extraction chip and status uses dot + text
  - [x] Platform row shows channel icon and channel cards use consistent icon sizing
  - [x] Platform icons now use react-icons with brand colors
  - [x] Inbox list avatars include platform badges for quick channel recognition
  - [x] Inbox list platform badges enlarged with brand-colored icons
  - [x] Inbox list platform badges centered under avatars
  - [x] Inbox list platform badges adjusted for size and placement
  - [x] Inbox list platform badges lowered and icon size increased
  - [x] Inbox list platform badges lowered further with thinner borders
  - [x] Inbox list lead status shown as a right-aligned chip on the name row
  - [x] Inbox list time moved to a dedicated third row under message preview
  - [x] Inbox bot message bubbles now use a darker background with light text for better contrast
  - [x] Unread indicators in sidebar + conversation list
  - [x] Real-time updates (via polling/subscriptions)
  - [x] On-demand conversation summary (button + inline panel)
  - [x] Closing and reopening summary panel now regenerates summary without requiring manual refresh
  - [x] Mobile inbox app flow with list-to-conversation transition and back navigation
  - [x] Mobile chat header details toggle with compact contact/lead snapshot
  - [x] Mobile details payload now includes lead summary, service type, and collected required info
  - [x] Mobile operator takeover view shows a visible Leave Conversation action
  - [x] Mobile list/detail navigation uses slide transitions (forward/back)
  - [x] Mobile details panel now dims background with a dark overlay and closes on outside tap
  - [x] Mobile details panel open/close now uses smooth transition (fade + slight slide)
  - [x] Inbox list header no longer shows the dropdown chevron next to the title
  - [x] Chat view now shows an animated "scroll to latest" button only when not at bottom, positioned on the composer divider
  - [x] Reduced vertical gap between the "Konuşma Özeti" row and the assistant banner in composer area
  - [x] Shadow/Off bot modes now show compact inactive-state banner copy (single-line title + short body) in composer area
- [x] **Refactoring**
  - [x] Migrate to Lucide Icons
  - [x] Primitive component cleanup
  - [x] Skills and Knowledge Base primary CTA buttons now use `#242A40` accent styling
  - [x] Skills detail header delete/save actions now use standardized icon + label pattern (desktop/mobile compatible)
- [x] **Navigation Shell**
  - [x] Crisp-inspired main sidebar with collapse toggle and persisted state
  - [x] Refined collapsed icon layout and toggle placement (Netlify-style)
  - [x] Centered collapsed logo alignment
  - [x] Sidebar header branding uses `logo-black.svg` when expanded and `icon-black.svg` when collapsed
  - [x] Collapsed sidebar brand icon scaled up to match active navigation item size
  - [x] Eyebrow section labels for grouped navigation
  - [x] Increased spacing between header and first sidebar section
  - [x] Sidebar nav icons use active/passive variants per item
  - [x] Sidebar accent and active-state color updated from blue to `#242A40`
  - [x] Mobile bottom navbar with 5 items (Inbox, Kişiler, Yetenekler, Bilgi Bankası, Diğer)
  - [x] Mobile “Diğer” quick menu with Simülatör, Ayarlar, and Signout
  - [x] Mobile Skills page now uses app-style single-pane navigation (list page → detail page with back action)
  - [x] Mobile Skills detail header uses shorter labels (`Düzenle`, `Kaydet`) to reduce top-bar clutter
  - [x] Mobile Settings now uses app-style single-pane navigation (settings list page → detail page with back action)
  - [x] Mobile Settings detail pages now use animated back transition to the settings list (Inbox-style slide-out)
  - [x] Mobile Settings back action now performs client-side navigation (no full refresh feel on detail→list return)
  - [x] Desktop Settings now keeps the inner settings sidebar persistent while only detail content switches/loading states
  - [x] Mobile Knowledge Base now uses a single-pane flow (sidebar hidden on mobile and files rendered as responsive cards)
  - [x] Mobile Knowledge edit header now uses compact labels (`Düzenle`, `Kaydet`) and icon-only back affordance
  - [x] Mobile bottom navbar now prefetches primary routes for faster tab transitions
- [x] **Inbox Reliability**
  - [x] Atomic operator assignment on manual send
  - [x] Message refresh fallback for bot/contact updates
  - [x] Realtime auth handshake for subscriptions
  - [x] Realtime auth token sync now refreshes missing tokens and listens to auth state changes to prevent stale inbox streams
  - [x] Realtime lead status updates for inbox list indicators
- [x] **Internationalization**
  - [x] Remove hardcoded UI strings
  - [x] Enforce EN/TR parity with automated checks

---

## Phase 4: Knowledge Base (RAG) ✅
- [x] **KB CRUD**
  - [x] Create KB entry model
  - [x] Category support
  - [x] Admin UI for KB management
  - [x] Knowledge base route loading skeletons for instant navigation
- [x] **KB Status UI**
  - [x] Show indexing status per entry (Ready / Processing / Error)
- [x] **RAG Pipeline**
- [x] Document chunking
- [x] Embedding storage
- [x] Retrieval logic
- [x] Response generation from KB
- [x] **Enterprise RAG Hardening:** Documents + chunks schema, token-budgeted context, and consistent fallback handling
- [x] **Legacy Cleanup:** Remove `knowledge_base` in favor of documents/chunks
- [x] **Contextual KB Routing:** LLM decides KB usage and rewrites follow-up queries
  - [x] Include last bot reply + last 5 user messages with timestamps
- [x] **KB Routing Heuristics:** Definition-style questions route to KB when routing is uncertain
- [x] **Chunk Overlap Alignment:** Overlap respects paragraph/sentence boundaries to avoid mid-sentence splits
- [x] **KB Sidebar Sync:** Ensure folder create/delete triggers sidebar refresh
- [x] **KB Sidebar Sync:** Refresh counts on content create/update/delete events
- [x] **KB Sidebar Navigation:** Clicking files in the sidebar opens the document detail view
- [x] **KB Sidebar Focus:** Highlight the active document in the sidebar and add spacing between sections
- [x] **KB Sidebar Realtime:** Refresh sidebar immediately on knowledge document/collection changes
- [x] **KB Async Processing:** Save/create/update return immediately; background processing updates status with polling
- [x] **KB Realtime Publication:** Enable knowledge tables in Supabase realtime for instant sidebar updates
- [x] **KB Realtime Deletes:** Enable replica identity full so delete events include org context
- [x] **Suggestions Realtime Publication:** Add offering profile suggestions to Supabase realtime publication
- [x] **KB Non-blocking UI:** Create/edit/delete return immediately while background jobs continue
- [x] **KB Sidebar Uncategorized:** Show uncategorized items (max 10) with expand and correct all-content counts
- [x] **KB Terminology:** Replace "collection" labels with "folder" in UI copy
- [x] **KB Keyword Fallback:** Use keyword search when embedding lookup fails or returns no matches
- [x] **KB Banner Styling:** Use an amber tone for pending AI suggestion banners

---

## Phase 5: AI Auto-Reply Engine ✅
- [x] **Reply Router**
  - [x] Skill → KB → Topic-guided fallback response
  - [x] Response formatting
  - [x] Error handling
- [x] **Bot Mode (Org-Level)**
  - [x] Active / Shadow / Off (Simulator excluded)
  - [x] AI Settings selector + sidebar status indicator
  - [x] Turkish copy refinements (Dinleyici label + clearer descriptions)
  - [x] Active mode copy mentions background lead extraction
  - [x] Sidebar status dot uses green/amber/red for Active/Dinleyici/Kapalı
- [x] **AI Settings:** Always-on flexible mode with a single threshold and prompt field
- [x] **AI Settings Copy:** Localized TR labels and sensitivity helper text
- [x] **AI Settings:** Configurable bot name (org-level)
- [x] **Human Escalation**
  - [x] AI Settings section: two-step flow (automatic escalation + skill handover), hot lead score slider, action cards, and locale-aware handover message
  - [x] Skill-level `Requires Human Handover` toggle with read-only message preview
  - [x] Centralized escalation policy with precedence: skill override > hot lead score
  - [x] Locale-aware handover message repair so TR UI no longer displays EN default text
  - [x] `notify_only` hot-lead behavior now keeps AI replies active based on `active_agent` state (stale assignee no longer blocks bot replies)
- [x] **Default System Guardrail Skills (MVP)**
  - [x] Human support request skill (`requires_human_handover=true`)
  - [x] Complaint / dissatisfaction skill (`requires_human_handover=true`)
  - [x] Urgent / critical request skill (`requires_human_handover=true`)
  - [x] Privacy / consent / deletion request skill (`requires_human_handover=true`)
  - [x] Dedicated localized bot messages (TR/EN) per guardrail skill
  - [x] Keep low-confidence/no-safe-answer automatic handover out of scope (KB/fallback continues)
- [x] **AI Settings Prompt:** Locale-aware prompt default repair so TR UI shows Turkish prompt instructions
- [x] **AI Settings Prompt:** Legacy EN default prompt variants also normalize to TR default in TR UI
- [x] **Inbox UI:** Show configured bot name in chat labels
- [x] **Usage & Billing:** Track monthly (UTC) + total AI token usage
- [x] **Usage & Billing:** Breakdown by summary, messages, and lead extraction
- [x] **Usage & Billing:** Include lead reasoning tokens under lead extraction totals in detailed breakdown
- [x] **Usage & Billing UI:** Show the UTC month label in the monthly card header
- [x] **Usage & Billing UI:** Place “Detayları gör” link under the UTC note
- [x] **Usage & Billing UI:** Add message volume cards (AI-generated, operator-sent, inbound customer) for monthly UTC and all-time totals
- [x] **Usage & Billing UI:** Add storage usage cards with total size plus Skills/Knowledge Base breakdown
- [x] **Usage & Billing UI:** Show message breakdown metrics on separate rows per card for faster scanning
- [x] **Settings UX:** Save buttons show a transient success state and clear dirty-state across settings pages
- [x] **Settings UX:** Two-column sections, header save actions, dirty-state enablement, and unsaved-change confirmation
- [x] **Settings UX:** Remove redundant current-value summaries above inputs
- [x] **Settings UX:** Align settings column widths and remove duplicate field labels for cleaner alignment
- [x] **Settings UX:** Refresh settings sidebar icons with bubbles/circle-user icons
- [x] **Settings UX:** Settings page headers now match sidebar item labels (AI + General)
- [x] **AI Settings UI:** Compact bot mode/escalation selection cards (smaller title, radio, and padding)
- [x] **AI Settings UI:** Downsize selection card title text to section-title scale and reduce description font one step
- [x] **AI Settings UI:** Align sensitivity slider with hot lead threshold styling (blue `>=` right-side highlight)
- [x] **AI Settings Copy:** Rename handover notice label from “Asistan Sözü” to “Bot mesajı” (TR/EN)
- [x] **AI Settings Matching:** Apply inclusive threshold semantics (`>=`) for Skill + KB similarity checks
- [x] **Unsaved Changes Modal:** Make secondary buttons hug content, save CTA single-line, and discard soft-danger
- [x] **Profile/Organization Settings:** Basic pages for user and org details
- [x] **Auth UX Refresh**
  - [x] Sign In redesign (settings-aligned UI)
  - [x] Sign Up redesign (settings-aligned UI)
  - [x] Password Recovery flow (forgot + reset)
  - [x] Profile security: password reset CTA + email immutable note
- [x] **Human Takeover**
  - [x] Detect business reply (or Inbox claim)
  - [x] Pause bot automatically (Active Agent State)
  - [x] "Resume Bot" via "Leave Conversation"

---

## Phase 6: Lead Extraction & Qualification
- [x] **Lead Model**
  - [x] Create lead schema
  - [x] Link to conversations
- [x] **Offering Profile (Catalog Optional)**
  - [x] Generate profile summary from Skills/KB
  - [x] Admin review + edit flow
  - [x] Manual profile + AI suggestions toggle (append-only)
  - [x] AI suggestions review tabs (pending/approved/rejected) with accept/reject actions
  - [x] Approved-only AI suggestions used in lead extraction
  - [x] Locale-aware AI suggestions + localized timestamps
  - [x] Pending suggestion indicators in settings (sidebar + section)
  - [x] AI Suggestions accordion header keeps a visible pending indicator even when collapsed
  - [x] AI Suggestions accordion header removes redundant right-side pending count chip
  - [x] AI suggestions panel toggles with manual generate when empty
  - [x] Main sidebar settings indicator reflects pending AI suggestions
  - [x] AI suggestions default enabled while respecting opt-out (no generation when off)
  - [x] Suggestion generation follows active UI locale (single-language)
  - [x] AI suggestion status can be toggled between approved/rejected
  - [x] Turkish UI terminology uses "Kişi" instead of "Lead"
  - [x] Suggestion tabs can be viewed even when empty
  - [x] Pending indicators refresh after review actions
  - [x] Hybrid AI suggestions (intro + up to 5 bullets) with update proposals for conflicting content
  - [x] Suggestion generation uses manual summary plus approved/rejected history for context
  - [x] Knowledge Base banner surfaces pending AI suggestions with quick link to Organization settings
  - [x] Knowledge Base “Review/İncele” link deep-links to Organization settings and auto-expands the AI Suggestions accordion
  - [x] Organization settings now expose separate AI toggles for Offering Profile and Required Fields
  - [x] Offering Profile AI disabled mode shows only manual textarea
  - [x] Offering Profile AI enabled mode shows AI suggestions workflow
  - [x] AI Suggestions accordion shows pending indicators both on the header and inside the accordion tabs/content
  - [x] Required Fields has its own AI suggestions toggle and remains a dedicated section
  - [x] Skill/KB updates auto-generate Required Fields AI chips and dedupe against existing manual/AI fields
  - [x] KB/fallback replies include a smart required-fields follow-up question (Telegram + Simulator) when key intake details are missing (skill replies stay unchanged) and use the last 3 assistant replies to avoid repeated greetings
  - [x] Telegram + Simulator final KB/RAG/fallback replies now use recent multi-turn history and known lead snapshot facts for smoother continuity (less repeated greetings and repeated question loops)
  - [x] Approved suggestions tab supports a persistent custom profile-note textarea (editable/removable, not converted into suggestion cards)
- [x] AI suggestions enforce 3-5 bullet hybrid format with retry on sparse output
- [x] AI suggestions archive (archived tab with archive action; regenerate when no pending)
  - [x] Knowledge Base banner copy updated to “Hizmet profili önerileri hazır” and spaced from header
- [x] **Service Catalog (Hybrid)**
  - [x] Auto-propose services from Skills/KB
  - [x] Admin approval workflow
- [x] **Non-Business Classification**
  - [x] Detect personal/non-business chats
  - [x] Skip lead extraction and scoring when flagged
- [x] **AI Extraction**
  - [x] Async extraction on each new customer message
  - [x] Extract: service, date, location, budget
  - [x] Intent analysis
  - [x] Risk signal detection
- [x] **Extraction Reliability**
  - [x] Parse fenced or noisy JSON outputs safely
  - [x] Required Fields parser now accepts fenced/noisy JSON responses from AI
  - [x] Label customer vs assistant messages and respect customer negations
  - [x] Use last 5 customer messages and LLM-provided score/status
  - [x] Ensure latest message is included even with async writes
  - [x] Enforce locale-aware output language (TR/EN) for lead summary and extracted detail fields
  - [x] Include manual profile note with approved AI suggestions in extraction context
  - [x] Preserve previously extracted lead details when later turns omit fields (merge-on-update instead of destructive overwrite)
  - [x] Keep lead summary aligned to the current extraction window (avoid stale summary carry-over when omitted)
- [x] **Lead Scoring**
  - [x] Implement 0-10 scoring algorithm
  - [x] Auto-generate AI summary
  - [x] Keyword-based intent fallback + score reasoning modal
- [x] **Lead Status**
  - [x] Hot / Warm / Cold classification
  - [x] Status update triggers
- [x] **Inbox Lead Details**
  - [x] Read-only lead snapshot in conversation details
  - [x] Lead header shows "Updating" indicator during extraction
  - [x] Keep "Updated" timestamp visible while updating
  - [x] Show collected "Required Fields" values in lead details using Organization > Required Fields definitions
  - [x] Present collected required fields in an "Important info" card section with plain label-value rows inside
  - [x] Required-info resolver supports manual override precedence for future lead-edit workflows
  - [ ] Manual overwrite UI for "Important info" values in Inbox (per field edit + save source tracking)
- [x] **Lead List UX**
  - [x] Mobile leads list now uses compact card rows with reduced spacing while preserving the existing desktop table layout
- [x] **Operator Takeover Control**
  - [x] Toggle to keep lead extraction running during operator takeover (AI Settings)

---

## Phase 7: Admin Panel
- [ ] **Dashboard**
  - [ ] Overview stats
  - [ ] Recent leads
- [ ] **Lead List**
  - [ ] Filterable/sortable table
  - [ ] Score, summary, status display
  - [ ] "Open in WhatsApp" button
- [x] **Skills Management**
  - [x] CRUD UI
  - [x] Search positioned above the unified skills list with always-visible add CTA
  - [x] Removed Core/Custom tab split; skills are managed in one list
  - [x] Skills empty-state icon now matches the sidebar Skills icon
  - [x] Backfill missing skill embeddings automatically when seeded skills exist without vectors
  - [ ] Test playground
- [x] **Knowledge Base UI**
  - [x] CRUD with categories
  - [x] Rich text editor
- [x] **Channels**
  - [x] Telegram connection status + debug
  - [ ] WhatsApp connection status (placeholder only)
  - [ ] Test message sandbox

---

## Phase 8: Platform Admin Features
- [x] System admin dashboard + organizations/users lists
- [x] Organization switcher
  - [x] Searchable org switcher in main sidebar (system admin)
  - [x] Persist active organization context via server-side cookie
  - [x] Apply switched org context across Inbox/Leads/Skills/Knowledge/Simulator/Settings
  - [x] Enforce read-only impersonation mode across tenant modules
  - [x] Show clear "viewing as organization" state and reset action
- [ ] Cross-org debugging tools
  - [x] Admin-only org details page (`/admin/organizations/[id]`)
  - [x] Read org-level snapshots: usage, token usage, skills, knowledge stats (read-only table)
  - [x] Include profile-level details via user details view (multi-profile-ready membership listing)
  - [ ] Audit trail for admin-driven plan/quota updates
- [ ] Usage analytics per org
  - [x] Admin organization table columns: total usage, total token usage, total skill count, knowledge base count
  - [x] Add premium/trial status visibility and plan cycle/status visibility (placeholder: not integrated)
  - [x] Add search + pagination for admin organization and user lists
  - [x] Compute admin dashboard stat cards via DB-side aggregate RPC (avoid full org summary scan on dashboard load)
  - [x] Move organization list search/pagination to DB-level count + range queries (no in-memory full-list slicing)
  - [x] Batch organization metric aggregation to avoid per-organization N+1 read fan-out
  - [x] Load organization detail profile layer with targeted org/member/profile queries (no full-table scans)
  - [x] Avoid heavy org-summary aggregation when building admin user lists (use lightweight organization lookup only)
  - [x] Load admin user detail via targeted profile + memberships + related-org snapshots (no full user/org scan)
- [x] Billing/Quota Visibility (Admin)
  - [x] Show premium/trial periods (read-only placeholders until billing integration)
  - [x] Show token/message usage values (read-only)
  - [x] Defer edit controls until billing policy is finalized

---

## Phase 9: Testing & QA
- [x] Address strict TypeScript build errors (router history typing + indexed access guards)
- [ ] Unit tests for core logic
- [ ] Integration tests for WhatsApp flow
- [ ] E2E tests for admin panel
- [ ] Load testing for message handling

---

## Phase 10: Pilot Launch
- [ ] Onboard 5 pilot customers
- [ ] Monitor success metrics
- [ ] Collect feedback
- [ ] Iterate based on learnings

---

## Post-MVP (Future)
- [ ] Calendar / booking integration
- [ ] Flow builder
- [ ] Auto follow-up sequences
- [ ] Vertical preset marketplace
