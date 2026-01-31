# WhatsApp AI Lead Qualifier — Roadmap

> **Last Updated:** 2026-01-31  
> Mark items with `[x]` when completed.

---

## Phase 0: Project Setup ✅
- [x] Initialize project repository
- [x] Set up development environment
- [x] Choose and configure tech stack
- [x] Set up CI/CD pipeline (Vercel auto-deploys)
- [x] Configure database (Supabase client ready)
- [x] Set up environment variables

---

## Phase 1: Core Infrastructure
- [ ] **Multi-Tenant Foundation**
  - [ ] Create organization model
  - [ ] Implement `organization_id` isolation
  - [ ] Set up RLS policies
- [ ] **Auth & User Management**
  - [ ] Supabase Auth integration
  - [ ] User-organization relationship
  - [ ] Role-based access (admin, member)

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

## Phase 3: Skill System
- [ ] **Skill CRUD**
  - [ ] Create skill model
  - [ ] Admin UI for skill management
  - [ ] Enable/disable toggle
- [ ] **Skill Matching Engine**
  - [ ] Embedding generation for triggers
  - [ ] Similarity search (top-5)
  - [ ] LLM re-ranking
  - [ ] Confidence threshold logic
- [ ] **Skill Testing**
  - [ ] "Test Skill" playground in admin

---

## Phase 4: Knowledge Base (RAG)
- [ ] **KB CRUD**
  - [ ] Create KB entry model
  - [ ] Category support
  - [ ] Admin UI for KB management
- [ ] **RAG Pipeline**
  - [ ] Document chunking
  - [ ] Embedding storage
  - [ ] Retrieval logic
  - [ ] Response generation from KB

---

## Phase 5: AI Auto-Reply Engine
- [ ] **Reply Router**
  - [ ] Skill → KB → Human fallback chain
  - [ ] Response formatting
  - [ ] Error handling
- [ ] **Human Takeover**
  - [ ] Detect business reply
  - [ ] Pause bot automatically
  - [ ] "Resume Bot" in admin panel

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
- [ ] Inbox UI
- [ ] Calendar / booking integration
- [ ] Flow builder
- [ ] Auto follow-up sequences
- [ ] Vertical preset marketplace
