# WhatsApp AI Qualy — PRD (MVP)

> **Last Updated:** 2026-02-26 (AI Settings now includes a channel-wide bot disclaimer toggle with localized TR/EN editable text (default enabled); outbound bot replies in WhatsApp/Telegram/Instagram now append disclaimer text as a blockquote line (`\n\n> ...`) when enabled; Inbox bot messages now hide this trailing disclaimer from UI while keeping outbound payload unchanged (LF/CRLF tolerant parsing); skill-matched bot replies now carry/display matched `skill_title` metadata in Inbox footer area (object or JSON-string metadata payloads), and raw `skill_id`/UUID values are never shown as footer labels; runtime backfills title from `skills.title` when matcher title is missing; matched skills are evaluated in ranked top-5 order and first successful match is applied directly, and `requires_human_handover=true` always triggers operator escalation for that matched skill (no extra handover-intent guard); AI Settings `Sensitivity` control is grouped under `Behavior and Logic` (not `General`); `Lead extraction during operator` is grouped under `Escalation`; Settings nav/page label is standardized as `Qualy AI`; AI Settings keeps reusable animated tabs with 3 grouped areas: `General`, `Behavior and Logic`, and `Escalation`, where Escalation is split into primary `Automatic Escalation` + `Skill Based Handover` title-only sections; Organization Settings now uses 3 tabs (`General`, `Organization Details`, `Security & Data`) with grouped content; AI/Organization settings content starts directly with tabs (no top intro description); Inbox template picker remains mobile-optimized with underline tabs, WhatsApp-only refresh action, inset chevrons, and smooth tab resize animation; Inbox message-day badges now render from message timestamps (`Today`/`Yesterday`/localized full date) instead of a static `Today` chip; lead status model is simplified to `cold/warm/hot` only and legacy `ignored/undetermined` values normalize to `cold`; Inbox queue now uses `All / Unassigned / Me` tabs with single circular badge presentation (red when attention exists), and conversation rows show compact red `!` attention markers only on `All` tab (hidden on `Unassigned`/`Me`) with tooltip reason details; main sidebar bot status now opens a filled quick-switch dropdown with inline mode explanations and a settings shortcut; collapsed sidebar hover UX now shows immediate custom tooltips for bot/nav controls and the bot dropdown open/close is animated; mobile Inbox header now exposes bot status as a pill that opens a quick-switch bottom sheet with mode explanations; mobile bottom navigation now groups Skills + Knowledge Base under an `AI` tab sheet.)  
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
- MVP reply language policy: if customer message is Turkish, reply in Turkish; otherwise reply in English.
- WhatsApp and Instagram MVP support text messages only and send replies reactively to inbound customer messages (no proactive/template-initiated flow in MVP)
- WhatsApp template send is available only as an explicit manual utility (Settings > Channels and Inbox expired-window action) for review/operational continuation, not as automated conversation runtime behavior.
- Inbox WhatsApp conversations expose template access as a compact in-composer action (right-aligned document icon + label) to keep manual actions in one interaction zone.
- Inbox template picker behavior:
  - all platforms can open predefined templates and insert selected content into composer (`Write a reply`) without auto-send
  - WhatsApp conversations additionally show official WhatsApp template tab in the same picker
  - template picker UI is compact/mobile-first: underline tab navigation, refresh action only on WhatsApp tab, inset-aligned select chevrons, and smooth modal height transition when switching tabs
  - 24-hour expired fallback keeps direct official template send flow (separate modal/action)
- Meta OAuth channel connect starts in a separate popup and returns success/error status to the existing Channels page context (main app tab remains stable)
- Meta OAuth origin resolution prioritizes canonical app URL and supports forwarded-host fallback for Netlify routing consistency.
- Meta OAuth callback diagnostic hint (`meta_oauth_error`) is propagated from popup to main Channels URL for production support troubleshooting.
- WhatsApp OAuth candidate discovery supports fallback via `me/businesses` + business WABA edges when direct user node field access is unavailable in Graph.
- WhatsApp OAuth scope request is limited to `whatsapp_business_management` + `whatsapp_business_messaging` (do not request `business_management` in the WhatsApp connect flow).
- WhatsApp OAuth candidate resolution accepts WABA payloads without `name` as long as `id` + `phone_numbers` are present.
- WhatsApp OAuth candidate discovery now hydrates missing nested phone data via `/{waba_id}/phone_numbers` before failing with missing assets.
- Channels UI shows Meta OAuth popup result feedback (success/failure reason) on return, instead of silent close behavior.
- OAuth authorize URL requests explicit re-consent (`auth_type=rerequest`) to prevent stale/partial previous grants from being silently reused.
- WhatsApp OAuth can optionally include `business_management` via `META_WHATSAPP_INCLUDE_BUSINESS_MANAGEMENT=1` when Meta app setup requires `me/businesses` fallback access for WABA discovery.
- On direct `me/whatsapp_business_accounts` missing-permission errors, fallback to `me/businesses` is attempted only when `META_WHATSAPP_INCLUDE_BUSINESS_MANAGEMENT=1`; otherwise the direct-endpoint permission error is surfaced.
- If direct `me/whatsapp_business_accounts` discovery fails, callback also attempts `debug_token` granular-scope discovery to resolve WABA assets without requiring `business_management`.
- Channels remain independent in runtime/data model (`telegram`, `whatsapp`, `instagram` each has separate channel config + webhook route).
- Bot mode (org-level): Active (replies), Shadow (lead extraction only), Off (no AI processing). Simulator is unaffected.
- Main sidebar bot-status control opens a compact dropdown panel that shows the meaning of `Active / Shadow / Off`, supports quick mode switching when writes are allowed, includes a shortcut to Settings, and uses animated open/close transitions.
- Mobile Inbox header shows a compact bot-status pill; tapping it opens a bottom sheet with `Active / Shadow / Off` meanings, quick mode switching (when writes are allowed), and a shortcut to `Settings > AI`.
- Mobile conversation details sheet should keep desktop-equivalent key-info coverage and order (`Active Agent`, assigned operator when active, channel/platform, received timestamp, credit usage, AI pause control) before lead-extraction details.
- Mobile conversation header should surface quick operational context before opening details (leading channel icon + active-agent chip); channel icon should render directly before contact name without extra framed wrapper, and the inbox bot-status quick-switch sheet should open from the top (matching mobile details-panel motion direction).
- In collapsed desktop sidebar mode, bot status and navigation controls show immediate hover tooltips (custom UI tooltip, not delayed browser title-only behavior).
- Conversation-level AI pause (`conversations.ai_processing_paused`) hard-stops inbound AI automation for that specific contact (no lead extraction, no AI reply) while still persisting inbound messages and unread counters.
- Inbox composer banner mirrors bot mode state: Active shows “assistant active”, Shadow/Off show “assistant not active”.
- Shadow inactive banner copy is compact by default (single-line title + one short explanatory sentence).
- Inbox conversation view should only render message content after selected-thread data is loaded; while loading, show skeletons to avoid stale previous-thread visuals.
- Inbox message timeline must render date separators from message timestamps (`Today`, `Yesterday`, or localized full date) in viewer-local time.
- Simulator includes token usage visibility for debugging
 - Token usage is shown per message and as a conversation total in the simulator
 - Simulator chat visuals are channel-agnostic (no WhatsApp-specific brand mimicry)
 - If no skill/KB match, bot suggests available topics using existing skills/KB titles
- Org-level AI settings control strict/flexible modes, a single sensitivity threshold, and prompt-driven fallback behavior
- In Settings IA, `Sensitivity` is placed under `Behavior and Logic` so matching logic controls are grouped together.
- In Settings IA, `Lead extraction during operator` is placed under `Escalation` so operator handover/extraction rules are grouped in one place.
- In Settings navigation/header, the AI module label is `Qualy AI`.
- Org-level AI settings also control bot-disclaimer behavior: channel-wide enable/disable plus localized TR/EN disclaimer text.
- When disclaimer is enabled, outbound bot replies append one quoted disclaimer line after one empty line (`\n\n> ...`) across WhatsApp, Telegram, and Instagram.
- If localized disclaimer fields are missing/blank at runtime, outbound formatting falls back to default TR/EN disclaimer text.
- Runtime evaluates matched skills in ranked order (top-5) and applies the first successful match directly; there is no extra handover-intent guard.
- If the applied matched skill has `requires_human_handover=true`, runtime always escalates to operator (`switch_to_operator`) and marks human-attention state.
- Inbox rendering rule: if a bot message ends with the standardized disclaimer quote block (`\n\n> ...`), UI strips it from visible bubble content (disclaimer stays in outbound channel payload).
- Inbox skill attribution rule: for bot messages created from skill matches, message metadata carries `skill_title` and UI displays it in the bot footer area; if no skill title exists, attribution is hidden (do not show raw `skill_id`/UUID).
- Live QA-port runtime improvements (response guards + intake-state behavior) are globally enabled by default for all organizations (current + newly created) in the pre-customer stage; no feature-flag gating is used.

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
- Extraction should also return `services` as an array of one or more requested services; `service_type` remains the primary/canonical selection for compatibility.
- If no catalog is enabled, use the org's Offering Profile (service scope summary) to infer fit/intent; `service_type` may remain empty.
- Service type inference prioritizes customer messages, ignores assistant-only suggestions, and respects explicit negations.
- Lead score and status are produced directly by the LLM using the latest 5 customer messages as grounding context, while recent role-labeled turns (`customer`, `owner`, `assistant`) are provided to disambiguate short confirmations (for example, "evet").
- Owner/assistant turns are contextual only: extracted facts must still come from explicit customer statements or customer confirmations.
- The most recent customer message is always injected into the extraction prompt to avoid replication delays.
- Offering Profile consists of manual text plus AI suggestions generated from Skills/KB in the org UI language; suggestions use a hybrid format (short intro + 3-5 bullets), start pending, require admin approval, may propose updates to existing approved suggestions, and only approved suggestions are used for extraction (manual text is never overwritten). Suggestion generation is context-aware (manual summary + approved + rejected suggestions) and retries formatting when output is too sparse. Generation always follows the active UI locale (no dual-language generation). Rejected suggestions can be archived for audit (excluded from AI context), and users can regenerate suggestions whenever there are no pending items.
- Lead extraction context includes both approved AI suggestions and the persistent manual profile note from Organization Settings.
- Organization Settings now uses separate AI toggles per section:
  - Offering Profile: AI off shows manual textarea, AI on shows suggestions workflow.
  - Service List: AI toggle controls service-candidate generation from Skills/KB; suggested services are auto-added directly and AI-origin services are tagged in the list.
  - Turkish UI wording for this section is standardized as `Hizmet listesi` (instead of `Servis listesi`).
  - Required Fields: AI toggle controls AI-tagged required-field suggestions independently.
  - KB “Review/İncele” CTA deep-links into Organization Settings and auto-expands the Offering Profile AI Suggestions accordion.
  - Pending suggestion visibility is shown both on the accordion header and inside the accordion content/tabs.
  - Even when the accordion is collapsed, the header keeps a clear pending indicator so users can find the review queue quickly.
  - Approved suggestions tab supports a persistent custom profile note (editable/removable) that is stored separately from suggestion cards.
- Required Fields AI chips are regenerated when Skill/KB content updates, with normalization and dedupe against existing manual/AI chips (LLM receives current fields and proposes only missing ones).
- KB/fallback replies include one smart follow-up question when required intake fields are still missing from recent customer messages.
- Skill replies remain deterministic; required-fields follow-up prompting currently applies to KB/fallback in Telegram and Simulator.
- Required-intake follow-up now runs with a sector-agnostic intake-state analysis: dynamic minimum scope for short conversations, high-impact missing-field prioritization, and blocked re-ask detection for already collected or explicitly deferred fields.
- Live response guards consume this intake state across fallback and RAG paths, so blocked fields are not re-asked and intake-style questions are suppressed when request mode is non-qualification or when refusal/no-progress constraints are active.
- When no-progress is detected (two consecutive refusal/uncertainty turns), live guards now enforce loop-break output style (concise status summary + soft next step) to avoid repetitive field-collection loops.
- Generic fallback generation now attempts best-available low-threshold KB context grounding before topic-only redirection, reducing overly generic unknown responses.
- KB/fallback prompting also includes the last 3 assistant replies to reduce repeated greetings/openings in consecutive bot turns.
- Final KB/RAG/fallback generation now receives recent multi-turn user+assistant history and known lead snapshot facts (when available) so replies continue naturally, avoid repetitive greetings, and reduce repeated question loops.
- Lead extraction now stores collected required-intake values as `extracted_fields.required_intake_collected` when customer messages clearly provide them.
- Lead extraction applies merge-on-update persistence for collected required fields; `service_type` is not carry-forward merged when latest extraction has no service clue, and `summary` is always tied to the current extraction window (latest 5 customer messages) to prevent stale status-summary mismatch.
- Lead extraction output language is locale-aware (TR/EN): summary and extracted detail values follow customer/locale signal instead of defaulting to English.
- Service inference guard: when recent customer turns are generic greetings/acknowledgements without a clear service clue, extraction must keep `service_type = null` (do not infer solely from profile text).
- Cross-language service acceptance: when recent customer turns contain a concrete service clue that aligns with approved profile/service signals, keep inferred `service_type` even if model output language differs from customer text (for example, customer TR + inferred EN).
- Service canonicalization: when inferred service matches catalog aliases in another language, persist `service_type` as the approved catalog `name` (catalog/UI language source of truth).
- Insufficient-information conversations (e.g., greeting-only/unclear short turns with no qualifying signals) are normalized to low-score `cold`.
- Greeting-only turns are normalized to `cold` even if raw model output marks `non_business=true`, preventing false non-business classification on first-contact hellos.
- Extraction locale precedence is deterministic: explicit preferred locale (UI/manual refresh) > organization locale > customer-message language heuristics.
- Inbox lead details now show collected required fields in an "Important info" card section based on Organization Settings > Required Fields, rendered as plain label-value rows.
- Leads list required-field columns/cards use the same required-intake resolver as Inbox details so `required_intake_collected` values stay consistent across both surfaces.
- Leads service column/cards show AI-extracted `services[]` values from `extracted_fields.services`; if empty, UI falls back to `service_type`.
- Required-info resolution supports manual override precedence (`extracted_fields.required_intake_overrides`) for future editable lead workflows.
- Manual overwrite UI for "Important info" is intentionally deferred; planned behavior is per-field edit in Inbox with source tracking (AI vs manual) and filter-ready structured persistence.
- Non-business conversations are excluded from lead scoring and kept at low-score `cold` (while preserving `non_business=true` as metadata when applicable).
- Manual lead refresh from Inbox is blocked when conversation-level AI pause is enabled for that contact.

---

### 4.5 Human Takeover

**Trigger:** Business owner sends ANY message from their WhatsApp OR claims via Inbox.
 **Behavior:**
- **Explicit State:** `active_agent` switches to 'operator'.
- **Assignee Ownership:** Operator is assigned (`assignee_id`) for ownership/visibility and claim tracking.
- **Inbox Queue Visibility:** Inbox list is segmented into `Me`, `Unassigned`, and `All` queues for faster takeover routing.
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

**Attention Queue Persistence:**
- On escalation (`skill_handover` or `hot_lead`), runtime sets `conversations.human_attention_required=true`, records reason, and stamps `human_attention_requested_at`.
- On operator ownership/send, runtime resolves queue state with `human_attention_required=false`, clears reason, and stamps `human_attention_resolved_at`.
- Inbox `Me` and `Unassigned` tabs show red counters for rows where `human_attention_required=true`.

**Bot Message (Handover):**
- Handover message is appended only when escalation switches the conversation to operator (`switch_to_operator`) or when a skill forces handover.
- Handover message is locale-aware (TR/EN in AI Settings; UI locale selects which message is edited/shown).
- Legacy/default mismatch repair ensures TR UI does not show EN default handover text.
- `notify_only` keeps AI active and does not emit a customer-facing handover promise; only `switch_to_operator` toggles runtime AI silence via `active_agent`.

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
- Connected WhatsApp cards include a Template Tools modal for listing WABA templates and sending a manual test template message (review/debug utility)
- Template Tools modal includes an additional usage guide modal (`How to use`) with concise operator instructions (template refresh, recipient format, variable order, send verification)
- After successful template send, WhatsApp template modal closes automatically.
- Inbox WhatsApp composer includes a compact in-input `Send template` action (document icon + label) so operators can trigger manual template flow without leaving the composer area.
- Inbox WhatsApp conversation header includes a question/help icon inside the blocked reply-window status badge; tooltip explicitly states why free-form reply is unavailable.
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
- Escalation tab uses two primary sections (`Automatic Escalation` and `Skill Based Handover`) with hot lead threshold slider, escalation action cards, and locale-aware editable handover message
- AI Settings information architecture is grouped into three tabs:
  - `General`: bot mode, bot name, sensitivity
  - `Behavior and Logic`: lead extraction during operator, AI prompt
  - `Escalation`: automatic escalation, skill-based handover, escalation action, bot message
- Escalation sections are rendered as title-only headers (no extra subtitle text under section titles)
- AI Settings content starts directly with tabs in the detail pane (intro description text removed)
- Tab navigation uses a reusable settings-tab component with animated content-height transitions for smooth tab switches
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
- Organization settings are grouped into tabs:
  - `General`: organization name + interface language
  - `Organization Details`: offering profile, service list, required fields
  - `Security & Data`: data deletion actions
- Organization settings content starts directly with tabs in the detail pane (intro description text removed)
- Mobile Settings navigation now opens with a dedicated settings list page first, then transitions to selected detail pages with an explicit back action.
- Mobile Settings back action uses client-side route transition (not full-page refresh) to keep mobile flow stable.
- Desktop Settings keeps the inner settings sidebar persistent across sub-route navigation; only the detail pane content swaps and shows loading states.
- Organization AI behavior is section-based:
  - Offering Profile has its own AI toggle for manual vs suggestions workflow.
  - Required Fields has its own AI toggle and keeps manual + AI chips together.

### 5.7 Usage & Billing (Implemented)
- Usage totals are credit-based and sourced from `organization_credit_ledger` (`entry_type='usage_debit'`) so Usage and Plans surfaces stay consistent.
- Monthly usage follows calendar month boundaries in `Europe/Istanbul` (not UTC month boundaries).
- Usage cards show credit-only values (`X,X kredi` / `X.X credits`) for monthly and all-time totals.
- The `Kullanım detayını gör / View usage details` modal is available again and shows per-operation credit consumption.
- The usage details entry action is standardized to `Detayı gör / View details` and uses the same underlined dark-link visual pattern as Plans `Kullanımı gör`.
- Usage details modal is rendered through `document.body` portal overlay so dim/backdrop covers the full app shell, not only billing content.
- Usage breakdown content uses a compact 3-column table (`İşlem`, `Bu ay`, `Toplam`) to avoid repeating operation labels.
- Detailed breakdown includes router, RAG, fallback, summary, lead extraction, and lead reasoning credit totals.
- End-user labels in usage details are jargon-free and operation-focused: AI conversation replies, conversation summaries, lead extraction, and document processing.
- Document-processing usage (service profile suggestion + required info extraction/follow-up) is shown separately by resolving usage metadata source.
- Usage breakdown modal monthly column header uses explicit period label (`This month • <Month YYYY>`) to match the summary card context.
- Every token-consuming AI feature must continue logging `organization_ai_usage`; billing debit ledger remains the source of truth for displayed credit consumption.
- Usage summary loading must paginate `organization_credit_ledger` usage-debit rows and batch `organization_ai_usage` metadata joins; single-page reads are not valid for high-volume organizations.

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
    - paid fee with original billing currency (`TRY`/`USD`) from latest subscription metadata
    - premium status (placeholder)
    - plan status/cycle (placeholder)
    - trial status (placeholder)
  - Organization list supports search and pagination for large tenant sets.
  - Query strategy uses DB-level count/range pagination and batched aggregate reads (no in-memory full-list slicing).
  - Organization message totals use exact per-organization counts and token totals use paginated `organization_ai_usage` reads to stay accurate beyond default single-page (`1000` rows) limits.
  - Usage label on admin organization/user/detail tables is explicit message count (`Toplam Mesaj / Total Messages`) to avoid confusion with billing credit usage.
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
    - monthly total payment amount (TRY) = monthly plan + monthly top-up payment,
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
  - Locked workspace navigation keeps full information architecture visible for orientation, but non-billing destinations are rendered as locked/non-clickable while `Settings` remains available through `Settings > Plans`.
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

### 5.10 AI QA Lab (Implemented v1.2, Manual Trigger + Auto Background Worker)
- A dedicated Admin `AI QA Lab` surface (`/admin/qa-lab`) will run simulator-only quality tests before rollout decisions.
- **Implementation status (v1.2):** `Admin > AI QA Lab` can manually trigger `Quick` / `Regression` runs with a single CTA, enqueue immutable run snapshots in `qa_runs`, and execute runs via lifecycle (`queued` -> `running` -> `completed` / `failed` / `budget_stopped`). The launch flow now dispatches execution for the newly created run ID directly (still queue-first for persistence), which avoids FIFO `batch=1` worker selection accidentally running an older queued job first.
- **Access policy:** QA Lab is restricted to an allowlisted identity (`togayaytemiz@gmail.com`) with `admin` authorization on tenant surfaces; non-allowlisted users (including other admins/system-admins) are blocked from QA Lab routes and run-trigger server actions.
- Runs are manually triggered and immutable (`run_id` snapshot with config/context hash and full artifacts).
- QA findings are advisory only: there is no automatic patch/apply path from QA output into the live assistant stack without explicit human review/approval.
- QA assistant profile is explicitly isolated from live assistant behavior (`qa_lab_only`): QA prompt/guard iterations continue independently and are not auto-promoted to production.
- QA reports include explicit QA assistant profile metadata (`assistant_id`, `profile_version`, `isolation`, `auto_port_to_live`) and the current report schema version (`v2`) for parser/UI compatibility tracking.
- Test cases are not hardcoded:
  - `Generator` LLM creates KB fixtures, scenario blueprints, and customer turns from QA-internal synthetic organization context (not tenant data).
  - Each generated KB fixture must be at least `150` lines.
  - Fixture quality mix is intentionally noisy:
    - `Quick`: `20% clean / 50% semi-noisy / 30% messy`
    - `Regression`: `10% clean / 40% semi-noisy / 50% messy`
- `Responder` is QA-local and skill-free: it uses only generated KB fixture context and fallback behavior (no tenant skill catalog, no tenant KB docs).
- QA responder engagement behavior is conditional: one contextual follow-up question is allowed, but repeated menu-like prompts on consecutive turns are disallowed.
- QA responder reply language is locked to the customer-turn language: Turkish detection now also handles ASCII Turkish phrasing (for example `Sadece iptal edin yeter`) and mixed-language fallback snippets are normalized before final output.
- Live-assistant porting strategy (from QA hardening) is phased: Phase 1 introduces shared response guards on fallback + RAG outputs (language consistency lock, answer-first ordering, refusal-aware intake-question stripping, repeated-engagement suppression, chat-first redirect sanitization, response-surface normalization) before deeper request-mode/intake-loop controls.
- Live-assistant porting Phase 2 foundation is active in intake-followup guidance: policy/procedure and general-information turns now suppress forced lead-intake follow-up pressure, and repeated refusal/no-progress turns include explicit anti-loop guardrails.
- `Judge` LLM is separate from generator and must output evidence-backed findings plus remediation guidance.
- Judge pricing-groundedness rule: if KB/ground-truth does not contain numeric pricing, assistant must not be penalized for refusing exact price; only fabricated price claims are penalized.
- Judge engagement rule: do not penalize a single contextual engagement question; penalize only excessive/repetitive/context-breaking follow-up prompting.
- Judge consistency guard also cross-checks missing-field findings and scenario-level missing-field issues against case-level intake coverage to remove false positives.
- Judge consistency guard now also drops `did not ask` findings when citations show the assistant already asked the relevant field/category by the cited turn.
- Judge consistency guard now also treats `insufficient follow-up / inquiry` phrasing as did-not-ask style and drops top-level findings when cited scenario summaries explicitly state that the corresponding claim was cleared.
- Judge consistency guard now also softens missing-field penalties when the remaining missing field was explicitly asked in the final assistant turn and no customer follow-up turn exists yet.
- Judge consistency guard now also drops generic missing-intake findings when cited cases already show sufficient intake progression by case-level coverage metrics.
- Generator quality gate now enforces minimum actionable lead-intent scenario coverage plus semantic diversity for scenario openings/goals (to avoid template-like repeated scenario packs).
- Run presets:
  - `Quick`: 15 scenarios, 3-6 turns each (preset max 6), hard token budget `100k`
  - `Regression`: 15 scenarios, 3-6 turns each (preset max 6), hard token budget `100k`
- Generator execution retries failed generation attempts (up to 3) and stores attempt-level diagnostics (`finish_reason`, token usage, output snippets, validation error) in failure reports to speed up root-cause analysis.
- Generator max output budget is tuned to avoid JSON truncation at fixture/scenario density targets (current cap: `6400` output tokens).
- Run budget output includes estimated USD cost from token split using `gpt-4o-mini` rates (`input $0.15/M`, `cached input $0.075/M`, `output $0.60/M`) and surfaces this in run list/detail.
- QA execution computes required-intake coverage per scenario (`asked`, `fulfilled`, `missing`) and a handoff-readiness status (`pass`/`warn`/`fail`) so results can be trusted before any live-assistant behavior changes.
- QA simulated assistant now receives required/missing intake context from conversation history and is instructed to avoid re-asking fulfilled fields while collecting high-impact missing fields for both AI response quality and human takeover.
- QA simulated assistant now applies sector-agnostic request-mode routing (`lead_qualification` vs `policy/procedure` vs `general_information`) so policy/procedure questions are answered first and intake prompting is de-prioritized when not necessary.
- Request-mode detection now prioritizes actionable lead intent (`price`, `availability`, `timeline`, etc.) over incidental overlap with policy facts; policy routing from fact-overlap is allowed only when explicit policy/procedure cues are also present.
- QA request-mode routing now prioritizes explicit "general information" intent phrasing (e.g., "genel bilgi", "hakkında bilgi") over generic service-word matches, reducing false qualification-mode routing in cold/resistant informational scenarios.
- QA execution now computes per-scenario effective required-intake fields; policy/procedure and general-information scenarios can legitimately use an empty required-field set so global lead-qualification fields do not create false penalties.
- Intake fulfillment analysis now includes a sector-agnostic semantic rule: when a field was asked and the next customer turn provides a plausible contextual value, the field can be counted as fulfilled even without exact keyword echo.
- Intake fulfillment analysis also infers sector-agnostic *type-like* fields (for example `... türü`, `... cinsi`, `segment`) from natural entity cues such as possessive nouns (`kedim için`) or self-identification (`freelance yazılımcıyım`) without hardcoding specific sectors.
- Broad semantic fallback (\"asked previous turn + informative reply\") is now restricted to truly generic custom fields; categorized fields like budget/timeline/business size must match their own category signals to avoid false fulfillment.
- Explicit refusal/deflection replies (for example "şu an paylaşmak istemiyorum") do not count as fulfillment for that same field.
- QA responder now applies a final blocked-field guard: questions that re-ask `fulfilled` or `deferred` intake fields are stripped from final assistant output.
- QA responder’s explicit clarification prompts are category-based (budget/timeline/service/urgency/age etc.) to avoid sector-specific wording leakage (for example always saying "öğrenci yaşı").
- Intake asked-coverage detection now recognizes more natural question patterns (e.g., "öğrenebilir miyim", "olur mu"), reducing false `asked=0` outcomes.
- When required fields are fulfilled but asked detection is zero (customer proactively provides complete data), asked-coverage is normalized to avoid contradictory readiness signals.
- Communication preference is no longer treated as a mandatory intake requirement in QA Lab; if generated, it is normalized to a more actionable coordination signal (suitable callback time window).
- Generator quality validation now rejects fixtures with low semantic diversity or excessive fallback-line artifacts, preventing repetitive synthetic KBs that distort assistant behavior quality.
- When generator output is structurally valid but low in fixture semantic diversity, QA Lab applies an internal fixture auto-stabilization pass before final validation to improve run continuity without lowering quality thresholds.
- When generator scenario packs are structurally valid but below actionable lead-intent coverage ratio, QA Lab applies an internal scenario auto-stabilization pass (sector-agnostic goal/opening rewrites) before final validation to avoid retry-loop failures.
- Judge consistency normalization now clears `lack of proactive questioning` penalties for `cold + resistant + general_information` scenarios when intake coverage is already sufficient and the assistant stays grounded/non-pushy.
- Score model:
  - Groundedness `40%`
  - Extraction accuracy `35%`
  - Conversation quality `25%` (includes continuity checks)
- Release gate:
  - Any `critical` finding => `FAIL_CRITICAL`
- Critical findings cover:
  - KB-external/contradictory factual claims
  - materially wrong customer guidance
  - safety/policy-risk violations
- Reports are findings-first, include full-text evidence per finding, and include prioritized `Top 5` action recommendations (with fix target, effort, and confidence).
- Run detail reports now also include an automatic **pipeline improvement action set** normalized from Judge `findings + top_actions` (priority, source, impact, rationale, evidence, target layer, effort) for implementation planning.
- Generator output now follows explicit sequence: `KB fixture` creation first, then KB-derived setup (`offering profile summary`, `service catalog`, `required intake fields`), then scenario generation.
- Scenario generation now enforces mixed lead conditions: `hot/warm/cold` temperatures and `cooperative/partial/resistant` information-sharing behavior to test both strong lead capture and weak/casual conversation paths.
- Generator quality gate now hard-fails outputs that miss any required temperature bucket (`hot/warm/cold`) or omit resistant sharing coverage, forcing retry before run execution continues.
- QA conversation execution carries forward per-turn conversation history and uses the same history discipline as production-like assistant turns, while keeping the factual context strictly limited to generated fixture content.
- QA execution now context-adapts synthetic customer turns against the previous assistant question: when the customer turn drifts, it injects a coherent answer (or a single boundary statement for resistant behavior) to keep transcripts logically consistent.
- QA customer-turn adaptation now replaces generic continuation placeholders (for example `Detay sorusu ...`) with aligned field answers when the previous assistant turn explicitly requested a missing intake field.
- QA customer-turn adaptation is domain-aware: service-detail supplements are derived from generated service catalog instead of hardcoded sector phrases, reducing cross-sector drift.
- QA execution now applies history-aware contradiction filtering for synthetic customer turns (for example budget mismatch across consecutive turns when budget was not re-asked), preventing artificial inconsistency loops.
- Urgency-like required fields are normalized to actionable urgency intake semantics and coverage analysis recognizes natural urgency language (for example “hızlı başlamak”, “en kısa sürede”).
- Urgency fulfillment is now value-oriented (for example explicit level or strong urgency intent), not keyword-only mention, so meta-questions about priority do not count as collected urgency data.
- Generator scenario normalization enforces a deeper turn distribution so a meaningful share of scenarios reaches 4+ turns (while keeping the 3-6 hard bounds).
- Judge evidence quality is stricter: findings should include scenario/turn citations for high-confidence reporting.
- Judge intake rule now treats inferable next-turn answers as collected and penalizes re-asking those inferable/already-provided fields.
- Judge consistency guard now validates finding text against cited scenario attributes (hot/warm/cold, cooperative/partial/resistant); mismatched findings are dropped.
- Judge consistency guard also validates quoted field names in findings/scenario summaries against case-level `missing_fields`, dropping or normalizing mismatched field-name claims (for example summary says one field missing while coverage shows another).
- Judge consistency also parses common English field labels used by the judge (for example `timing`, `business size`) and applies the same case-level coverage normalization to findings, scenario issues, and repetitive-question claims.
- Judge scoring consistency guard retries evaluation with strict `0-100` score-scale instructions when score is suspiciously low against healthy intake metrics.
- Judge now returns scenario-level assessments for every executed case (`assistant_success`, `answer_quality_score`, `logic_score`, `groundedness_score`) so each conversation is judged in isolation.
- Scenario-level normalization adds low-information response detection (vague deictic/non-answer replies) and can downgrade `pass` to `warn` with score penalties when such responses appear.
- Scenario-level issue normalization now removes stale missing-field/repetitive-question issue strings when the corresponding summary explicitly says that claim was cleared by transcript/intake-consistency checks.
- Scenario-level normalization now also clears pricing-detail warnings/issues when KB has no concrete numeric pricing and transcript already provides grounded pricing-basis guidance (`scope/workload/duration` dependent pricing).
- QA run-result classification now uses scenario assessments as a secondary gate: if findings are empty but any scenario is `warn/fail`, run result is `pass_with_findings` (not `pass_clean`).
- If Judge omits any scenario-level assessment, QA pipeline fills missing cases with explicit fallback assessments and marks source as `fallback` for transparency.
- Judge output budget now scales with scenario count and automatically retries once in strict mode if initial Judge output is invalid JSON, reducing `judge_skipped_reason=invalid_judge_json` runs.
- Run details expose the full QA artifact chain for manual review: generated KB fixture text (all lines), ground-truth extraction references, derived setup outputs, executed multi-turn conversations, Judge findings, and Judge-derived pipeline action set.
- KB fixture visibility uses compact UI by default (preview-first card) and opens full fixture text in a modal on demand to keep detail pages readable.
- Run details now include a **sequential pipeline self-check** (`pass/warn/fail`) across fixed stages (`KB fixture -> derived setup -> scenario generation -> conversation execution -> judge evaluation`) so the system can self-validate ordered execution quality.
- Service-detail matching in QA responder and intake coverage is intentionally sector-agnostic (e.g., project/development/application/integration/consulting language also counts as service-detail signals, not only literal `hizmet/konu` wording).
- Generic unknown fallbacks (e.g., “net bilgi bulamadım”) are normalized to actionable responses: either one explicit missing-field question (qualification mode, no refusal) or a non-pressuring topic-forward continuation.
- Responder KB context always includes a compact baseline of critical policy facts and service anchors, and consecutive repeated engagement-question patterns are suppressed to avoid turn-over-turn menu loops.
- If the customer explicitly asks to stop contact/messaging, responder output strips engagement follow-up questions for that turn.
- Responder now enforces answer-first ordering for direct user questions by moving concrete answer chunks ahead of intake-style follow-up questions.
- In `general_information` and `policy_or_procedure` request modes, responder strips intake-style questions from final output to avoid form-like pressure.
- If the current customer turn contains explicit refusal/deflection, responder strips intake questions for that turn and continues with available context.
- QA responder now has a no-progress loop guard: when lead-qualification flow stalls for two consecutive non-progress turns, it switches to a short status + minimum-next-field + soft next-step response.
- QA execution now supports turn-level mode promotion: scenarios that start in informational mode can move to `lead_qualification` once customer intent becomes actionable (`price`, `availability`, `booking`, `timeline`, `budget`), so intake expectations and scoring stay realistic.
- Turn-level mode promotion now evaluates the current customer message first (before scenario title/goal context) so policy-themed scenario metadata does not suppress actionable lead intent.
- QA responder now sanitizes external channel redirects (e.g., “web site / phone”) into chat-first continuation in simulation runs, preserving in-chat progression for QA consistency.
- External-contact redirect sanitization now also covers phone/contact-detail variants (e.g., `telefon numaramız`, `iletişim bilgilerinizi paylaşın`, `reach us`) and rewrites them into in-chat continuation.
- Generic unknown fallback normalization now prefers best-available grounded KB detail before asking for more context, reducing “Bu konuda net bilgi bulamadım” dead-ends in lead-like turns.
- Repetitive-question finding consistency now requires same-field repeat evidence (not just any later intake question), reducing false positives when the assistant moves from one field category to another.
- Fixture line sanitation now removes repeated expansion suffix artifacts before diversity checks and fallback expansion, preventing duplicated suffix tails from inflating low-quality KB lines.
- QA intake follow-up state now keeps one retryable deferred-turn window for ignored fields (without pressuring explicit refusals), then defers repeated non-response to avoid insistence loops.
- QA responder now enforces lead-qualification closure: if follow-up missing fields remain and user did not refuse, final turn output is normalized to one explicit field-named question.
- QA responder now guarantees answer-first framing for direct user questions by prepending a grounded KB detail when model output starts with intake-only questioning.
- QA low-information enrichment now avoids filler prefixes (`Ek bilgi:`) and appends concise grounded detail + mini-summary/next-step phrasing.

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

> Finalized: 2026-01-31 (updated with implementation decisions through 2026-02-26)

- **RAG Architecture:** Store raw knowledge documents and embedded chunks separately (`knowledge_documents` + `knowledge_chunks`) to support large content and future file ingestion.
- **Chunking Strategy:** ~800 token chunks with overlap to preserve context, with token-budgeted prompt assembly.
- **AI QA Lab Result Integrity (Implementation v1.5):** `pass_clean` is valid only when both findings are empty and scenario-level assessments are all `pass`; scenario-level `warn/fail` must elevate run result to `pass_with_findings` even with zero normalized findings.
- **AI QA Lab Sector-Agnostic Service Matching (Implementation v1.5):** Service-detail detection in responder/intake coverage must accept broader project/service vocabulary (e.g., `geliştirme`, `uygulama`, `entegrasyon`, `danışmanlık`) instead of requiring only literal `hizmet/konu` wording.
- **AI QA Lab Generic-Fallback Policy (Implementation v1.5):** Generic “unknown detail” replies should be post-normalized into actionable but non-pressuring next steps (explicit missing-field ask only in qualification mode and only when user has not refused).
- **AI QA Lab Mode-Routing Precedence (Implementation v1.6):** Request-mode detection must prioritize actionable lead intent over incidental policy-fact overlap; policy/procedure routing from fact-overlap is valid only with explicit policy/procedure cues, and turn-level promotion must evaluate the latest customer message before scenario metadata.
- **AI QA Lab Consistency-Clear Issue Hygiene (Implementation v1.6):** When scenario summary text explicitly states a missing-field/repetitive-ask claim was cleared by consistency checks, matching stale issue lines must be removed from normalized scenario issues.
- **AI QA Lab Pricing-Detail Consistency (Implementation v1.6):** Pricing-detail penalties must be cleared when KB/ground-truth has no numeric pricing and transcript includes grounded pricing-basis guidance; assistant should not be penalized for refusing unsupported exact numbers.
- **AI QA Lab Actionable Scenario Diversity (Implementation v1.7):** Generator output must include a minimum actionable lead-intent ratio and must pass semantic-duplication limits for scenario openings/goals to prevent repeated low-signal scenario packs.
- **AI QA Lab Final-Turn Missing Softening (Implementation v1.7):** Missing-field claims should be softened/cleared when the remaining field is explicitly asked on the final assistant turn and no customer follow-up turn is available.
- **AI QA Lab Cold-Resistant Proactive Normalization (Implementation v1.8):** `cold + resistant + general_information` scenario-level warnings for generic “lack of proactive questioning” should be cleared when coverage is already sufficient and assistant behavior remains grounded/non-insistent.
- **Usage Source of Truth:** `Settings > Usage` credit totals are read from `organization_credit_ledger` usage-debit records (not token-to-credit previews) to stay consistent with plan consumption.
- **Usage Ledger Read Strategy (Implementation v1.15):** Usage summary reads must be paginated (`range`) across `organization_credit_ledger` and must batch `organization_ai_usage` metadata lookups to avoid Supabase default 1000-row truncation undercount.
- **Admin Organization Usage Read Strategy (Implementation v1.18):** Platform-admin organization message and token totals must be computed with Supabase page-limit-safe reads (exact per-org message counts + paginated per-org `organization_ai_usage` totals), and message-based usage columns must use explicit labels (`Toplam Mesaj / Total Messages`) to avoid credit-usage ambiguity.
- **Usage Persistence Reliability (Implementation v1.17):** `recordAiUsage` is fail-fast; insert failures must surface as errors (no silent swallow) to prevent unnoticed billing/reporting drift.
- **Embedding Cost Visibility (Implementation v1.17):** Embedding calls for skill matching and knowledge retrieval/indexing are recorded in `organization_ai_usage` under `embedding` category for credit/report parity.
- **Runtime Lock Enforcement (Implementation v1.17):** Shared inbound pipeline and Telegram webhook re-check billing entitlement before each token-consuming AI stage (router, RAG, fallback, extraction follow-ups) and stop processing when locked.
- **Document-Processing Lock Policy (Implementation v1.17):** Offering-profile suggestion, service-catalog candidate generation, and required-intake AI extraction are blocked while billing usage is locked.
- **Premium Usage Debit Trigger Safety (Implementation v1.13):** `handle_ai_usage_credit_debit` must cast premium-branch `credit_pool` CASE outputs to `billing_credit_pool_type` enum to avoid `42804` insert failures that would silently stop `organization_ai_usage` writes and conversation credit accumulation.
- **Notify-Only Escalation UX Safety (Implementation v1.13):** Hot-lead `notify_only` must not send customer-facing handover promise text; assistant promise messaging is reserved for operator-switch escalations (including skill-forced handovers).
- **Skill Handover Routing Simplification (Implementation v1.20):** Runtime applies the first successful top-ranked skill match directly (no extra handover-intent guard); if that matched skill has `requires_human_handover=true`, escalation must switch the conversation to operator and persist human-attention queue state.
- **Cross-Language Service Inference Safety (Implementation v1.13):** `service_type` acceptance must include profile-signal matching from customer turns so bilingual extraction output (customer TR, inferred EN) does not drop valid service intent to `Unknown`.
- **Catalog Canonical Service Persistence (Implementation v1.14):** If inferred `service_type` matches catalog aliases, persist the catalog `name` as canonical value so lead service reporting follows approved org service labels.
- **MVP Reply Language Safety (Implementation v1.14):** RAG/fallback reply prompts must enforce `Turkish` for Turkish customer messages, otherwise `English`, to keep outbound response language aligned with customer input.
- **Live Assistant Intake-State Runtime (Implementation v1.16):** Required-intake follow-up decisions are sector-agnostic and stateful at runtime: short conversations use dynamic minimum intake scope, high-impact missing fields are prioritized, already collected or explicitly deferred fields are blocked from re-ask, and the same state is applied in response guards (fallback + RAG) to suppress intake pressure in non-qualification/refusal/no-progress turns.
- **Usage Month Window:** Usage monthly grouping uses calendar month in `Europe/Istanbul` to match business-facing monthly reporting expectations.
- **Font Strategy (Initial):** Use system fonts in the app shell to avoid build-time Google Fonts fetches in CI.
- **Font Update:** Adopt Plus Jakarta Sans as a self-hosted local font (`public/fonts/plus-jakarta-sans`) and remove Google Fonts CSS `@import` to avoid runtime external font fetching.
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
- **AI Settings IA (Implementation v1.19):** Group AI settings into three reusable tabs (`General`, `Behavior and Logic`, `Escalation`) and drive tab transitions with a shared animated settings-tabs component so future settings pages can reuse the same interaction pattern.
- **Organization Settings IA (Implementation v1.19):** Group organization settings into three reusable tabs (`General`, `Organization Details`, `Security & Data`) so org identity/language, lead-qualification defaults, and destructive data operations stay clearly separated.
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
- **Knowledge Base QA Fixture Strategy (Implementation v1.15):** Keep domain-specific KB fixture documents with explicit expected extraction outputs (`Hizmet Profili`, `Gerekli Bilgiler`, `Hizmet listesi`) so non-regression checks can be run manually on real content samples; first fixture path is `docs/kb-fixtures/2026-02-dis-klinigi-kb-cikartim-test-fixture.md`.
- **Chunk Overlap Alignment:** Overlap prefers paragraph/sentence boundaries and drops overlap when it would exceed max tokens.
- **i18n Enforcement:** Automated checks for hardcoded UI strings and EN/TR key parity wired into lint.
- **Billing Terminology (TR):** All user-facing Turkish billing/paywall copy uses `Ücretsiz deneme` wording instead of `Trial`.
- **Platform Admin Context:** Persist active admin-selected tenant context via `active_org_id` server cookie so tenant pages resolve a single active organization consistently.
- **System Admin Default Landing Rule:** Root dashboard entry (`/[locale]`) resolves to `/admin` when a system admin has no explicit organization selection (`active_org_id` absent/non-explicit), and resolves to `/inbox` only when explicit org impersonation exists.
- **Platform Admin Navigation Performance:** Resolve system-admin org context in slim mode (active org only) during normal route transitions, and lazy-load full org options only when the sidebar picker is opened.
- **System Admin Internal Org Exclusion:** Exclude internal QA tenant (`AI QA LAB` / `ai-qa-lab`) from system-admin organization picker lists, fallback active-org resolution, and platform-level admin aggregates/read-model organization surfaces so admin panel views reflect customer tenants only.
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
- **Top-Up Modal Readability:** In one-time top-up option rows, the right-column price should use emphasized typography and vertical centering for faster visual comparison between packs.
- **Monetization Rollout Order:** Finalize pricing strategy and trial model first, then implement checkout/payments and entitlement enforcement (avoid shipping payment flows before policy decisions are locked).
- **Trial Go-To-Market Model (Pre-Pilot):** Start with trial-only onboarding (no freemium) to reduce ongoing abuse vectors and keep support/sales qualification focused.
- **Starter Pricing Posture (Pre-Pilot):** Keep first paid plan in low-entry territory (~USD 10 equivalent, TRY-localized) and shift expansion to credit top-ups/upper tiers after conversion baseline is validated.
- **Pricing & Credit Calibration Guide (Pre-Pilot):** `docs/plans/2026-02-16-pricing-credit-strategy-guide.md` is the policy reference for trial-credit calibration (`100/120/200/250/1000` comparison), model-cost math, Lovable-like `upgrade-first` monetization structure (tier ladder + premium burst top-up), and customer-facing conversation-equivalent packaging ranges.
- **Pricing Catalog Rollout (Implementation v1.5):** `/settings/plans` now shows final package/top-up ladder with safe monthly conversation ranges; system-admin manages both TRY/USD price points from `/admin/billing`.
- **Automatic Currency Region Rule (Implementation v1.12):** Organization billing region is persisted at signup from request-region signals (`x-vercel-ip-country`/`cf-ipcountry`; fallback `Accept-Language`) into `organizations.billing_region`. `Settings > Plans` renders package currency from this persisted organization value (`TR` -> `TRY`, non-TR -> `USD`) for consistent tenant-wide pricing.
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
- **Workspace Hard-Lock Navigation UX (Implementation v1.8):** In locked mode, desktop/mobile main navigation and the Settings inner sidebar remain fully visible, but non-billing destinations are disabled with locked affordances. `Settings` stays the active entry and resolves to `Settings > Plans`.
- **Workspace Hard-Lock Bot Status UX (Implementation v1.10):** In locked mode, main sidebar bot status is displayed as `Off/Kapalı` regardless of stored bot mode, so users do not see a misleading `Shadow/Dinleyici` state while replies are blocked by lock policy.
- **Sidebar Bot Quick Switch UX (Implementation v1.21):** Main sidebar bot status uses a filled dropdown trigger; the opened mini panel must list `Active / Shadow / Off` with short meaning text, allow instant mode switching when tenant writes are allowed, keep a Settings shortcut for detailed configuration, and animate both open and close transitions.
- **Collapsed Sidebar Tooltip UX (Implementation v1.21):** In collapsed desktop sidebar mode, bot status, nav items, org switch, and collapse toggle must expose immediate hover tooltips for fast identification without requiring expansion.
- **Billing Ledger Table Layout Stability (Implementation v1.9):** `Settings > Usage` credit ledger uses fixed column sizing so collapsed and expanded row modes keep identical column widths.
- **TR Payment Provider Strategy (Locked v1):** Prioritize a TR-valid recurring provider (Iyzico first, PayTR alternative); use Stripe only with a supported non-TR entity/account model.
- **WhatsApp Cost Modeling Baseline:** For Meta Cloud API MVP, treat inbound webhook traffic and in-window free-form replies as zero template fee; meter WhatsApp variable cost only when sending template messages (country/category-dependent).
- **Platform Admin Read Models:** Use DB-backed pagination/search, aggregate RPC totals, and batched org metrics; avoid in-memory filtering, full-table scans, and N+1 fan-out for admin org/user list-detail pages.
- **Admin Organization Paid Fee Source (Implementation v1.15):** `/admin/organizations` resolves `Paid Fee` from the latest `organization_subscription_records.metadata` per org and renders original billing currency (`TRY`/`USD`) without cross-currency conversion.
- **Admin Dashboard Monthly Total Payment (Implementation v1.15):** `/admin` plan-metrics section exposes `Total Monthly Payment (TRY)` as `monthlySubscriptionAmountTry + monthlyTopupAmountTry` for the current admin scope.
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
- **Bot Disclaimer (Implementation v1.20):** Store org-level `bot_disclaimer_enabled` + localized `bot_disclaimer_message_tr/en` in AI settings; when enabled, append a quoted disclaimer (`\n\n> ...`) to outbound bot replies for WhatsApp/Telegram/Instagram.
- **AI Settings Grouping & Naming (Implementation v1.21):** Place `Sensitivity` under `Behavior and Logic` and standardize Settings navigation/page label as `Qualy AI`.
- **AI Settings Escalation Grouping (Implementation v1.22):** Place `Lead extraction during operator` under `Escalation` to keep operator takeover behavior with escalation controls.
- **Inbox Message Contrast:** Bot-authored inbox messages use a dark-violet bubble with light text to keep bot replies easy to scan against operator and contact messages.
- **Inbox Message-Day Separator:** Render day chips from each message timestamp (`Today`/`Yesterday`/localized full date) instead of showing a static label.
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
- **Conversation-Level AI Pause Control:** Add per-contact `ai_processing_paused` toggle in Inbox details; when enabled, inbound runtime still stores customer messages but skips both lead extraction and AI replies, and manual lead refresh is blocked.
- **AI Pause Details Layout:** Place conversation-level AI pause control directly under total AI credits in Key Information and hide lead panel content while this pause is enabled.
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
- **Inbox Relative Time Hydration Safety:** Format list relative-time labels against a deterministic render-time base (`renderedAtIso`) instead of direct `now` calls in SSR output, then refresh on client interval.
- **Inbox Lead Realtime:** Include `leads` in realtime publication and subscribe to status changes so list indicators update without manual refresh.
- **Inbox Lead Payload Normalization:** Normalize nested one-to-one `leads` relation payloads to a stable array shape during conversation-list reads so chip rendering is consistent after page reloads.
- **Inbox Realtime Auth Sync:** Bootstrap realtime auth from session, fall back to `refreshSession()` when missing, and re-apply tokens on auth state changes to avoid stale subscriptions.
- **Inbox Summary:** Generate summaries on-demand only (no background refresh or cache), show a single-paragraph summary in an accordion, and only reveal refresh after the summary finishes while showing a tooltip when insufficient messages.
- **Inbox Summary Threshold:** Enable summary when there are at least `3` customer messages; bot message is optional.
- **Inbox Summary Reopen Behavior:** Closing and re-opening the summary panel should trigger a fresh summary generation (without requiring manual refresh).
- **Inbox WhatsApp Replyability UX (MVP):** For WhatsApp conversations, show a far-right status indicator only when free-form reply is blocked (`reply unavailable`); show reason via tooltip and lock composer/send with a short overlay notice.
- **Inbox Agent-State Rule (MVP):** WhatsApp 24-hour send lock must not mutate `active_agent`; conversation control state remains unchanged.
- **Inbox Scroll-to-Latest CTA:** Show an animated jump-to-latest button only when chat is away from bottom; anchor it on the composer divider with subtle gray styling.
- **Inbox Composer Spacing:** Keep a tight vertical rhythm between the summary control row and assistant-state banner to reduce unused space.
- **Inbox Assistant Banner Style Parity:** Active assistant banner should use the same spacing/icon/text hierarchy as inactive banner for visual consistency (keep existing active/inactive colors unchanged).
- **Inbox List Header Surface:** Keep the Inbox conversation-list header on the same surface tone as the list column (non-white) for consistent sidebar visuals across dashboard modules.
- **Inbox Conversation Switch Loading:** Track selected-thread id separately from loaded-thread id and render skeletons during switches so avatar/details do not update against stale previous-thread messages.
- **Mobile Inbox Flow:** On mobile, keep Inbox as app-style single-pane navigation (`list -> conversation`), with an explicit back action and a header details toggle for compact contact/lead visibility.
- **Mobile Navigation Shell:** Hide desktop sidebar on mobile and use a fixed bottom navbar (`Inbox`, `Kişiler`, `AI`, `Diğer`); the `AI` tab opens a sheet with `Yetenekler` + `Bilgi Bankası`, and `Diğer` opens quick actions (`Simülatör`, `Ayarlar`, `Signout`).
- **Mobile More Menu Simplification:** Do not duplicate `Plans/Billing Usage` links in `Diğer`; billing routes are accessed from Settings navigation to avoid redundant entry points.
- **Mobile Settings Back Behavior:** In settings detail pages, back action should return to `/settings` without adding extra history entries (prevent back/forward oscillation loops).
- **Mobile Navigation Performance:** Prefetch key bottom-nav destinations (`/inbox`, `/leads`, `/skills`, `/knowledge`, `/simulator`, `/settings`) with short delayed scheduling in production; skip manual warmups in development to avoid persistent compile churn.
- **Desktop Settings Navigation Performance:** Prefetch settings destinations from main sidebar/settings shell with short delayed scheduling in production, and route the desktop main Settings entry to `/settings/ai` while preserving mobile quick action target `/settings`.
- **Dashboard Request Dedupe:** Resolve active organization context and billing snapshot through request-level memoization so shared layout/page guards do not repeat the same DB lookups in a single navigation.
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
- **Channels Verification Scope (MVP):** Use live channel connection status + debug diagnostics in Settings > Channels; allow a lightweight WhatsApp-only template review utility for App Review evidence (manual list + manual test send).
- **Messenger Brand Icon:** Use `public/messenger.svg` for Facebook Messenger placeholder visuals in Channels settings.
- **Meta Channel Onboarding (MVP):** Use Meta OAuth start/callback routes with signed state validation; do not require manual token entry in channel settings UI.
- **Meta OAuth Redirect Robustness:** Carry a signed/safe `returnTo` channels path in OAuth flow so error/success callbacks return users to their active channel settings route.
- **WhatsApp OAuth Scope Baseline:** Default WhatsApp OAuth scopes to `whatsapp_business_management` and `whatsapp_business_messaging`; omit `business_management` to prevent invalid-scope popup failures on newly provisioned Meta apps.
- **WhatsApp OAuth Candidate Parsing (Resilience):** Do not hard-require WABA `name` during connect; treat `id + phone_numbers` as sufficient to avoid false `missing_whatsapp_assets` failures.
- **WhatsApp OAuth Phone-Number Hydration:** If WABA list responses omit nested `phone_numbers`, resolve `phone_number_id` through `/{waba_id}/phone_numbers` before returning missing-assets status.
- **Meta OAuth UX Feedback:** Persist popup return status in URL (`meta_oauth*`) and surface localized success/failure messages in Channels UI for deterministic troubleshooting.
- **Meta OAuth Grant Refresh:** Include `auth_type=rerequest` in authorize URL so Meta re-prompts required permissions when earlier grants are missing/declined.
- **Meta OAuth Error Diagnostics:** Include Graph endpoint path in thrown server errors to quickly identify which permission-protected edge is failing.
- **WhatsApp OAuth Scope Toggle:** Keep WhatsApp default scope set minimal; enable optional `business_management` via env (`META_WHATSAPP_INCLUDE_BUSINESS_MANAGEMENT=1`) for tenants/apps that require `me/businesses` fallback during WABA discovery.
- **Missing-Permission Fallback Guard:** Do not auto-fallback from direct WABA endpoint to `me/businesses` on missing permission unless `business_management` scope toggle is enabled, avoiding invalid-scope dead loops on restricted app configurations.
- **Debug Token WABA Discovery Fallback:** When direct WABA endpoint discovery throws permission errors, attempt `debug_token` granular-scope resolution (`target_ids`) before failing the callback flow.
- **Meta Webhook Architecture:** Keep channel webhook routes separate (`/api/webhooks/whatsapp`, `/api/webhooks/instagram`) and reuse a shared inbound AI processing pipeline for consistent Skill → KB/RAG → fallback behavior.
- **WhatsApp MVP Channel Strategy:** Implemented via Meta Cloud API with OAuth-based channel setup (auto-resolved `phone_number_id` + `business_account_id`), text-only inbound handling, webhook signature verification, and reactive replies only (no proactive/template-first messaging in MVP).
- **WhatsApp Template Scope (MVP):** Keep template messaging out of automated runtime scope. If the 24-hour free-form window is closed, inbox free-form outbound remains blocked until new inbound message; template send is limited to explicit manual operator actions (Channels utility and Inbox expired-window modal).
- **Instagram MVP Channel Strategy:** Implemented via Meta Instagram Messaging API with OAuth-based channel setup (auto-resolved `page_id` + `instagram_business_account_id`), text-only inbound handling, webhook signature verification, and reactive replies only (first turn must come from customer inbound message).
- **Type Safety (Build):** Align KB router history role types and guard strict array indexing to keep TypeScript builds green.
- **Skills UI Simplification:** Use a single skills list (no Core/Custom split), keep search above the list, and keep the add CTA visible in the header.
- **Skills Embedding Source:** Generate skill embeddings from both skill title and trigger examples; regenerate on title/trigger changes.
- **Skills Icon Consistency:** Reuse the sidebar Skills icon in the Skills empty-state panel for visual consistency.
- **Skills Embedding Backfill:** When skills exist without embeddings (e.g., manual SQL inserts), regenerate missing skill embeddings on first skills load per organization/runtime and avoid repeating this heavy maintenance on every navigation.
- **Skills/Knowledge Route Dynamism:** Avoid explicit `force-dynamic` flags on dashboard Skills/Knowledge routes when runtime auth/cookies already make them dynamic; keep route options minimal to reduce unnecessary dev/build overhead.
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
- **Skill Handover False-Positive Guard (Implementation v1.23):** For matched skills with `requires_human_handover=true`, require extra runtime intent validation (explicit escalation intent, high-confidence bypass, or strong lexical overlap with matched trigger/title). If validation fails, skip the skill response and continue KB/fallback routing.
- **Skill Candidate Evaluation Order (Implementation v1.24):** Evaluate top-5 matched skills sequentially and select the first valid candidate; do not stop at a rejected top match.
- **Inbox Bot Message Presentation (Implementation v1.24):** Hide trailing disclaimer quote text in Inbox bubble rendering (while keeping outbound payload intact); show `skill_title` attribution in footer only for skill-matched bot replies.
- **Handover Locale Repair:** When legacy/default values create EN text in both localized fields, normalize to TR default for `hot_lead_handover_message_tr` and EN default for `hot_lead_handover_message_en`.
- **Prompt Locale Repair:** When stored prompt is a known default family (EN/TR), including legacy long EN default variants and legacy strict fallback text, normalize to the active UI locale default prompt in settings.
- **Lead Extraction Parsing:** Strip code fences and extract the first JSON object before parsing to prevent empty lead updates.
- **Lead Scoring Transparency:** Weight decisive booking intent higher (+3), add keyword fallback for intent signals, and expose on-demand score reasoning grounded in extracted inputs.
- **Lead Score UX:** Reasoning copy respects the active UI locale and uses localized status labels.
- **Required-Info Display Parity:** Lead list required-field rows/cards must reuse the Inbox required-intake resolver so `required_intake_collected` and fallback values stay consistent across both views.
- **Service Catalog (Hybrid):** Auto-propose services from Skills/KB and add them directly to the active service list when Service List AI mode is enabled.
- **Service Candidate Generation (AI):** When Service List AI mode is enabled, extract one or more candidate services from Skill/Knowledge content and auto-apply them without manual review queue.
- **Multi-Service Extraction:** Lead extraction can capture one or many services in `services[]`; all accepted values are canonicalized to the approved service catalog names when aliases/language variants match.
- **Service List UI (MVP):** Organization Settings includes an editable service-chip list (manual add/remove), per-org AI service-generation toggle, and AI-origin tags (no approve/reject actions).
- **Offering Profile (Catalog Optional):** Maintain an editable service scope summary used when a catalog is absent or incomplete; AI suggestions are generated from Skills/KB in org language using a hybrid format (intro + up to 5 bullets), start pending, can propose updates to existing approved suggestions, and only approved suggestions are used for extraction.
- **Offering Profile Updates:** Conflicting content produces update suggestions that revise the targeted approved suggestion on approval.
- **Offering Profile Context:** Suggestion generation includes the manual summary plus approved/rejected suggestion history for better alignment.
- **Offering Profile Formatting:** Suggestions must include a short intro plus 3-5 labeled bullets; if output is too sparse, retry generation.
- **Non-Business Handling:** Skip lead scoring for personal/non-business conversations (status remains `cold`).
- **Insufficient-Info Handling:** Business-context conversations without enough qualification signal remain `cold` (low-score normalization).
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
- **AI QA Lab Strategy (Implemented v1.4):** Manual admin-triggered, simulator-only, two-model (`Generator` + `Judge`) QA loop with non-hardcoded scenario generation, 150+ line noisy KB fixtures, full-text evidence logging, findings-first reports, and critical-fail release gate. Current implementation includes queue-first run launch with automatic background worker execution, lifecycle persistence (`queued/running/completed/failed/budget_stopped`), full artifact-chain visibility in run details, Judge-to-pipeline action-set reporting, generator retry diagnostics, increased Quick preset token budget (`100k`), and QA-local responder execution that is tenant-independent (`synthetic context`, `no skill layer`, `generated KB + fallback only`).
- **AI QA Generator Retry Decision (Implemented v1.3):** Generator stage retries failed attempts up to `3` times with explicit retry feedback and stores per-attempt diagnostics (`finish_reason`, usage, output snippets, validation error) in `report.error.details` for failed runs.
- **Next.js Interceptor Convention:** Use `src/proxy.ts` (not `src/middleware.ts`) for locale interception on Next.js 16+.
- **Placeholder Source Transparency:** Keep non-MVP Knowledge source options visible in New Content menu but mark inactive options (including PDF upload) with a `Coming Soon` badge.
- **Inbox Query Resilience:** When nested relational conversation reads fail, fall back to flat per-table conversation/message/lead/assignee reads so Inbox does not incorrectly show an empty state.
- **Landing Legal Delivery:** Keep legal documents as versioned markdown source (`legal/*.md`), render `/legal`, `/terms`, `/privacy` from those files, and generate `public/legal_versions.json` during build for external consumption.
- **Static Hosting Fallback:** For Netlify-hosted SPA landing routes, include `public/_redirects` catch-all (`/* /index.html 200`) so direct visits to `/legal`, `/terms`, and `/privacy` do not return 404.
- **Footer Navigation Strategy (Landing):** Keep footer focused on Product and Legal columns only; Product items should deep-link to homepage sections with smooth-scroll behavior (`/#features`, `/#pricing`, `/#how-it-works`).
- **Testimonials Anchor Strategy (Landing):** Footer product scoring item should point to Success Stories via `/#testimonials` and use testimonials-oriented copy in TR/EN.
- **Meta Data Deletion Compliance (Landing):** For Facebook/Meta App Review, publish a public `Data Deletion Instructions URL` page with explicit deletion steps, scope, SLA, and support channel; initial deletion scope is contact-level records, while full organization deletion remains out of MVP self-service scope.
- **In-App Self-Service Deletion Scope (MVP):** `Settings > Organization` allows admins/owners to delete organization contact-level records after account-password confirmation in a modal; deletion removes conversations, cascaded messages/leads, and conversation-linked AI usage metadata rows.

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
