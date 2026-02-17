# WhatsApp AI Qualy — PRD (MVP)

> **Last Updated:** 2026-02-17 (Inbox now surfaces WhatsApp reply-window state in context: far-right `reply available / reply unavailable` indicator beside summary, tooltip reason when blocked, and composer/send lock with short overlay message after the 24-hour window. MVP keeps template messaging out of scope and preserves `active_agent` when sending is blocked. Pricing rollout is implemented with final Starter/Growth/Scale + top-up ladder decisions, safe monthly conversation-range copy in `/settings/plans`, and admin-configurable TRY/USD pricing controls in `/admin/billing`. Plans UI copy now follows end-user language, TR package names are localized as `Temel/Gelişmiş/Profesyonel`, current monthly package is explicitly surfaced, top-up uses a single modal-based action, package-card CTA spacing/alignment is tightened, Scale baseline is updated to `949 TRY`, and the package section now includes a full-width custom-package CTA linking to `mailto:askqualy@gmail.com`. Pricing currency is now driven by organization billing region (not UI language): `TR` organizations see TRY, non-TR organizations see USD. Premium organizations can now self-manage auto-renew in `/settings/plans` (turn off/on with period-end cancellation behavior) without admin support. Billing hard-lock now restricts locked tenants to `Settings > Plans` and `Settings > Billing` only, with workspace route redirects and inbox read/send lock. Plan-change flow now follows common SaaS behavior: upgrades apply immediately, downgrades are scheduled to the next billing period, and UI shows effective-date + target-package info through a modal-first subscription management surface plus separate cancellation confirmation modal. Active package economics are surfaced in the top current-package card while the subscription-management card remains action-focused, with consistent card typography and desktop CTA alignment across related billing cards. `Settings > Usage` credit history now includes richer package/top-up change context by resolving ledger metadata and linked subscription/order details.)  
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
| Feature | Description | Status (2026-02-10) |
|---------|-------------|--------------------|
| WhatsApp Integration | Single number per org | Implemented (Meta Cloud API MVP: OAuth channel setup, popup-based connect UX, webhook verification, inbound text-only processing, and reactive outbound replies) |
| Instagram Integration | Single business account per org | Implemented (Meta OAuth channel setup, popup-based connect UX, webhook verification, inbound text-only processing, reactive outbound replies; separate channel from WhatsApp) |
| AI Auto-Reply | Skill-based + KB fallback | Implemented for Telegram + WhatsApp + Instagram + Simulator |
| User-Generated Skills | Custom intent → response mappings | Implemented |
| Knowledge Base (RAG) | FAQ, packages, policies | Implemented |
| Lead Extraction | AI summary + score (0-10) | Implemented (Telegram + WhatsApp + Instagram; Inbox manual overwrite UI for important-info fields pending) |
| Human Takeover | Bot pauses when business replies | Implemented (active_agent + assignee lock) |
| Multi-Tenant | Organization-based isolation | Implemented |
| Admin Panel | Leads, Skills, KB, Channels management | Partial (Dashboard + Leads + Skills/KB/Inbox/Settings/Channels implemented; organization-level billing audit history is visible in org detail; pending: `Open in WhatsApp` quick action and cross-org billing audit tooling) |
| Public Legal Center | Landing legal docs (`/legal`, `/terms`, `/privacy`) rendered from versioned markdown and exposed via `public/legal_versions.json` | Implemented |
| **Inbox UI** | **Real-time chat, history, manual reply, delete, assignee system, unread indicators, on-demand summary, glowing AI summary trigger + inline chevron toggle, mobile list→conversation flow with details toggle, and cumulative per-conversation AI credit usage in details** | Implemented |

### ❌ Out of Scope (Intentional)
- Calendar integration
- Auto follow-up sequences
- Campaigns / broadcasts
- Advanced flow builder

---

## 4. Core Features

### 4.1 Messaging Auto-Reply Engine (Telegram + WhatsApp + Instagram MVP)

**Flow:**
```
Customer Message → Skill Match? → Yes → Skill Response
                              → No  → KB Match? → Yes → RAG Response
                                               → No  → Fallback Response (topics + clarifying question)
```

**Rules:**
- Skill/KB answers are grounded in stored content; fallback uses configured prompt + topic list
- No hallucination — if unsure, ask a single clarifying question (or suggest topics)
- WhatsApp and Instagram MVP support text messages only and send replies reactively to inbound customer messages (no proactive/template-initiated flow in MVP)
- Meta OAuth channel connect starts in a separate popup and returns success/error status to the existing Channels page context (main app tab remains stable)
- Meta OAuth origin resolution prioritizes canonical app URL and supports forwarded-host fallback for Netlify routing consistency.
- Meta OAuth callback diagnostic hint (`meta_oauth_error`) is propagated from popup to main Channels URL for production support troubleshooting.
- WhatsApp OAuth candidate discovery supports fallback via `me/businesses` + business WABA edges when direct user node field access is unavailable in Graph.
- Channels remain independent in runtime/data model (`telegram`, `whatsapp`, `instagram` each has separate channel config + webhook route).
- Bot mode (org-level): Active (replies), Shadow (lead extraction only), Off (no AI processing). Simulator is unaffected.
- Inbox composer banner mirrors bot mode state: Active shows “assistant active”, Shadow/Off show “assistant not active”.
- Shadow inactive banner copy is compact by default (single-line title + one short explanatory sentence).
- Inbox conversation view should only render message content after selected-thread data is loaded; while loading, show skeletons to avoid stale previous-thread visuals.
- Simulator includes token usage visibility for debugging
 - Token usage is shown per message and as a conversation total in the simulator
 - Simulator chat visuals are channel-agnostic (no WhatsApp-specific brand mimicry)
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
| `requires_human_handover` | If true, always switch to operator after this skill response |

**Routing Logic:**
1. User message → embedding
2. Compare with skill embeddings (top-5 similarity)
3. LLM re-rank → `skill_id` + `confidence` (0-1)
4. If `confidence < threshold` → fallback to KB or topic-guided fallback response

**Embedding Source:**
- Skill embeddings are generated from both `title` and `trigger_examples` (not triggers only).

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
- Lead score and status are produced directly by the LLM using the latest 5 customer messages as grounding context, while recent role-labeled turns (`customer`, `owner`, `assistant`) are provided to disambiguate short confirmations (for example, "evet").
- Owner/assistant turns are contextual only: extracted facts must still come from explicit customer statements or customer confirmations.
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
- Lead extraction applies merge-on-update persistence for collected required fields; `service_type` is not carry-forward merged when latest extraction has no service clue, and `summary` is always tied to the current extraction window (latest 5 customer messages) to prevent stale status-summary mismatch.
- Lead extraction output language is locale-aware (TR/EN): summary and extracted detail values follow customer/locale signal instead of defaulting to English.
- Service inference guard: when recent customer turns are generic greetings/acknowledgements without a clear service clue, extraction must keep `service_type = null` (do not infer solely from profile text).
- Insufficient-information conversations (e.g., greeting-only/unclear short turns with no qualifying signals) are marked as `undetermined`.
- Greeting-only turns are normalized to `undetermined` even if raw model output marks `non_business=true`, preventing false `ignored` statuses on first-contact hellos.
- Extraction locale precedence is deterministic: explicit preferred locale (UI/manual refresh) > organization locale > customer-message language heuristics.
- Inbox lead details now show collected required fields in an "Important info" card section based on Organization Settings > Required Fields, rendered as plain label-value rows.
- Leads list required-field columns/cards use the same required-intake resolver as Inbox details so `required_intake_collected` values stay consistent across both surfaces.
- Required-info resolution supports manual override precedence (`extracted_fields.required_intake_overrides`) for future editable lead workflows.
- Manual overwrite UI for "Important info" is intentionally deferred; planned behavior is per-field edit in Inbox with source tracking (AI vs manual) and filter-ready structured persistence.
- Non-business conversations are excluded from lead scoring and marked as `ignored` (not `undetermined`).

---

### 4.5 Human Takeover

**Trigger:** Business owner sends ANY message from their WhatsApp OR claims via Inbox.
 **Behavior:**
- **Explicit State:** `active_agent` switches to 'operator'.
- **Assignee Ownership:** Operator is assigned (`assignee_id`) for ownership/visibility and claim tracking.
- **Source of Truth:** AI reply gating uses `active_agent` as the runtime source of truth; `assignee_id` is ownership metadata and legacy fallback only.
- **AI Silence:** Bot ignores all incoming messages while operator is active.
- **Resume:** Operator (or Admin) must explicitly "Leave Conversation" to resume Bot.
- **Optional Extraction:** Lead extraction can remain active during operator takeover if enabled in AI Settings.

---

### 4.6 Human Escalation Policy (Implemented for Telegram)

**Triggers:**
- Skill-level mandatory handover (`requires_human_handover = true`)
- Lead-score handover (`lead.total_score >= hot_lead_score_threshold`)

**Precedence:**
- `skill override > hot lead score > no escalation`

**Actions:**
- `notify_only`: notify owner/team, keep AI active
- `switch_to_operator`: lock conversation to operator (`active_agent='operator'`)

**Bot Message (Handover):**
- Escalation appends a handover message after AI response.
- Handover message is locale-aware (TR/EN in AI Settings; UI locale selects which message is edited/shown).
- Legacy/default mismatch repair ensures TR UI does not show EN default handover text.
- `notify_only` does not suppress subsequent AI replies; only `switch_to_operator` toggles runtime AI silence via `active_agent`.

**Skill Override Rule (validated):**
- Skill-triggered handover always uses `switch_to_operator` + `assistant_promise`.
- Bot message text is configured in AI Settings and shown as read-only in skill form with a deep link to edit.

---

### 4.7 Default System Guardrail Skills (Implemented)

**Goal:** provide safe day-1 behavior for every organization without requiring setup.

**Default skills (enabled for all orgs):**
- Human support request (`requires_human_handover = true`)
- Complaint / dissatisfaction (`requires_human_handover = true`)
- Urgent / critical request (`requires_human_handover = true`)
- Privacy / consent / deletion request (`requires_human_handover = true`)

**Provisioning behavior:**
- Default guardrail skills are seeded automatically when an organization first loads Skills and has no skills yet.
- Skills appear in the same unified list as user-created skills (no Core/Custom split).

**Message behavior:**
- Each guardrail skill uses a dedicated localized bot message (TR/EN).
- Guardrail skills escalate via existing skill handover policy (`switch_to_operator`).

**Important scope decision (MVP):**
- Do not apply low-confidence automatic handover.
- Do not apply "no safe KB answer" automatic handover.
- Ambiguous/general requests continue to route through existing `Skill -> KB -> fallback`.

---

## 5. Admin Panel

### 5.1 Lead List (Partially Implemented)
- Name, phone, status (Hot/Warm/Cold)
- Score, AI Summary, last message time
- "Open in WhatsApp" button
- Mobile layout uses compact, tappable card rows with reduced spacing; desktop keeps the full sortable table layout.
- Desktop table keeps status chips on one line and keeps contact name on one line with truncation when needed.
- Required-field values in lead rows are resolved from the same normalized source used by Inbox details (`required_intake_collected` + fallback logic) for parity.

### 5.2 Skills Management (Implemented; Simulator-First Testing)
- CRUD operations
- Enable/disable toggle
- `Requires Human Handover` toggle with read-only bot message preview and AI Settings deep-link
- Skills screen uses a single unified list (no Core/Custom tab split); default and user-added skills are managed together
- Mobile UX follows app-style single-pane navigation: full list page first, then detail/edit page after selection with a back action.
- Mobile detail header uses compact action labels on small screens (e.g., `Düzenle`, `Kaydet`) while desktop keeps full labels.
- Skills detail action buttons (delete/save) use a shared icon + label pattern for consistent desktop/mobile affordance.
- Simulator is the canonical skill-testing surface for MVP; a separate per-skill playground is intentionally out of scope.

### 5.3 Knowledge Base (Implemented)
- CRUD with folders
- Rich text editor
 - Show indexing status (Ready / Processing / Error)
 - Sidebar shows uncategorized items (max 10 with expand) and accurate all-content counts
- Mobile UX uses a single-pane flow (Knowledge sidebar hidden on mobile; content/files shown as responsive cards)
- Mobile edit-content header uses compact labels (`Düzenle`, `Kaydet`) and icon-only back affordance to prevent header wrap on small screens.

### 5.4 Channels (Telegram, WhatsApp, Instagram Implemented; Messenger Placeholder)
- Telegram bot connection + webhook status/debug
- WhatsApp Meta Cloud connection via Meta OAuth + webhook status/debug
- Instagram Messaging connection via Meta OAuth + webhook status/debug
- WhatsApp/Instagram connection starts directly from `Bağla` (one click to Meta OAuth redirect; no extra intermediate modal)
- Instagram card connect CTA is currently gated as `Çok Yakında` for non-connected orgs in Settings > Channels
- Facebook Messenger card is visible in Settings > Channels as `Çok Yakında` placeholder (integration out of MVP scope)
- Channels settings card layout is a stacked single-column row list (one channel per row) with non-truncated names and right-side status/action controls for readability
- Inbox/Leads surfaces channel-specific platform indicators for all three channels

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
- Bot mode and escalation action cards use compact visual density (reduced title size, radio size, and card padding)
- Bot mode and escalation card titles align to section-title scale, with one-step smaller description text for tighter visual hierarchy
- Human Escalation section: two-step flow (automatic escalation + skill handover), hot lead threshold slider, escalation action cards, and locale-aware editable handover message
- Handover notice terminology in UI uses "Bot message" / "Bot mesajı" (replaces "Assistant's Promise" / "Asistan Sözü")
- Low-confidence automatic handover is intentionally disabled in MVP; explicit guardrail skills and existing KB/fallback flow are used instead
- Sensitivity slider now mirrors threshold semantics visually with right-side (`>=`) highlight and blue styling aligned to the hot lead score control
- Skill and KB matching threshold checks use inclusive comparison (`similarity >= threshold`) to align runtime behavior with UI semantics
- Prompt textarea defaults are locale-aware (TR UI shows Turkish default prompt when stored value is legacy/default English prompt text, including older long EN default variants)

### 5.6 Profile & Organization Settings
- Profile: name and email visibility (email is read-only)
- Profile security: password recovery via email reset link (Forgot + Reset)
- Forgot/Reset password screens share the same auth form visual language as Sign In/Sign Up (typography, input focus, CTA/link accents) and avoid nested wrapped-card layout.
- Public auth pages now include a top logo header and inline EN/TR language switcher.
- Sign Up form fields for MVP are `full_name`, `email`, and `password`; legal consent is communicated as inline Terms/Privacy links (no required checkbox).
- Sign In and Sign Up password inputs include show/hide toggle controls.
- On mobile, Sign In and Sign Up inputs use iOS-safe font sizing (`16px` baseline via `text-base`) to prevent keyboard-triggered auto zoom.
- Sign In and Sign Up are route-level separated (`/login`, `/register`) and no longer use an in-form segmented switcher.
- Signout endpoint redirects to `register` using the incoming request origin (with forwarded-header support) so custom domains are preserved.
- Public auth layout uses dynamic viewport height (`dvh`) and light background defaults so mobile top/bottom chrome areas do not show black bars.
- Public auth desktop shell includes an animated messenger-style preview panel with conversion-focused typed user/assistant example flows.
- Messenger preview interaction follows a send lifecycle (`type -> sent -> input reset -> assistant reply`) to better reflect real chat behavior.
- Composer resets to a placeholder-style empty state after send and before assistant reply to mirror real messenger input reset behavior.
- During the sending phase, typed user text remains visible in the composer until dispatch completes, then transitions to placeholder-style empty input.
- Auth preview composer uses a compact single-line style with subtle size transitions and the chat preview cluster is vertically centered in the right panel.
- Auth preview scenarios are intentionally distinct by intent category and use two-turn dialog pairs (`user -> agent -> user -> agent`) before switching.
- Auth preview shows a waiting placeholder before the first customer message (no pre-message score prediction shown).
- Auth preview includes a compact internal scoring chip under the top-left canvas text block (score, status, progress bar, latest signal), updated after each message, with scenario mix covering 2 hot and 1 cold flow.
- Auth preview does not render a secondary scoring card under the composer; analysis stays in the top-left internal chip only.
- Auth preview thread has a capped height with internal scrolling, hidden scrollbar, and a top gradient cut so long conversations do not grow the auth page.
- Auth preview message stack stays bottom-anchored so bubbles remain directly above the composer/input area.
- Auth preview thread height is fixed/clamped on desktop so the 4th bubble is clipped/faded from the top instead of pushing the panel on short viewports.
- Incoming bot typing now reserves target bubble height and uses smooth bubble-enter motion to avoid jitter while text is being typed.
- Auth preview keeps extra spacing between message stack and composer so multi-line bot bubbles do not visually collide with input.
- Support-only scenario agent closing copy is concise and handoff-oriented (“request forwarded to support team”).
- Sign Up consent notice is plain inline text (no bordered/boxed wrapper), stays compact on desktop, and may wrap on smaller viewports.
- Customer bubbles are explicitly labeled (`Müşteri` / `Customer`) to clarify that shown messages are incoming customer text in the simulation.
- Organization: company name and future org-level defaults
- Organization settings include interface language selection (TR/EN); dedicated General settings is hidden from navigation and legacy `/settings/general` redirects to `/settings/organization`.
- Mobile Settings navigation now opens with a dedicated settings list page first, then transitions to selected detail pages with an explicit back action.
- Mobile Settings back action uses client-side route transition (not full-page refresh) to keep mobile flow stable.
- Desktop Settings keeps the inner settings sidebar persistent across sub-route navigation; only the detail pane content swaps and shows loading states.
- Organization AI behavior is section-based:
  - Offering Profile has its own AI toggle for manual vs suggestions workflow.
  - Required Fields has its own AI toggle and keeps manual + AI chips together.

### 5.7 Usage & Billing (Implemented)
- Track org-level AI token usage (monthly UTC + total)
- Includes production AI paths: router, RAG, fallback, summaries, lead extraction, and lead reasoning
- Report usage breakdown by summary, messages (router/RAG/fallback), and lead extraction (including lead reasoning)
- Monthly usage card surfaces the UTC month label (e.g., February 2026)
- Usage details link appears under the UTC note in the Usage & Billing section
- AI usage cards show a token-derived credit preview next to monthly/all-time token totals to visualize future credit billing impact.
- Add monthly UTC + all-time message volume cards for:
  - AI-generated messages (`sender_type='bot'`)
  - Operator-sent messages (`sender_type='user'`)
  - Customer inbound messages (`sender_type='contact'`)
  - Display each metric on its own row inside the monthly/total cards for readability
- Add storage usage cards showing total estimated content size and a Skills/Knowledge Base split
- Every new token-consuming feature must log usage events

### 5.8 Platform Admin Workspace (Implemented v1, Read-Only)
- **Searchable Organization Switcher (System Admin):**
  - System admin sees current organization in sidebar and uses explicit `Select/Change` action to open a searchable modal picker.
  - Active org context is persisted via server cookie and applied across tenant modules (Inbox, Leads, Skills, Knowledge Base, Settings, Simulator).
  - Active organization resolution now uses a slim read path on normal navigation; the full organization list is fetched lazily only when the switcher modal is opened.
  - Switched-org impersonation is read-only in tenant modules for MVP.
  - UI shows a clear "read-only impersonation" state and supports reset to default org context.
  - If full organization listing is unavailable, fallback uses membership-linked organizations so tenant observation remains usable.
- **Admin Organization List (Read-Only):**
  - Organization table includes:
    - organization identity
    - total usage (messages)
    - total token usage
    - total skills count
    - knowledge base count
    - premium status (placeholder)
    - plan status/cycle (placeholder)
    - trial status (placeholder)
  - Organization list supports search and pagination for large tenant sets.
  - Query strategy uses DB-level count/range pagination and batched aggregate reads (no in-memory full-list slicing).
- **Admin Organization Details (Read-Only):**
  - `/admin/organizations/[id]` shows organization-level snapshot cards (usage, tokens, skills, knowledge, profile count).
  - Includes profile/member layer with role, system-admin flag, joined date, and cross-org membership visibility.
  - Detail read-model loads targeted org/member/profile slices only (avoids full-table organization/profile/membership scans).
- **Admin User List + User Details (Read-Only):**
  - User list shows all profiles and organization memberships (multi-profile-ready per organization).
  - User list supports search + pagination for large profile sets.
  - User details page shows per-organization snapshots (usage/tokens/skills/knowledge + plan/premium/trial placeholders).
  - User list read-model uses lightweight organization identity lookup (no org metric fan-out).
  - User details read-model loads only requested profile + memberships + related organizations, then computes snapshots for those organizations.
- **Admin Dashboard Totals (Read-Only):**
  - Top stat cards (organizations/users/skills/knowledge/messages/tokens) are fetched via a single DB aggregate RPC.
  - Dashboard avoids loading full organization summaries just to compute global totals.
  - Message stat card label is explicit (`Toplam Mesaj` / `Total Messages`) and represents total message count.
  - Credit stat card shows platform-wide used credits when system admin has no explicit org selection; with explicit org selection, card switches to that org's used-credit total.
  - Message/token/credit cards support period filtering with a shared selector: `All Time` or a specific UTC month.
  - Credit totals are derived from `organization_ai_usage` token usage with the same weighted credit-cost formula used in billing (`compute_credit_cost` parity), so dashboard values align with per-organization usage views.
  - Dashboard includes a monthly billing metrics block for plan/top-up flow:
    - monthly plan payment amount (TRY),
    - monthly plan transaction count,
    - monthly top-up payment amount (TRY),
    - monthly top-up credits purchased,
    - monthly top-up credits used.
  - Monthly billing metrics follow admin scope: no explicit org selection shows platform totals; explicit org selection shows active-org totals.
- **Admin Lead Monitoring (Read-Only, Active-Org Scoped):**
  - `/admin` dashboard shows recent leads for the currently active organization context.
  - `/admin/leads` provides a read-only lead list with search/sort/pagination, score/status visibility, and conversation jump links.
  - Both views follow the active org selected from the sidebar organization switcher (`active_org_id` cookie).
- **Deferred (Post-v1):**
  - Full self-serve billing automation is deferred, but support-driven admin actions are in-scope for paywall rollout:
    - trial extension
    - credit increase/decrease (ledger-backed adjustment)
    - premium assign/disable
  - Audit trail for platform-admin billing/plan actions (required with reason capture)
  - Advanced filters/sorting for admin tables

### 5.9 Monetization & Subscription (Planned, Pre-Pilot)
- **Pricing Strategy:**
  - Plan tiers and overage behavior are now locked for v1: `Starter/Growth/Scale` with `upgrade-first` positioning and burst-oriented top-up ladder.
  - Annual discount policy is still pending (post-baseline decision).
  - Launch target is a low-entry starter band around ~USD 10 equivalent (localized to TRY) before premium tier expansion.
  - Pricing calibration guide published (`docs/plans/2026-02-16-pricing-credit-strategy-guide.md`) and finalized for website + product copy with safe monthly conversation ranges.
  - Lock v1 billing order as: trial -> recurring monthly premium package -> credit top-up overflow.
  - v1 package controls are admin-managed with TRY+USD values per tier (`Starter/Growth/Scale`) and per top-up pack (`250/500/1000`).
  - Current baseline package prices:

    | Plan | TRY | USD |
    |------|-----|-----|
    | Starter | 349 | 9.99 |
    | Growth | 649 | 17.99 |
    | Scale | 949 | 26.99 |

  - Current baseline extra-credit prices:

    | Pack | TRY | USD |
    |------|-----|-----|
    | 250 credits | 99 | 2.99 |
    | 500 credits | 189 | 5.49 |
    | 1000 credits | 349 | 9.99 |
  - Lock v1 package policy: monthly included credits are non-rollover.
  - Finalize feature gates by plan (channels, AI limits, seats, and premium-only controls).
- **Plan Purchase (Online Payment):**
  - Integrate recurring monthly premium checkout with provider selection based on Turkey support and invoicing requirements.
  - Integrate one-time credit top-up checkout for active premium organizations.
  - Top-up is not available during trial.
  - Until provider integration is completed, run the same flow in mock mode with simulated `success` / `failed` outcomes for checkout QA.
  - Add payment webhook lifecycle handling (success, failure, renewal, cancellation, retry).
  - Execution plan is documented in `docs/plans/2026-02-17-iyzico-billing-integration-implementation-plan.md` (iyzico-first rollout).
- **Membership Lifecycle (Trial / Premium):**
  - Membership state model is defined as `trial_active`, `trial_exhausted`, `premium_active`, `past_due`, `canceled`, `admin_locked`.
  - Enforce entitlement checks in runtime + admin visibility using locked-state reasons (`trial_time_expired`, `trial_credits_exhausted`, `past_due`, `admin_locked`).
  - Include system-admin operational controls for per-organization support actions:
    - extend trial end date
    - adjust credit balance via ledger (`adjustment`)
    - assign/cancel premium state
  - All manual billing actions must require reason + actor metadata and be audit logged.
- **Trial Policy Decision (Required Gate):**
  - Trial model decision (pre-pilot): **trial-only** onboarding (no freemium tier at launch).
  - Trial defaults are locked for implementation: `14 days` and `200.0 credits`.
  - Trial lock precedence is locked: system stops token-consuming features when **either** `time_expired` or `credit_exhausted` occurs first.
  - Admin trial-default controls update only future/new organizations.
  - Rollout migration backfills existing non-system-admin organizations into trial baseline before subscription enforcement.
  - Define conversion trigger, optional grace policy, and upgrade UX behavior before payment rollout.
  - After trial lock, user must first purchase the recurring monthly premium package; top-up is blocked until premium is active.
  - Add abuse controls before opening self-serve trials broadly:
    - one-trial-per-business identity policy (`whatsapp_business_account_id` + normalized phone + organization identity signals)
    - disposable email / VOIP / device-fingerprint risk checks
    - signup velocity throttling + cooldown windows
    - suspicious-signup review flow and admin override audit trail

---

## 6. Multi-Tenant Architecture

| Concept | Implementation |
|---------|----------------|
| Organization | 1 customer = 1 org |
| Data Isolation | All tables have `organization_id` |
| Platform Admin | System admin dashboard, org/user lists, searchable org switcher, read-only cross-org impersonation for tenant surfaces, and billing default/override controls with reason capture implemented; advanced audit tooling UI remains deferred |

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
- **Sidebar Branding:** Use `/public/logo-black.svg` for expanded sidebar header state and `/public/icon-black.svg` for collapsed sidebar header state.
- **Sidebar Branding Scale:** In collapsed mode, render `/public/icon-black.svg` at active-tab footprint size (`44px`) to keep header branding visually balanced with nav pills.
- **Global Brand Name:** User-facing app brand copy and tab metadata use `Qualy` (legacy naming removed from runtime UI text).
- **Tab Icon Source:** Browser tab icon metadata points to `/icon-black.svg`, and app-level icon file is `src/app/icon.svg` for consistent favicon output.
- **Tab Title Strategy:** Browser tab title follows active route using `<Page> | Qualy`; Inbox title adds `(●)` when unread conversations exist, without numeric unread count in the title.
- **Sidebar Navigation:** Group primary navigation under eyebrow labels (Workspace, AI Tools, Other) for faster scanning.
- **Sidebar Spacing:** Add top padding between the header block and first navigation section for visual separation.
- **Sidebar Icons:** Use per-item active/passive icon variants (react-icons) to differentiate selected states.
- **Sidebar Accent Color:** Replace blue navigation accents with ink `#242A40` for sidebar active, indicator, and focus states.
- **Skills/Knowledge CTA Accent:** Use ink `#242A40` for primary CTA buttons in Skills and Knowledge Base (create, save, and primary modal actions).
- **Auth CTA Accent:** Use ink `#242A40` for Sign In/Sign Up primary CTA and auth switch-link actions to keep public auth surfaces aligned with the product accent system.
- **Auth Shell Layout:** Use a dedicated public auth shell with top branding, locale switcher, and a desktop visual panel to keep login/register focused and app-consistent.
- **Auth Top Bar Density:** Keep auth header branding compact; prefer smaller logo scale to reduce visual weight above forms.
- **Auth Right-Panel Motion:** Use lightweight typed/deleted message loops (customer + Qualy) plus gradient composer accents to communicate conversion value without external dependencies.
- **Auth Preview Interaction Order:** Simulate realistic messenger timing where user message is sent before assistant typing begins, and composer resets immediately after send.
- **Auth Sending Feedback:** Keep typed text visible during send and include a short sending delay state for clearer dispatch feedback before the sent bubble appears.
- **Auth Composer Send Behavior:** Keep typed text visible while sending, then reset to a placeholder-style empty state once send is confirmed.
- **Auth Composer Density:** Prefer compact, single-line composer sizing with smooth transitions over oversized multi-line presentation.
- **Auth Disabled Composer State:** Keep disabled/sending composer content single-line; only temporarily increase vertical density while `Sending...` feedback is shown.
- **Auth Preview Thread Layout:** Keep preview chat thread capped with internal hidden-scroll and a top gradient fade, while anchoring message bubbles at the bottom near the composer.
- **Auth Preview Small-Viewport Stability:** Prefer fixed/clamped thread height over content-driven growth so additional bubbles are clipped/faded rather than pushing the auth canvas.
- **Auth Preview Motion Stability:** Animate incoming bubbles and reserve typing-bubble height to prevent micro-jumps while agent text appears.
- **Auth Preview Density:** Keep message stack and thread-to-composer spacing slightly compact to avoid excess whitespace while preserving readability.
- **Password Recovery Visual Consistency:** Keep Forgot/Reset forms in the same auth form system as Sign In/Sign Up (ink accent focus/CTA/link styles, no secondary inner card wrapper).
- **Auth Scenario Variety:** Avoid semantically chained scenario rotations; each scenario should represent a separate use-case category.
- **Auth Scoring Visibility:** Do not show scoring before first customer input; start scoring only after initial message signal exists.
- **Auth Scoring Placement:** Keep scoring UI detached from customer input area to avoid implying end-user visibility; prefer compact analyst-style top placement.
- **Auth Input Scope (MVP):** Keep Sign Up minimal (`full_name`, `email`, `password`) and postpone SSO/Google to post-MVP.
- **Signout Redirect Host Resolution:** Build post-signout `register` redirect from request/forwarded origin at runtime to avoid environment hardcoding drift across custom domains.
- **Auth Legal Consent UX (MVP):** Replace mandatory Sign Up consent checkbox with inline legal notice copy linking to Terms and Privacy in a new tab for lower friction while preserving policy visibility.
- **Auth Consent Visual Style (MVP):** Render legal consent notice as normal inline text (no bordered/boxed container) so it reads like supporting form copy.
- **Auth Password UX:** Provide explicit password show/hide controls on Sign In and Sign Up for entry confidence on desktop/mobile.
- **Auth Mobile Input Sizing:** Use `text-base` (`16px`) on small-screen auth inputs to avoid iOS Safari auto-zoom while preserving compact `sm:text-sm` on larger screens.
- **Auth Mobile Viewport Stability:** Use `dvh`-based auth shell height and fixed light background tokens to avoid visible black bands at top/bottom on mobile browsers.
- **Legacy Cleanup:** Remove `knowledge_base` (legacy) and use documents/chunks as the single source of truth.
- **KB Routing:** Use LLM to decide whether to query KB and rewrite follow-up questions into standalone queries.
- **KB Routing Heuristics:** If routing is uncertain, definition-style questions are treated as KB queries.
- **Chunk Overlap Alignment:** Overlap prefers paragraph/sentence boundaries and drops overlap when it would exceed max tokens.
- **i18n Enforcement:** Automated checks for hardcoded UI strings and EN/TR key parity wired into lint.
- **Billing Terminology (TR):** All user-facing Turkish billing/paywall copy uses `Ücretsiz deneme` wording instead of `Trial`.
- **Platform Admin Context:** Persist active admin-selected tenant context via `active_org_id` server cookie so tenant pages resolve a single active organization consistently.
- **Platform Admin Navigation Performance:** Resolve system-admin org context in slim mode (active org only) during normal route transitions, and lazy-load full org options only when the sidebar picker is opened.
- **System Admin Sidebar Gating:** Tenant sections in the desktop sidebar (`Çalışma Alanı`, `Yapay Zeka Araçları`, `Diğer/Ayarlar`, and usage card) remain hidden until an explicit organization selection exists; without selection, only `Yönetim/Admin` navigation is visible.
- **Admin Dashboard Metric Scope:** On `/admin`, no explicit org selection means platform totals; if a system admin explicitly selects an org, org-scoped cards (used credits, recent leads) follow that selected tenant context.
- **Admin Dashboard Surface Simplification:** Remove redundant dashboard intro/read-only/active-org summary blocks and prioritize operational cards + monthly plan metrics as the first information layer.
- **Platform Billing Controls Surface:** Platform-level trial/package defaults are managed from dedicated `/admin/billing`; `/admin` dashboard remains overview-focused.
- **Admin Tables Layout Standard:** All `/admin` list/detail tables must use full available width and allow horizontal scrolling for wide column sets.
- **Server/Client Boundary Safety:** Server-rendered admin routes must not pass non-serializable component constructors (e.g., icon functions) into client primitives; render empty-state icon markup directly in server tables.
- **System Admin Impersonation Guard:** Tenant-scoped mutations reject system-admin writes to enforce read-only impersonation in MVP.
- **Billing Visibility + Control Strategy:** Billing status ships as live snapshots (membership state, lock reason, and trial/package/top-up used/remaining) in tenant Billing settings + platform-admin organization/user views; system-admin can also run guarded billing controls (platform defaults + per-organization manual overrides) with mandatory reason capture.
- **Tenant Billing IA Split (Implementation v1):** `Settings > Plans` is the action surface for subscription/top-up/trial conversion status, while `Settings > Billing` remains the detailed usage + receipts/ledger surface.
- **Tenant Billing IA Clarification (Implementation v1.1):** `Settings > Billing` is read-only and avoids duplicate purchase widgets; it keeps account snapshot context + immutable ledger + usage analytics, while all plan/purchase controls stay in `Settings > Plans`.
- **Tenant Billing Copy Simplification (Implementation v1.2):** Billing and Plans naming/copy prioritize short decision-first language; Plans hides mock outcome selectors from user-facing UI, and Billing shows only account status, credit history, and core AI usage metrics.
- **Self-Serve Renewal Control (Implementation v1.6):** `Settings > Plans` exposes user-facing auto-renew controls for active premium subscriptions. Turning it off means `cancel at period end` (membership remains active until the current cycle ends); turning it back on resumes automatic renewal.
- **Downgrade Scheduling UX (Implementation v1.7):** `Settings > Plans` keeps upgrade CTA prominent on plan cards, while lower-tier changes are scheduled from plan management for period end. Users must see the pending target package and effective date.
- **Modal-First Premium Plan Management (Implementation v1.8):** After subscription starts, premium users manage tier changes from a dedicated plan-management modal (3 tiers shown together with current/upgrade/switch actions). Cancellation is handled in a separate confirmation modal.
- **Monetization Rollout Order:** Finalize pricing strategy and trial model first, then implement checkout/payments and entitlement enforcement (avoid shipping payment flows before policy decisions are locked).
- **Trial Go-To-Market Model (Pre-Pilot):** Start with trial-only onboarding (no freemium) to reduce ongoing abuse vectors and keep support/sales qualification focused.
- **Starter Pricing Posture (Pre-Pilot):** Keep first paid plan in low-entry territory (~USD 10 equivalent, TRY-localized) and shift expansion to credit top-ups/upper tiers after conversion baseline is validated.
- **Pricing & Credit Calibration Guide (Pre-Pilot):** `docs/plans/2026-02-16-pricing-credit-strategy-guide.md` is the policy reference for trial-credit calibration (`100/120/200/250/1000` comparison), model-cost math, Lovable-like `upgrade-first` monetization structure (tier ladder + premium burst top-up), and customer-facing conversation-equivalent packaging ranges.
- **Pricing Catalog Rollout (Implementation v1.5):** `/settings/plans` now shows final package/top-up ladder with safe monthly conversation ranges; system-admin manages both TRY/USD price points from `/admin/billing`.
- **Billing Region Currency Rule (Implementation v1.9):** Displayed package currency is resolved from organization billing region (`TR` -> TRY, non-TR -> USD), independent of UI language.
- **TR Package Naming Rule (Implementation v1.10):** Turkish package labels are standardized as `Temel` (Starter), `Gelişmiş` (Growth), and `Profesyonel` (Scale) across tenant and admin billing surfaces.
- **Trial Defaults (Locked v1):** Provision new organizations with `14 days` and `200.0 credits` by default.
- **Trial Lock Precedence (Locked v1):** Enforce `first limit reached wins` between trial time and trial credits.
- **Trial Default Scope:** Admin updates to default trial values apply to newly created organizations only.
- **Subscription-First Conversion Rule (Locked v1):** Organizations locked by trial exhaustion must purchase a recurring monthly premium package before normal AI usage resumes.
- **Top-Up Eligibility Rule (Locked v1):** Top-up is unavailable during trial and available for any active premium organization (package-credit exhaustion not required).
- **Package Credit Expiry Rule (Locked v1):** Monthly package credits are non-rollover and reset on each billing cycle.
- **Admin Premium Package Controls (Locked v1):** Admin can update monthly package price (`X TL`) and included credits (`Y`), with changes applied according to billing policy versioning.
- **Admin Manual Billing Operations (Locked v1):** System-admin can extend trial, adjust credits, and assign/cancel premium per organization.
- **Admin Override Scope (Implementation v1):** In org detail, system-admin can adjust top-up/trial/package credits and set explicit `membership_state` + `lock_reason` overrides (with required reason + audit logging).
- **Admin Action Audit Requirement (Locked v1):** Every manual billing action must include reason, actor, previous state, and resulting state.
- **Admin Audit Visibility (Implementation v1.1):** `/admin/organizations/[id]` shows recent billing audit rows (date, action, actor, reason) sourced from `billing_admin_audit_log`.
- **Usage Visibility Requirement (Locked v1):** Users must be able to track trial/package progress from quick surfaces (desktop sidebar + mobile More menu), with deep link to detailed Billing page.
- **Usage Card Decision-First Matrix (Implementation v1.3):** Quick usage card must show active pool by lifecycle state: during trial show trial credits only; during premium show package remaining + top-up (if any); when locked/exhausted show short action-oriented subline.
- **Checkout-State Snapshot Refresh (Implementation v1.4):** Sidebar/mobile billing quick cards must re-fetch billing snapshot when checkout query-state changes so subscription activation is reflected without manual reload.
- **Top-Up Copy Normalization (Implementation v1.4):** User-facing terminology is `Ek kredi` (TR) and `Extra credits` (EN); avoid exposing `top-up` wording in tenant/admin UI copy.
- **Usage Card Compact Mode (Implementation v1.5):** Sidebar quick card should default to compact summary (`remaining credits + membership + decreasing progress`) and reveal package vs extra-credit breakdown only on chevron expand.
- **Billing Snapshot Source (Implementation v1):** Tenant/admin visibility reads from `organization_billing_accounts` plus immutable `organization_credit_ledger` history; frontend derives progress/eligibility from a shared billing snapshot mapper to keep sidebar/mobile/settings/admin surfaces consistent.
- **Runtime Entitlement Gate (Implementation v1):** Before token-consuming AI paths (shared inbound pipeline, Telegram webhook AI flow, simulator response generation, inbox summary/reasoning/manual lead-refresh), runtime resolves billing entitlement and exits early when usage is locked.
- **Workspace Hard-Lock Access Rule (Implementation v1.7):** If entitlement is locked (`trial_exhausted`, `past_due`, `canceled`, `admin_locked`, or exhausted premium credits), tenant workspace routes are restricted to `Settings > Plans` and `Settings > Billing`; inbox conversation read/send actions are blocked server-side to prevent message visibility/reply bypass.
- **TR Payment Provider Strategy (Locked v1):** Prioritize a TR-valid recurring provider (Iyzico first, PayTR alternative); use Stripe only with a supported non-TR entity/account model.
- **WhatsApp Cost Modeling Baseline:** For Meta Cloud API MVP, treat inbound webhook traffic and in-window free-form replies as zero template fee; meter WhatsApp variable cost only when sending template messages (country/category-dependent).
- **Platform Admin Read Models:** Use DB-backed pagination/search, aggregate RPC totals, and batched org metrics; avoid in-memory filtering, full-table scans, and N+1 fan-out for admin org/user list-detail pages.
- **Platform Admin Lead Monitoring:** Expose read-only recent leads on `/admin` and a dedicated `/admin/leads` list, both scoped by the active organization switcher context.
- **Admin Totals Fallback Logging:** When dashboard totals RPC is unavailable, degrade to fallback aggregates with non-error logging to avoid noisy runtime overlays during expected fallback paths.
- **System Admin Org Discovery Fallback:** If all-organizations query is unavailable, derive accessible organization context from membership-linked organizations.
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
- **Mobile Knowledge Flow:** Keep Knowledge Base single-pane on small screens by hiding the sidebar and rendering file lists as touch-friendly cards, while preserving desktop split layout.
- **AI Settings Simplification:** Always-on flexible mode with a single match threshold (Skill + KB) and a single prompt field for fallback responses.
- **Bot Name:** Store an org-level `bot_name` in AI settings and inject it into AI prompts, summaries, and inbox labels.
- **Inbox Message Contrast:** Bot-authored inbox messages use a dark-violet bubble with light text to keep bot replies easy to scan against operator and contact messages.
- **Simulator UI Direction:** Keep the simulator channel-agnostic with a neutral chatbot look (no WhatsApp wallpaper/green header/read ticks) while preserving the same matching/debug behavior.
- **Skill Testing Strategy (MVP):** Use Simulator as the canonical skill testing workflow; do not build a separate per-skill playground in MVP.
- **Token Usage Accounting:** All token-consuming features must record usage in `organization_ai_usage` for monthly UTC and total tallies.
- **Billing Message Metrics:** Message usage in Usage & Billing is computed from `messages.sender_type` with UTC monthly boundaries (`bot`, `user`, `contact`) and excludes `system` rows.
- **Billing Storage Metrics:** Storage usage in Usage & Billing is an approximate UTF-8 text size based on Skills (`title`, `response_text`, `trigger_examples`) and Knowledge Documents (`title`, `content`).
- **Billing Credit Preview Formula:** AI credit preview uses weighted token totals (`input + 4 × output`) divided by `3000` and rounded up to one decimal place.
- **Billing Message Layout:** Present AI/operator/customer message counts on separate rows inside each message usage card to improve scanability.
- **Fallback Prompt Source:** Use the UI-configured fallback prompt directly (no hardcoded system append).
- **Inbox Assistant-State Banner:** Composer banner copy reflects org `bot_mode` (`active` vs `shadow`/`off`) so runtime reply availability is explicit.
- **Skill Matching Fail-Open:** If semantic skill matching fails at runtime, continue via KB/fallback path instead of terminating the webhook flow.
- **Inbox Composer:** Show an AI-assistant-active banner with a takeover prompt while keeping manual reply enabled.
- **Inbox Details:** Use consistent contact initials between list avatars and details panel.
- **Inbox Credit Usage Visibility:** Show cumulative AI credit usage per conversation in details using DB-persisted conversation totals (`conversations.ai_usage_*`) maintained by `organization_ai_usage` insert trigger + migration backfill.
- **Inbox Avatars:** Use the shared Avatar component across list, chat, and details to keep initials/colors consistent.
- **Inbox Details Layout:** Keep the contact header block and group the lead snapshot under Key Information for faster scanning.
- **Lead Extraction Pause UI:** If the operator is active or AI is off, surface a paused notice and allow a manual lead refresh from inbox details.
- **Lead Snapshot Styling:** Show a minimal AI extraction micro-label and render lead status as text with a small color dot.
- **Platform Row Icon:** Show the channel icon next to platform values using shared public SVG logos (`/Telegram.svg`, `/whatsapp.svg`, `/instagram.svg`, `/messenger.svg`) across Channels cards, Inbox platform surfaces, and Leads list rows/cards.
- **Inbox List Badges:** Show a small platform badge on conversation avatars so the channel is visible at a glance.
- **Inbox Badge Styling:** Use brand-colored icons with a light backdrop for legibility on avatar colors.
- **Inbox Badge Placement:** Center the platform badge beneath the avatar to reduce corner crowding.
- **Inbox Badge Scale:** Increase badge/icon size slightly and reduce border weight for better legibility.
- **Inbox Badge Offset:** Drop the badge a bit lower and further emphasize the brand icon.
- **Inbox Badge Fine-Tuning:** Allow incremental offset and border tweaks for visual balance.
- **Inbox Lead Status Chip:** Show lead status as a text chip on the conversation name row (far right) for faster scanability.
- **Inbox List Time Row:** Keep relative last-message time on a dedicated third line under the one-line preview.
- **Inbox Lead Realtime:** Include `leads` in realtime publication and subscribe to status changes so list indicators update without manual refresh.
- **Inbox Lead Payload Normalization:** Normalize nested one-to-one `leads` relation payloads to a stable array shape during conversation-list reads so chip rendering is consistent after page reloads.
- **Inbox Realtime Auth Sync:** Bootstrap realtime auth from session, fall back to `refreshSession()` when missing, and re-apply tokens on auth state changes to avoid stale subscriptions.
- **Inbox Summary:** Generate summaries on-demand only (no background refresh or cache), show a single-paragraph summary in an accordion, and only reveal refresh after the summary finishes while showing a tooltip when insufficient messages.
- **Inbox Summary Reopen Behavior:** Closing and re-opening the summary panel should trigger a fresh summary generation (without requiring manual refresh).
- **Inbox WhatsApp Replyability UX (MVP):** For WhatsApp conversations, show a far-right status indicator (`reply available` / `reply unavailable`) on the summary row; when blocked, show reason via tooltip and lock composer/send with a short overlay notice.
- **Inbox Agent-State Rule (MVP):** WhatsApp 24-hour send lock must not mutate `active_agent`; conversation control state remains unchanged.
- **Inbox Scroll-to-Latest CTA:** Show an animated jump-to-latest button only when chat is away from bottom; anchor it on the composer divider with subtle gray styling.
- **Inbox Composer Spacing:** Keep a tight vertical rhythm between the summary control row and assistant-state banner to reduce unused space.
- **Inbox List Header Surface:** Keep the Inbox conversation-list header on the same surface tone as the list column (non-white) for consistent sidebar visuals across dashboard modules.
- **Inbox Conversation Switch Loading:** Track selected-thread id separately from loaded-thread id and render skeletons during switches so avatar/details do not update against stale previous-thread messages.
- **Mobile Inbox Flow:** On mobile, keep Inbox as app-style single-pane navigation (`list -> conversation`), with an explicit back action and a header details toggle for compact contact/lead visibility.
- **Mobile Navigation Shell:** Hide desktop sidebar on mobile and use a fixed bottom navbar (`Inbox`, `Kişiler`, `Yetenekler`, `Bilgi Bankası`, `Diğer`) where `Diğer` opens quick actions (`Simülatör`, `Ayarlar`, `Signout`).
- **Mobile More Menu Simplification:** Do not duplicate `Plans/Billing Usage` links in `Diğer`; billing routes are accessed from Settings navigation to avoid redundant entry points.
- **Mobile Settings Back Behavior:** In settings detail pages, back action should return to `/settings` without adding extra history entries (prevent back/forward oscillation loops).
- **Mobile Navigation Performance:** Prefetch key bottom-nav destinations (`/inbox`, `/leads`, `/skills`, `/knowledge`, `/simulator`, `/settings`) with short delayed scheduling to reduce transition latency without adding click-time jank.
- **Desktop Settings Navigation Performance:** Prefetch settings destinations from main sidebar/settings shell with short delayed scheduling, and route the desktop main Settings entry to `/settings/ai` while preserving mobile quick action target `/settings`.
- **Mobile Inbox Details Payload:** Mobile details must prioritize lead context by showing `service_type`, `summary`, and collected required-intake fields.
- **Mobile Operator Exit Visibility:** When conversation control is on operator, keep a visible “Leave Conversation” action in mobile chat view (not buried in desktop-only details column).
- **Mobile Inbox Transition Motion:** Use horizontal slide transitions for list→conversation and conversation→list navigation to preserve app-like continuity.
- **Mobile Details Overlay:** Opening mobile details should dim the chat background with a dark tappable overlay to emphasize focus and make close intent obvious.
- **Mobile Details Micro-Animation:** Mobile details open/close should use short fade + vertical translate transitions to avoid abrupt layout jumps.
- **Mobile Leads List Density:** On small screens, use compact card rows with tighter spacing and tap-first scanning; keep desktop lead table structure unchanged.
- **Desktop Leads Row Readability:** Keep lead status chips and contact names on one line in the desktop table; truncate long names instead of wrapping.
- **Mobile Skills Flow:** On small screens, keep Skills as single-pane list→detail navigation with horizontal slide transitions and explicit back action; keep desktop split-pane layout unchanged.
- **Mobile Settings Flow:** On small screens, keep Settings as single-pane list→detail navigation with horizontal slide transitions and explicit back action; keep desktop settings layout unchanged.
- **Mobile Skills Header Density:** On small screens, use shorter detail-header action labels for readability; keep desktop wording unchanged.
- **Settings UX:** Use two-column sections with header save actions, dirty-state enablement, and unsaved-change confirmation on navigation.
- **Settings Clarity:** Remove redundant "current value" summaries above form inputs and selection controls.
- **AI Settings Card Density:** Keep bot-mode and escalation selection cards compact to avoid oversized visual weight in settings pages.
- **AI Settings Card Typography:** Keep selection card titles at section-title scale (`text-sm`) and descriptions one step smaller (`text-xs`) for consistent hierarchy.
- **AI Settings Threshold Semantics UI:** Render sensitivity threshold with a blue right-side (`>=`) highlight to match hot lead score semantics and reduce ambiguity.
- **AI Settings Threshold Semantics Runtime:** Apply inclusive threshold checks (`>=`) in skill and KB similarity matching so backend behavior matches UI wording.
- **Unsaved Changes Modal:** Secondary actions hug content, discard is soft-danger, and primary save CTA stays single-line.
- **Settings Save Feedback:** Show saved state via the save button (no inline “Saved” text) and clear dirty-state after persistence across settings pages.
- **Settings Sidebar Icons:** Use the updated settings menu icon set (bubbles/circle user) for profile/org/AI/channels/billing entries.
- **Settings Title Parity:** Settings page headers should use the same labels as the corresponding settings sidebar items.
- **Settings IA Simplification:** Keep language selection under Organization settings and hide dedicated General settings from the sidebar; retain `/settings/general` as a compatibility redirect to `/settings/organization`.
- **Password Recovery:** Use Supabase reset email with locale-aware redirect to `/{locale}/reset-password` and a 120-second resend cooldown.
- **Channel Topology (MVP):** Treat `telegram`, `whatsapp`, and `instagram` as independent channels (`channels.type`) and store conversations with explicit per-channel platform values (`conversations.platform`).
- **Channel Launch Gating:** Keep Instagram connect CTA and Facebook Messenger card as `Coming Soon` placeholders in Settings > Channels until rollout is reopened; Telegram/WhatsApp flows remain active.
- **Channels Settings Readability:** Render channel cards as full-width stacked rows (one channel per row), avoid truncating connected channel names, and place status/actions on the right side for fast scanning.
- **Channels Verification Scope (MVP):** Use live channel connection status + debug diagnostics in Settings > Channels; do not maintain a separate channel-level "test message sandbox" surface in MVP.
- **Messenger Brand Icon:** Use `public/messenger.svg` for Facebook Messenger placeholder visuals in Channels settings.
- **Meta Channel Onboarding (MVP):** Use Meta OAuth start/callback routes with signed state validation; do not require manual token entry in channel settings UI.
- **Meta OAuth Redirect Robustness:** Carry a signed/safe `returnTo` channels path in OAuth flow so error/success callbacks return users to their active channel settings route.
- **Meta Webhook Architecture:** Keep channel webhook routes separate (`/api/webhooks/whatsapp`, `/api/webhooks/instagram`) and reuse a shared inbound AI processing pipeline for consistent Skill → KB/RAG → fallback behavior.
- **WhatsApp MVP Channel Strategy:** Implemented via Meta Cloud API with OAuth-based channel setup (auto-resolved `phone_number_id` + `business_account_id`), text-only inbound handling, webhook signature verification, and reactive replies only (no proactive/template-first messaging in MVP).
- **WhatsApp Template Scope (MVP):** Keep template messaging out of scope. If the 24-hour free-form window is closed, API-based outbound sending is blocked until a new inbound customer message arrives.
- **Instagram MVP Channel Strategy:** Implemented via Meta Instagram Messaging API with OAuth-based channel setup (auto-resolved `page_id` + `instagram_business_account_id`), text-only inbound handling, webhook signature verification, and reactive replies only (first turn must come from customer inbound message).
- **Type Safety (Build):** Align KB router history role types and guard strict array indexing to keep TypeScript builds green.
- **Skills UI Simplification:** Use a single skills list (no Core/Custom split), keep search above the list, and keep the add CTA visible in the header.
- **Skills Embedding Source:** Generate skill embeddings from both skill title and trigger examples; regenerate on title/trigger changes.
- **Skills Icon Consistency:** Reuse the sidebar Skills icon in the Skills empty-state panel for visual consistency.
- **Skills Embedding Backfill:** When skills exist without embeddings (e.g., manual SQL inserts), regenerate missing skill embeddings on skills load to restore semantic matching.
- **Lead Extraction Trigger:** Run extraction asynchronously on every new customer message to keep the lead snapshot current.
- **Operator Extraction Toggle:** Default to pausing lead extraction during operator takeover, with an AI Settings toggle to keep it running.
- **Human Escalation Policy:** Centralize escalation decisions in one policy layer with strict precedence `skill override > hot lead score`, where skill-triggered handover always sends the bot handover message and switches to operator.
- **Operator Activity Resolution:** Use `active_agent` as the primary runtime switch for AI reply gating; treat `assignee_id` as ownership metadata (legacy fallback only when `active_agent` is missing).
- **Extraction Language Resolution:** Lead extraction writes user-facing extracted outputs (summary + key detail values) in locale/customer language (TR/EN) instead of relying on English default prompts.
- **Extraction Locale Precedence:** Resolve extraction output language as `preferred locale > organization locale > message heuristics` to keep UI-triggered refreshes language-consistent.
- **Service Inference Guardrail:** Do not fill `service_type` from profile-only context when customer turns are greeting-only or otherwise missing explicit service clues.
- **Extraction Confirmation Context:** Include recent role-labeled turns (`customer`/`owner`/`assistant`) in extraction prompts so short customer confirmations can be resolved against the immediately preceding question, while preserving customer-confirmed grounding.
- **Default Guardrail Scope (MVP):** Ship universal explicit-intent guardrail skills (human support, complaint, urgent, privacy) and keep low-confidence/no-safe-answer auto-handover out of scope.
- **Default Guardrail Provisioning:** Seed localized default guardrail skills for organizations that have no skills on first Skills load; manage them in the same list as user-created skills.
- **Handover Locale Repair:** When legacy/default values create EN text in both localized fields, normalize to TR default for `hot_lead_handover_message_tr` and EN default for `hot_lead_handover_message_en`.
- **Prompt Locale Repair:** When stored prompt is a known default family (EN/TR), including legacy long EN default variants and legacy strict fallback text, normalize to the active UI locale default prompt in settings.
- **Lead Extraction Parsing:** Strip code fences and extract the first JSON object before parsing to prevent empty lead updates.
- **Lead Scoring Transparency:** Weight decisive booking intent higher (+3), add keyword fallback for intent signals, and expose on-demand score reasoning grounded in extracted inputs.
- **Lead Score UX:** Reasoning copy respects the active UI locale and uses localized status labels.
- **Required-Info Display Parity:** Lead list required-field rows/cards must reuse the Inbox required-intake resolver so `required_intake_collected` and fallback values stay consistent across both views.
- **Service Catalog (Hybrid):** Auto-propose services from Skills/KB and require admin approval before the service can be used in extraction.
- **Offering Profile (Catalog Optional):** Maintain an editable service scope summary used when a catalog is absent or incomplete; AI suggestions are generated from Skills/KB in org language using a hybrid format (intro + up to 5 bullets), start pending, can propose updates to existing approved suggestions, and only approved suggestions are used for extraction.
- **Offering Profile Updates:** Conflicting content produces update suggestions that revise the targeted approved suggestion on approval.
- **Offering Profile Context:** Suggestion generation includes the manual summary plus approved/rejected suggestion history for better alignment.
- **Offering Profile Formatting:** Suggestions must include a short intro plus 3-5 labeled bullets; if output is too sparse, retry generation.
- **Non-Business Handling:** Skip lead extraction and scoring for personal/non-business conversations (mark as `ignored`).
- **Insufficient-Info Handling:** Use `undetermined` status for business-context conversations that do not yet contain enough qualification signal.
- **Offering Profile Location:** Manage the Offering Profile under Organization Settings (not AI Settings) to align with org-level scope.
- **Organization AI Control:** Use independent section-level AI toggles for Offering Profile and Required Fields UX modes.
- **AI Suggestions Header:** Keep a single pending indicator label in the accordion header and avoid duplicate right-side count chips.
- **Manual Profile Note:** Keep a persistent custom textarea in Approved suggestions for manual scope notes; store it separately in `offering_profiles` and do not convert it into suggestion cards.
- **Required Fields Sync:** On Skill/KB updates, ask AI for only missing required fields by sending existing fields in prompt context; normalize/dedupe before persisting so manual and AI chips do not duplicate.
- **Required Fields Parsing:** Accept fenced/noisy JSON responses when extracting required fields so KB/Skill-triggered chip generation remains resilient.
- **Required Fields Follow-Up:** For KB/fallback response generation, include required fields, recent customer messages, and the last 3 assistant replies in prompt context so LLM can naturally ask one concise follow-up question when needed and avoid repetitive openings.
- **Webhook RAG Output Cap:** Shared inbound webhook RAG generation path (`src/lib/channels/inbound-ai-pipeline.ts`) must set explicit `max_tokens` to keep output size/cost bounded across Meta channels.
- **Structured Output Mode:** For JSON-producing LLM tasks (lead extraction, required-intake follow-up, offering profile suggestion/repair, required-field proposal), enforce `response_format: json_object` to reduce parse drift and retry churn.
- **Prompt Budget Guardrails:** Truncate oversized knowledge document content before sending profile/intake suggestion context to LLM tasks.
- **LLM Output Caps:** Apply explicit `max_tokens` limits on router, fallback, RAG, summary, lead reasoning, and extraction calls to keep cost and latency bounded.
- **Conversation Continuity:** Use recent multi-turn conversation history in final KB/RAG/fallback generation and apply repeated-greeting suppression when assistant already greeted recently.
- **Inbox Summary Affordance:** Use a filled sparkles AI icon with purple→orange glow plus an inline chevron beside the summary label so open/close state remains explicit in the same control.
- **Settings Layout:** Keep consistent settings column widths and remove duplicate right-column labels so inputs align with section titles.
- **Terminology (TR):** Replace "Lead" with "Kişi" in Turkish UI copy for clarity.
- **Quality Gate Discipline:** Keep lint free of errors (warnings tracked separately), avoid explicit `any` in core product modules, and require green `test` + `build` before closing iterations.
- **Phase 9 QA Strategy (Implemented):** Phase 9 now runs Vitest-based core/unit + WhatsApp webhook integration coverage, Playwright admin smoke E2E, and a reproducible message-handling load baseline (`autocannon`) via `npm run test:unit:core`, `npm run test:integration:whatsapp`, `npm run test:e2e:admin`, and `npm run test:load:messages`.
- **Next.js Interceptor Convention:** Use `src/proxy.ts` (not `src/middleware.ts`) for locale interception on Next.js 16+.
- **Placeholder Source Transparency:** Keep non-MVP Knowledge source options visible in New Content menu but mark inactive options (including PDF upload) with a `Coming Soon` badge.
- **Inbox Query Resilience:** When nested relational conversation reads fail, fall back to flat per-table conversation/message/lead/assignee reads so Inbox does not incorrectly show an empty state.
- **Landing Legal Delivery:** Keep legal documents as versioned markdown source (`legal/*.md`), render `/legal`, `/terms`, `/privacy` from those files, and generate `public/legal_versions.json` during build for external consumption.
- **Static Hosting Fallback:** For Netlify-hosted SPA landing routes, include `public/_redirects` catch-all (`/* /index.html 200`) so direct visits to `/legal`, `/terms`, and `/privacy` do not return 404.
- **Footer Navigation Strategy (Landing):** Keep footer focused on Product and Legal columns only; Product items should deep-link to homepage sections with smooth-scroll behavior (`/#features`, `/#pricing`, `/#how-it-works`).
- **Testimonials Anchor Strategy (Landing):** Footer product scoring item should point to Success Stories via `/#testimonials` and use testimonials-oriented copy in TR/EN.

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
