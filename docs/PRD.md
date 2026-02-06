# WhatsApp AI Lead Qualifier — PRD (MVP)

> **Last Updated:** 2026-02-06  
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
| Lead Extraction | AI summary + score (0-10) | Implemented (Telegram only; Lead UI pending) |
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
| Decisive booking intent | +3 |
| Urgency | +2 |
| Indecisive language | -2 |
| Far-future date | -1 |

**AI Summary (auto-generated):**
> "User wants newborn shoot. Considering mid-October, budget-conscious. Manual follow-up recommended."

**Rules:**
- Extraction runs asynchronously on every new customer message (conversation snapshot update).
- Intent signals are extracted by the LLM (no deterministic keyword fallback while LLM scoring is active).
- Inbox can request an on-demand score reasoning summary grounded only in extracted signals and scoring inputs.
- Inbox lead header shows an "Updating" indicator while extraction is in progress.
- "Updated" timestamp remains visible while the updating indicator is shown.
- `service_type` must match an approved service in the org catalog (derived from Skills/KB + admin approval) when a catalog is enabled.
- If no catalog is enabled, use the org's Offering Profile (service scope summary) to infer fit/intent; `service_type` may remain empty.
- Service type inference prioritizes customer messages, ignores assistant-only suggestions, and respects explicit negations.
- Lead score and status are produced directly by the LLM using the latest 5 customer messages only (assistant messages excluded).
- The most recent customer message is always injected into the extraction prompt to avoid replication delays.
- Offering Profile consists of manual text plus AI suggestions generated from Skills/KB in the org UI language; suggestions use a hybrid format (short intro + 3-5 bullets), start pending, require admin approval, may propose updates to existing approved suggestions, and only approved suggestions are used for extraction (manual text is never overwritten). Suggestion generation is context-aware (manual summary + approved + rejected suggestions) and retries formatting when output is too sparse. Generation always follows the active UI locale (no dual-language generation). Rejected suggestions can be archived for audit (excluded from AI context), and users can regenerate suggestions whenever there are no pending items.
- Lead extraction context includes both approved AI suggestions and the persistent manual profile note from Organization Settings.
- Organization Settings now uses separate AI toggles per section:
  - Offering Profile: AI off shows manual textarea, AI on shows suggestions workflow.
  - Required Fields: AI toggle controls AI-tagged required-field suggestions independently.
  - KB “Review/İncele” CTA deep-links into Organization Settings and auto-expands the Offering Profile AI Suggestions accordion.
  - Pending suggestion visibility is shown both on the accordion header and inside the accordion content/tabs.
  - Even when the accordion is collapsed, the header keeps a clear pending indicator so users can find the review queue quickly.
  - Approved suggestions tab supports a persistent custom profile note (editable/removable) that is stored separately from suggestion cards.
- Required Fields AI chips are regenerated when Skill/KB content updates, with normalization and dedupe against existing manual/AI chips (LLM receives current fields and proposes only missing ones).
- KB/fallback replies include one smart follow-up question when required intake fields are still missing from recent customer messages.
- Skill replies remain deterministic; required-fields follow-up prompting currently applies to KB/fallback in Telegram and Simulator.
- KB/fallback prompting also includes the last 3 assistant replies to reduce repeated greetings/openings in consecutive bot turns.
- Final KB/RAG/fallback generation now receives recent multi-turn user+assistant history and known lead snapshot facts (when available) so replies continue naturally, avoid repetitive greetings, and reduce repeated question loops.
- Lead extraction now stores collected required-intake values as `extracted_fields.required_intake_collected` when customer messages clearly provide them.
- Lead extraction applies merge-on-update persistence: if later turns omit previously extracted business details, existing `service_type`, summary, and collected required fields are preserved unless explicitly updated.
- Inbox lead details now show collected required fields in an "Important info" card section based on Organization Settings > Required Fields, rendered as plain label-value rows.
- Required-info resolution supports manual override precedence (`extracted_fields.required_intake_overrides`) for future editable lead workflows.
- Manual overwrite UI for "Important info" is intentionally deferred; planned behavior is per-field edit in Inbox with source tracking (AI vs manual) and filter-ready structured persistence.
- Non-business conversations are excluded from lead scoring and marked as ignored.

---

### 4.5 Human Takeover

**Trigger:** Business owner sends ANY message from their WhatsApp OR claims via Inbox.
 **Behavior:**
- **Explicit State:** `active_agent` switches to 'operator'.
- **Assignee Lock:** Operator is assigned (`assignee_id`), strictly blocking AI.
- **AI Silence:** Bot ignores all incoming messages while operator is active.
- **Resume:** Operator (or Admin) must explicitly "Leave Conversation" to resume Bot.
- **Optional Extraction:** Lead extraction can remain active during operator takeover if enabled in AI Settings.

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
- TR copy labels Shadow mode as "Dinleyici" for clarity
- TR copy for Active mode highlights background lead extraction
- Sidebar status dots map to green/amber/red for Active/Dinleyici/Kapalı

### 5.6 Profile & Organization Settings
- Profile: name and email visibility (email is read-only)
- Profile security: password recovery via email reset link (Forgot + Reset)
- Organization: company name and future org-level defaults
- Organization AI behavior is section-based:
  - Offering Profile has its own AI toggle for manual vs suggestions workflow.
  - Required Fields has its own AI toggle and keeps manual + AI chips together.

### 5.7 Usage & Billing (Implemented)
- Track org-level AI token usage (monthly UTC + total)
- Includes production AI paths: router, RAG, fallback, summaries, lead extraction, and lead reasoning
- Report usage breakdown by summary, messages (router/RAG/fallback), and lead extraction (including lead reasoning)
- Monthly usage card surfaces the UTC month label (e.g., February 2026)
- Usage details link appears under the UTC note in the Usage & Billing section
- Every new token-consuming feature must log usage events

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
- **Sidebar Icons:** Use per-item active/passive icon variants (react-icons) to differentiate selected states.
- **Legacy Cleanup:** Remove `knowledge_base` (legacy) and use documents/chunks as the single source of truth.
- **KB Routing:** Use LLM to decide whether to query KB and rewrite follow-up questions into standalone queries.
- **KB Routing Heuristics:** If routing is uncertain, definition-style questions are treated as KB queries.
- **Chunk Overlap Alignment:** Overlap prefers paragraph/sentence boundaries and drops overlap when it would exceed max tokens.
- **i18n Enforcement:** Automated checks for hardcoded UI strings and EN/TR key parity wired into lint.
- **KB Sidebar Sync:** Dispatch a client-side `knowledge-updated` event on folder create/delete to keep the sidebar in sync without full remounts.
- **KB Sidebar Refresh:** Dispatch `knowledge-updated` on content create/update/delete and surface pending AI suggestions via a KB banner linked to Organization settings.
- **KB Banner Styling:** Use an amber-toned banner for pending AI suggestion visibility in Knowledge Base.
- **KB Loading UX:** Show route-level skeletons so knowledge pages render instantly while server data loads.
- **KB Sidebar Navigation:** Allow clicking files in the sidebar to open the document detail view.
- **KB Sidebar Focus:** Highlight the active document and add spacing between the All Content and Uncategorized sections.
- **KB Sidebar Realtime:** Subscribe to knowledge document/collection changes to refresh the sidebar immediately.
- **KB Async Processing:** Save/update returns immediately with `processing` status; background processor builds chunks, generates suggestions, and UI polls until ready/error.
- **KB Realtime Publication:** Add knowledge tables to Supabase realtime publication so sidebar updates instantly on deletes.
- **KB Realtime Deletes:** Set replica identity full on knowledge tables so delete events include `organization_id` for filtered subscriptions.
- **Suggestions Realtime Publication:** Add offering profile suggestions to Supabase realtime publication so indicators/banners update instantly.
- **KB Non-blocking UI:** Create/edit/delete navigates immediately while processing continues in the background.
- **AI Settings Simplification:** Always-on flexible mode with a single match threshold (Skill + KB) and a single prompt field for fallback responses.
- **Bot Name:** Store an org-level `bot_name` in AI settings and inject it into AI prompts, summaries, and inbox labels.
- **Token Usage Accounting:** All token-consuming features must record usage in `organization_ai_usage` for monthly UTC and total tallies.
- **Fallback Prompt Source:** Use the UI-configured fallback prompt directly (no hardcoded system append).
- **Inbox Composer:** Show an AI-assistant-active banner with a takeover prompt while keeping manual reply enabled.
- **Inbox Details:** Use consistent contact initials between list avatars and details panel.
- **Inbox Avatars:** Use the shared Avatar component across list, chat, and details to keep initials/colors consistent.
- **Inbox Details Layout:** Keep the contact header block and group the lead snapshot under Key Information for faster scanning.
- **Lead Extraction Pause UI:** If the operator is active or AI is off, surface a paused notice and allow a manual lead refresh from inbox details.
- **Lead Snapshot Styling:** Show a minimal AI extraction micro-label and render lead status as text with a small color dot.
- **Platform Row Icon:** Show the channel icon next to the platform value; use consistent icon sizing across channel cards and brand-colored react-icons.
- **Inbox List Badges:** Show a small platform badge on conversation avatars so the channel is visible at a glance.
- **Inbox Badge Styling:** Use brand-colored icons with a light backdrop for legibility on avatar colors.
- **Inbox Badge Placement:** Center the platform badge beneath the avatar to reduce corner crowding.
- **Inbox Badge Scale:** Increase badge/icon size slightly and reduce border weight for better legibility.
- **Inbox Badge Offset:** Drop the badge a bit lower and further emphasize the brand icon.
- **Inbox Badge Fine-Tuning:** Allow incremental offset and border tweaks for visual balance.
- **Inbox Lead Status Chip:** Show lead status as a text chip on the conversation name row (far right) for faster scanability.
- **Inbox List Time Row:** Keep relative last-message time on a dedicated third line under the one-line preview.
- **Inbox Lead Realtime:** Include `leads` in realtime publication and subscribe to status changes so list indicators update without manual refresh.
- **Inbox Realtime Auth Sync:** Bootstrap realtime auth from session, fall back to `refreshSession()` when missing, and re-apply tokens on auth state changes to avoid stale subscriptions.
- **Inbox Summary:** Generate summaries on-demand only (no background refresh or cache), show a single-paragraph summary in an accordion, and only reveal refresh after the summary finishes while showing a tooltip when insufficient messages.
- **Settings UX:** Use two-column sections with header save actions, dirty-state enablement, and unsaved-change confirmation on navigation.
- **Settings Clarity:** Remove redundant "current value" summaries above form inputs and selection controls.
- **Unsaved Changes Modal:** Secondary actions hug content, discard is soft-danger, and primary save CTA stays single-line.
- **Settings Save Feedback:** Show saved state via the save button (no inline “Saved” text) and clear dirty-state after persistence across settings pages.
- **Settings Sidebar Icons:** Use the updated settings menu icon set (bubbles/circle user) for profile/org/general/AI/channels/billing entries.
- **Password Recovery:** Use Supabase reset email with locale-aware redirect to `/{locale}/reset-password` and a 120-second resend cooldown.
- **Telegram Sandbox Channel:** Use Telegram (bot + webhook) as the live channel while WhatsApp integration is pending; channels table supports both `telegram` and `whatsapp`.
- **Type Safety (Build):** Align KB router history role types and guard strict array indexing to keep TypeScript builds green.
- **Skills UI Layout:** Place skills search above tabs and keep the add CTA visible in the list header.
- **Lead Extraction Trigger:** Run extraction asynchronously on every new customer message to keep the lead snapshot current.
- **Operator Extraction Toggle:** Default to pausing lead extraction during operator takeover, with an AI Settings toggle to keep it running.
- **Lead Extraction Parsing:** Strip code fences and extract the first JSON object before parsing to prevent empty lead updates.
- **Lead Scoring Transparency:** Weight decisive booking intent higher (+3), add keyword fallback for intent signals, and expose on-demand score reasoning grounded in extracted inputs.
- **Lead Score UX:** Reasoning copy respects the active UI locale and uses localized status labels.
- **Service Catalog (Hybrid):** Auto-propose services from Skills/KB and require admin approval before the service can be used in extraction.
- **Offering Profile (Catalog Optional):** Maintain an editable service scope summary used when a catalog is absent or incomplete; AI suggestions are generated from Skills/KB in org language using a hybrid format (intro + up to 5 bullets), start pending, can propose updates to existing approved suggestions, and only approved suggestions are used for extraction.
- **Offering Profile Updates:** Conflicting content produces update suggestions that revise the targeted approved suggestion on approval.
- **Offering Profile Context:** Suggestion generation includes the manual summary plus approved/rejected suggestion history for better alignment.
- **Offering Profile Formatting:** Suggestions must include a short intro plus 3-5 labeled bullets; if output is too sparse, retry generation.
- **Non-Business Handling:** Skip lead extraction and scoring for personal/non-business conversations (mark as ignored).
- **Offering Profile Location:** Manage the Offering Profile under Organization Settings (not AI Settings) to align with org-level scope.
- **Organization AI Control:** Use independent section-level AI toggles for Offering Profile and Required Fields UX modes.
- **AI Suggestions Header:** Keep a single pending indicator label in the accordion header and avoid duplicate right-side count chips.
- **Manual Profile Note:** Keep a persistent custom textarea in Approved suggestions for manual scope notes; store it separately in `offering_profiles` and do not convert it into suggestion cards.
- **Required Fields Sync:** On Skill/KB updates, ask AI for only missing required fields by sending existing fields in prompt context; normalize/dedupe before persisting so manual and AI chips do not duplicate.
- **Required Fields Parsing:** Accept fenced/noisy JSON responses when extracting required fields so KB/Skill-triggered chip generation remains resilient.
- **Required Fields Follow-Up:** For KB/fallback response generation, include required fields, recent customer messages, and the last 3 assistant replies in prompt context so LLM can naturally ask one concise follow-up question when needed and avoid repetitive openings.
- **Conversation Continuity:** Use recent multi-turn conversation history in final KB/RAG/fallback generation and apply repeated-greeting suppression when assistant already greeted recently.
- **Settings Layout:** Keep consistent settings column widths and remove duplicate right-column labels so inputs align with section titles.
- **Terminology (TR):** Replace "Lead" with "Kişi" in Turkish UI copy for clarity.

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
| Dev Workflow | Add subagent-driven-development skill | Standardizes subagent-based execution of implementation plans |
