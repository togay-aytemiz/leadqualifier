# WhatsApp AI Lead Qualifier — Roadmap

> **Last Updated:** 2026-02-03  
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

## Phase 2: WhatsApp Integration
- [ ] **Provider Setup**
  - [ ] Choose provider (Twilio / 360dialog / Meta Cloud API)
  - [ ] Webhook endpoint for incoming messages
  - [ ] Outgoing message API
- [ ] **Message Handling**
  - [ ] Store incoming messages
  - [ ] Store outgoing messages
  - [ ] Conversation threading

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
- [x] **Skill Testing**
  - [x] "Test Skill" playground in admin

## Phase 3.5: WhatsApp Simulator (In Progress) ✅
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
  - [x] Real-time updates (via polling/subscriptions)
- [x] **Refactoring**
  - [x] Migrate to Lucide Icons
  - [x] Primitive component cleanup
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

## Phase 5: AI Auto-Reply Engine
- [x] **Reply Router**
  - [x] Skill → KB → Human fallback chain
  - [x] Response formatting
  - [x] Error handling
- [x] **AI Settings:** Always-on flexible mode with a single threshold and prompt field
- [x] **Settings UX:** Two-column sections, header save actions, dirty-state enablement, and unsaved-change confirmation
- [x] **Profile/Organization Settings:** Basic pages for user and org details
- [x] **Human Takeover**
  - [x] Detect business reply (or Inbox claim)
  - [x] Pause bot automatically (Active Agent State)
  - [x] "Resume Bot" via "Leave Conversation"

---

## Phase 6: Lead Extraction & Qualification
- [ ] **Lead Model**
  - [ ] Create lead schema
  - [ ] Link to conversations
- [ ] **AI Extraction**
  - [ ] Extract: service, date, location, budget
  - [ ] Intent analysis
  - [ ] Risk signal detection
- [ ] **Lead Scoring**
  - [ ] Implement 0-10 scoring algorithm
  - [ ] Auto-generate AI summary
- [ ] **Lead Status**
  - [ ] Hot / Warm / Cold classification
  - [ ] Status update triggers

---

## Phase 7: Admin Panel
- [ ] **Dashboard**
  - [ ] Overview stats
  - [ ] Recent leads
- [ ] **Lead List**
  - [ ] Filterable/sortable table
  - [ ] Score, summary, status display
  - [ ] "Open in WhatsApp" button
- [ ] **Skills Management**
  - [ ] CRUD UI
  - [ ] Test playground
- [ ] **Knowledge Base UI**
  - [ ] CRUD with categories
  - [ ] Rich text editor
- [ ] **Channels**
  - [ ] WhatsApp connection status
  - [ ] Test message sandbox

---

## Phase 8: Platform Admin Features
- [ ] Organization switcher
- [ ] Cross-org debugging tools
- [ ] Usage analytics per org

---

## Phase 9: Testing & QA
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
