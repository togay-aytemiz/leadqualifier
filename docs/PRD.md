# WhatsApp AI Lead Qualifier — PRD (MVP)

> **Last Updated:** 2026-02-03  
> **Status:** In Development

---

## 1. Problem & Goal

### Problem
Turkish SMBs (beauty centers, photographers, clinics) struggle with WhatsApp:
- Too many repetitive questions
- Time wasted on unqualified leads
- No systematic message tracking

### Goal
Automate WhatsApp message handling:
- **Auto-respond** using Skills & Knowledge Base
- **Qualify leads** with AI-powered extraction & scoring
- **Surface only serious leads** for human follow-up

---

## 2. Target Users

| Segment | Profile |
|---------|---------|
| Beauty centers | Solo owner or small team |
| Photographers | Newborn / maternity specialists |
| Future | Dental clinics, real estate offices |

**Common traits:** Non-technical, 1-3 person team, WhatsApp-heavy operations.

---

## 3. MVP Scope

### ✅ In Scope
| Feature | Description |
|---------|-------------|
| WhatsApp Integration | Single number per org |
| AI Auto-Reply | Skill-based + KB fallback |
| User-Generated Skills | Custom intent → response mappings |
| Knowledge Base (RAG) | FAQ, packages, policies |
| Lead Extraction | AI summary + score (0-10) |
| Human Takeover | Bot pauses when business replies |
| Multi-Tenant | Organization-based isolation |
| Multi-Tenant | Organization-based isolation |
| Admin Panel | Leads, Skills, KB, Channels management |
| **Inbox UI** | **Real-time chat, history, manual reply, delete, assignee system** |

### ❌ Out of Scope (Intentional)
- Calendar integration
- Auto follow-up sequences
- Auto follow-up sequences
- Campaigns / broadcasts
- Advanced flow builder

---

## 4. Core Features

### 4.1 WhatsApp Auto-Reply Engine

**Flow:**
```
Customer Message → Skill Match? → Yes → Skill Response
                              → No  → KB Match? → Yes → RAG Response
                                               → No  → "Let me connect you with our team"
```

**Rules:**
- AI responds ONLY from Skill/KB content
- No hallucination — unknown = human handoff

---

### 4.2 Skill System (Core Differentiator)

**Definition:** One skill = one intent = one response/action

**Skill Schema:**
| Field | Description |
|-------|-------------|
| `title` | Skill name |
| `trigger_examples` | Min 3, recommended 5 example phrases |
| `response_text` | Template response |
| `enabled` | Toggle on/off |

**Routing Logic:**
1. User message → embedding
2. Compare with skill embeddings (top-5 similarity)
3. LLM re-rank → `skill_id` + `confidence` (0-1)
4. If `confidence < threshold` → fallback to KB or human

---

### 4.3 Knowledge Base (RAG)

**Content Types:**
- FAQ entries
- Package/pricing info
- Policies (delivery, cancellation, payment)

**Behavior:**
- Triggered when no skill matches
- AI generates response strictly from KB
- If KB has no answer → human handoff
 - Documents are chunked with overlap and embedded per chunk
 - Retrieval is chunk-level with context budgets to avoid long prompts

---

### 4.4 Lead Extraction & Qualification

**AI extracts per conversation:**
| Field | Example |
|-------|---------|
| Service Type | "Newborn photoshoot" |
| Desired Date | "Mid-October" |
| Location | "Istanbul, Kadıköy" |
| Budget Signals | "Price-sensitive" |
| Intent Level | "High / Medium / Low" |
| Risk Signals | "Indecisive language" |

**Lead Score (0-10):**
| Factor | Impact |
|--------|--------|
| Clear date | +2 |
| Clear service | +2 |
| Budget alignment | +2 |
| Decisive language | +2 |
| Urgency | +2 |
| Indecisive language | -2 |
| Far-future date | -1 |

**AI Summary (auto-generated):**
> "User wants newborn shoot. Considering mid-October, budget-conscious. Manual follow-up recommended."

---

### 4.5 Human Takeover

**Trigger:** Business owner sends ANY message from their WhatsApp OR claims via Inbox.
 **Behavior:**
- **Explicit State:** `active_agent` switches to 'operator'.
- **Assignee Lock:** Operator is assigned (`assignee_id`), strictly blocking AI.
- **AI Silence:** Bot ignores all incoming messages while operator is active.
- **Resume:** Operator (or Admin) must explicitly "Leave Conversation" to resume Bot.

---

## 5. Admin Panel

### 5.1 Lead List
- Name, phone, status (Hot/Warm/Cold)
- Score, AI Summary, last message time
- "Open in WhatsApp" button

### 5.2 Skills Management
- CRUD operations
- Enable/disable toggle
- "Test Skill" playground

### 5.3 Knowledge Base
- CRUD with categories
- Rich text editor
 - Show indexing status (Ready / Processing / Error)

### 5.4 Channels
- WhatsApp number + connection status
- Provider badge
- Test message (sandbox)

---

## 6. Multi-Tenant Architecture

| Concept | Implementation |
|---------|----------------|
| Organization | 1 customer = 1 org |
| Data Isolation | All tables have `organization_id` |
| Platform Admin | Org switcher for support/debug |

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| Daily messages handled by bot | Track growth |
| Lead → Hot conversion | > 20% |
| Human takeover rate | < 30% |
| FAQ coverage by bot | > 70% |
| 7-day lead follow-up rate | Track |

---

## 8. MVP Exit Criteria

MVP is successful when:
- [ ] 5 pilot customers actively using
- [ ] ≥50% of daily WhatsApp messages handled by bot
- [ ] Users report "time saved"

---

## 9. Future Roadmap (Post-MVP)

| Feature | Priority |
|---------|----------|
| Feature | Priority |
|---------|----------|
| Calendar/Booking | High |
| Flow Builder | Medium |
| Auto Follow-up | Medium |
| Vertical Preset Marketplace | Low |

---

## Appendix: Tech Decisions ✅

> Finalized: 2026-01-31

- **RAG Architecture:** Store raw knowledge documents and embedded chunks separately (`knowledge_documents` + `knowledge_chunks`) to support large content and future file ingestion.
- **Chunking Strategy:** ~800 token chunks with overlap to preserve context, with token-budgeted prompt assembly.
- **Font Strategy:** Use system fonts in the app shell to avoid build-time Google Fonts fetches in CI.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend | **Next.js (App Router)** | Best DX for React, pairs well with Supabase |
| Backend | **Supabase Edge Functions** | Serverless, TypeScript, integrated with DB |
| Database | **Supabase (PostgreSQL + pgvector)** | Multi-tenant RLS, vector search built-in |
| Auth | **Supabase Auth (Email/Password)** | Simple for MVP, can add OAuth later |
| WhatsApp | **Meta Cloud API** | Free tier (1000 conv/mo), direct integration |
| AI/LLM | **OpenAI GPT-4o-mini** | Cost-effective, good Turkish support |
| Embeddings | **OpenAI + Supabase pgvector** | All-in-one, no extra services |
| Realtime | **Supabase Realtime** | Live inbox updates (Postgres changes) |
| Hosting | **Vercel** | Optimal for Next.js, generous free tier |
| i18n | **TR + EN from day one** | Avoid retrofit pain |
| Onboarding | **Concierge (MVP)** | Manual WhatsApp setup for 5 pilots |
| Inbox Updates | **Atomic send RPC + realtime fallback** | Prevents unassigned state and keeps bot/user messages visible |
| Dev Workflow | **Always provide commit message** | Ensures consistent handoff across iterations |
