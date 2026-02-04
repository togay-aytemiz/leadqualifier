# WhatsApp AI Lead Qualifier — PRD (MVP)

> **Last Updated:** 2026-02-04  
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

### ✅ In Scope (Target MVP)
| Feature | Description | Status (2026-02-04) |
|---------|-------------|--------------------|
| WhatsApp Integration | Single number per org | Planned (WhatsApp UI placeholder only; Telegram sandbox channel implemented) |
| AI Auto-Reply | Skill-based + KB fallback | Implemented for Telegram + Simulator |
| User-Generated Skills | Custom intent → response mappings | Implemented |
| Knowledge Base (RAG) | FAQ, packages, policies | Implemented |
| Lead Extraction | AI summary + score (0-10) | Not implemented |
| Human Takeover | Bot pauses when business replies | Implemented (active_agent + assignee lock) |
| Multi-Tenant | Organization-based isolation | Implemented |
| Admin Panel | Leads, Skills, KB, Channels management | Partial (Skills/KB/Inbox/Settings/Channels done; Leads/Dashboard pending) |
| **Inbox UI** | **Real-time chat, history, manual reply, delete, assignee system, unread indicators, on-demand summary** | Implemented |

### ❌ Out of Scope (Intentional)
- Calendar integration
- Auto follow-up sequences
- Campaigns / broadcasts
- Advanced flow builder

---

## 4. Core Features

### 4.1 Messaging Auto-Reply Engine (Telegram now, WhatsApp planned)

**Flow:**
```
Customer Message → Skill Match? → Yes → Skill Response
                              → No  → KB Match? → Yes → RAG Response
                                               → No  → Fallback Response (topics + clarifying question)
```

**Rules:**
- Skill/KB answers are grounded in stored content; fallback uses configured prompt + topic list
- No hallucination — if unsure, ask a single clarifying question (or suggest topics)
- Bot mode (org-level): Active (replies), Shadow (lead extraction only), Off (no AI processing). Simulator is unaffected.
- Simulator includes token usage visibility for debugging
 - Token usage is shown per message and as a conversation total in the simulator
 - If no skill/KB match, bot suggests available topics using existing skills/KB titles
 - Org-level AI settings control strict/flexible modes, a single sensitivity threshold, and prompt-driven fallback behavior

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
4. If `confidence < threshold` → fallback to KB or topic-guided fallback response

---

### 4.3 Knowledge Base (RAG)

**Content Types:**
- FAQ entries
- Package/pricing info
- Policies (delivery, cancellation, payment)

**Behavior:**
- Triggered when no skill matches
- AI generates response strictly from KB
- If KB has no answer → topic-guided fallback response
 - Documents are chunked with overlap and embedded per chunk
 - Retrieval is chunk-level with context budgets to avoid long prompts
 - Follow-up questions are rewritten into standalone KB queries via LLM routing
 - LLM routing receives the latest bot reply plus the last 5 user messages with timestamps
 - Router uses definition-style question heuristics to avoid missing KB lookups
 - Chunk overlap aligns to paragraph/sentence boundaries to preserve context
 - Keyword fallback is used when embedding search fails or returns no matches

---

### 4.4 Lead Extraction & Qualification (Planned)

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

### 5.1 Lead List (Planned)
- Name, phone, status (Hot/Warm/Cold)
- Score, AI Summary, last message time
- "Open in WhatsApp" button

### 5.2 Skills Management (Implemented; Playground Planned)
- CRUD operations
- Enable/disable toggle
- No per-skill playground yet (use Simulator for end-to-end testing)

### 5.3 Knowledge Base (Implemented)
- CRUD with folders
- Rich text editor
 - Show indexing status (Ready / Processing / Error)
 - Sidebar shows uncategorized items (max 10 with expand) and accurate all-content counts

### 5.4 Channels (Telegram Implemented, WhatsApp Planned)
- Telegram bot connection + status
- WhatsApp placeholder in UI (no provider integration yet)
- Debug webhook info for Telegram

### 5.5 AI Settings (Implemented)
- Always-on Flexible mode (no mode selection)
- Single sensitivity threshold (applies to Skill + KB)
- Single prompt field (used as the base prompt for fallback responses)
- Configurable bot name (org-level) used in AI responses, summaries, and inbox labels
- Bot mode selector (Active / Shadow / Off) applies org-wide and excludes Simulator
- TR copy uses "Yetenek" terminology and "Yapay Zeka Talimatı" label for clarity

### 5.6 Profile & Organization Settings
- Profile: name and email visibility (email is read-only)
- Profile security: password recovery via email reset link (Forgot + Reset)
- Organization: company name and future org-level defaults

---

## 6. Multi-Tenant Architecture

| Concept | Implementation |
|---------|----------------|
| Organization | 1 customer = 1 org |
| Data Isolation | All tables have `organization_id` |
| Platform Admin | System admin dashboard + org/user lists (org switcher not yet implemented) |

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
- [ ] ≥50% of daily inbound messages handled by bot
- [ ] Users report "time saved"

---

## 9. Future Roadmap (Post-MVP)

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
- **Font Strategy (Initial):** Use system fonts in the app shell to avoid build-time Google Fonts fetches in CI.
- **Font Update:** Adopt Plus Jakarta Sans via CSS `@import` for the main sidebar’s crisp visual language. This supersedes the system-font-only decision since we are not using Next.js font fetching in CI and accept the lightweight web font load.
- **Sidebar UI Refinement:** Collapsed-state icon pills are centered and the expand/collapse toggle sits alongside the app name, using arrow-from-line icons for clarity.
- **Sidebar UI Refinement:** Collapsed logo alignment is centered to match the navigation icon stack.
- **Sidebar Navigation:** Group primary navigation under eyebrow labels (Workspace, AI Tools, Other) for faster scanning.
- **Sidebar Spacing:** Add top padding between the header block and first navigation section for visual separation.
- **Legacy Cleanup:** Remove `knowledge_base` (legacy) and use documents/chunks as the single source of truth.
- **KB Routing:** Use LLM to decide whether to query KB and rewrite follow-up questions into standalone queries.
- **KB Routing Heuristics:** If routing is uncertain, definition-style questions are treated as KB queries.
- **Chunk Overlap Alignment:** Overlap prefers paragraph/sentence boundaries and drops overlap when it would exceed max tokens.
- **i18n Enforcement:** Automated checks for hardcoded UI strings and EN/TR key parity wired into lint.
- **KB Sidebar Sync:** Dispatch a client-side `knowledge-updated` event on folder create/delete to keep the sidebar in sync without full remounts.
- **AI Settings Simplification:** Always-on flexible mode with a single match threshold (Skill + KB) and a single prompt field for fallback responses.
- **Bot Name:** Store an org-level `bot_name` in AI settings and inject it into AI prompts, summaries, and inbox labels.
- **Fallback Prompt Source:** Use the UI-configured fallback prompt directly (no hardcoded system append).
- **Inbox Composer:** Show an AI-assistant-active banner with a takeover prompt while keeping manual reply enabled.
- **Inbox Details:** Use consistent contact initials between list avatars and details panel.
- **Inbox Summary:** Generate summaries on-demand only (no background refresh or cache), show a single-paragraph summary in an accordion, and only reveal refresh after the summary finishes while showing a tooltip when insufficient messages.
- **Settings UX:** Use two-column sections with header save actions, dirty-state enablement, and unsaved-change confirmation on navigation.
- **Settings Clarity:** Remove redundant "current value" summaries above form inputs and selection controls.
- **Unsaved Changes Modal:** Secondary actions hug content, discard is soft-danger, and primary save CTA stays single-line.
- **Password Recovery:** Use Supabase reset email with locale-aware redirect to `/{locale}/reset-password` and a 120-second resend cooldown.
- **Telegram Sandbox Channel:** Use Telegram (bot + webhook) as the live channel while WhatsApp integration is pending; channels table supports both `telegram` and `whatsapp`.
- **Type Safety (Build):** Align KB router history role types and guard strict array indexing to keep TypeScript builds green.
- **Skills UI Layout:** Place skills search above tabs and keep the add CTA visible in the list header.

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
