# WhatsApp AI Lead Qualifier — Roadmap

> **Last Updated:** 2026-02-05  
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
  - [x] Unread indicators in sidebar + conversation list
  - [x] Real-time updates (via polling/subscriptions)
  - [x] On-demand conversation summary (button + inline panel)
- [x] **Refactoring**
  - [x] Migrate to Lucide Icons
  - [x] Primitive component cleanup
- [x] **Navigation Shell**
  - [x] Crisp-inspired main sidebar with collapse toggle and persisted state
  - [x] Refined collapsed icon layout and toggle placement (Netlify-style)
  - [x] Centered collapsed logo alignment
  - [x] Eyebrow section labels for grouped navigation
  - [x] Increased spacing between header and first sidebar section
- [x] **Inbox Reliability**
  - [x] Atomic operator assignment on manual send
  - [x] Message refresh fallback for bot/contact updates
  - [x] Realtime auth handshake for subscriptions
- [x] **Internationalization**
  - [x] Remove hardcoded UI strings
  - [x] Enforce EN/TR parity with automated checks

---

## Phase 4: Knowledge Base (RAG) ✅
- [x] **KB CRUD**
  - [x] Create KB entry model
  - [x] Category support
  - [x] Admin UI for KB management
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
- [x] **KB Sidebar Uncategorized:** Show uncategorized items (max 10) with expand and correct all-content counts
- [x] **KB Terminology:** Replace "collection" labels with "folder" in UI copy
- [x] **KB Keyword Fallback:** Use keyword search when embedding lookup fails or returns no matches

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
- [x] **Inbox UI:** Show configured bot name in chat labels
- [x] **Usage & Billing:** Track monthly (UTC) + total AI token usage
- [x] **Usage & Billing:** Breakdown by summary, messages, and lead extraction
- [x] **Usage & Billing UI:** Show the UTC month label in the monthly card header
- [x] **Usage & Billing UI:** Place “Detayları gör” link under the UTC note
- [x] **Settings UX:** Save buttons show a transient success state and clear dirty-state across settings pages
- [x] **Settings UX:** Two-column sections, header save actions, dirty-state enablement, and unsaved-change confirmation
- [x] **Settings UX:** Remove redundant current-value summaries above inputs
- [x] **Settings UX:** Align settings column widths and remove duplicate field labels for cleaner alignment
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
  - [x] AI suggestions panel toggles with manual generate when empty
  - [x] Main sidebar settings indicator reflects pending AI suggestions
  - [x] AI suggestions default enabled while respecting opt-out (no generation when off)
  - [x] Suggestion generation follows active UI locale (single-language)
  - [x] AI suggestion status can be toggled between approved/rejected
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
- [x] **Lead Scoring**
  - [x] Implement 0-10 scoring algorithm
  - [x] Auto-generate AI summary
- [x] **Lead Status**
  - [x] Hot / Warm / Cold classification
  - [x] Status update triggers
- [x] **Inbox Lead Details**
  - [x] Read-only lead snapshot in conversation details

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
  - [x] Search positioned above tabs with always-visible add CTA
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
- [ ] Organization switcher
- [ ] Cross-org debugging tools
- [ ] Usage analytics per org

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
