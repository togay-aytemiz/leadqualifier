# WhatsApp AI Qualy — Roadmap

> **Last Updated:** 2026-03-25 (Calendar / scheduling / booking now ships with a full-width `/calendar` workspace, `Tercihler > Takvim` for booking rules, `Entegrasyonlar > Uygulamalar` for Google Calendar management, compact business-hour rows, inline timing help, simplified Google connection cards, a single calendar-settings entry in the workspace header, knowledge-aligned calendar header action sizing with a dark `Yeni randevu` CTA, modal-localized manual booking validation for past-date and slot-availability failures, client-side buffered calendar navigation for faster day/week/month switching, mutation-time cache invalidation, AI scheduling continuity across follow-up availability questions, stricter booking-intent gating, deterministic human handoff on scheduling failures, minimum-notice enforcement across slot generation + exact-slot checks + booking writes, safe Google disconnect cleanup for mirrored future events, per-booking duration override and customer-email capture in the booking modal, shared select-field visual cleanup, full-width `Settings > Channels` gallery usage, Turkish-first copy cleanup, Instagram webhook/page-id hardening with pending-vs-verified connection state, consistent readiness copy across channel cards and manage pages, Instagram Login webhook provisioning during connect, direct-Instagram outbound DM sync into Inbox with business identity + avatar hydration, persisted Instagram share/story preview URLs for inline Inbox rendering when Meta includes a previewable asset link, limited unsupported-payload debug snapshots for Instagram attachment diagnosis, unsupported Instagram attachment fallback copy, direction-aware outbound media preview labels, stricter Instagram request-badge classification, hidden Instagram secondary ids in details, aligned billing plan CTA rows, conservative generic required-intake fallback matching plus semantic custom-field resolution for Inbox/Leads, inbox refresh latency hardening with parallel Instagram contact hydration + duplicate lead-fetch removal on thread open + targeted inbox query indexes, title-row Inbox list filtering for unread + customer-score views with reset support, colored score chips, and read-on-leave behavior, direct post-auth landing, app-shell latency hardening via deferred sidebar hydration plus targeted prefetch rebalancing, non-blocking Settings shell pending-suggestion hydration with stale-response guards, lighter shell refresh IO via unread existence checks, desktop-only sidebar subscriptions, settings-link prefetch reduction, route-scoped dashboard i18n payloads, self-healing inbox sidebar preview hydration for missed realtime message inserts, deploy-time chunk self-recovery, dashboard-wide intent-based route warming with immediate skeleton bridging, optimistic sidebar/mobile/settings active-state feedback, lightweight post-auth route resolution without admin org validation, a root dashboard loading boundary, slim active-org dashboard refreshes, and non-blocking inbox thread-open hydration with parallel message/lead fetch.)
> **Update Note (2026-03-25):** Dashboard latency hardening now also covers state feedback and auth entry. Main sidebar/mobile/settings active state switches optimistically on click, post-auth route resolution no longer validates organization context before starting the client transition, and the dashboard route group now has a root loading boundary for earlier shell feedback.
> **Update Note (2026-03-25):** `/calendar` header actions now match the `/knowledge` workspace sizing. `Takvim ayarları` uses the standard secondary button footprint, and `Yeni randevu` uses the dark primary CTA instead of the old blue button.
> **Update Note (2026-03-25):** Manual booking failures on `/calendar` now surface inside the booking modal instead of only in the page-level alert. Past-date attempts get explicit localized messaging, and common availability/conflict/booking-disabled failures are mapped away from raw English backend errors.
> **Update Note (2026-03-25):** Calendar detail IA is now simpler: week/day/agenda booking cards no longer show the `Onaylı` status chip, the desktop right-side booking detail panel is removed, and clicking a booking opens a shared detail modal with full-size footer actions.
> **Update Note (2026-03-25):** Calendar detail browsing is now consistent across all operator views. Day, week, month, and agenda bookings all open the same detail modal on click, and month cells now surface customer identity plus the visible start-end time range instead of only the service title/start time.
> **Update Note (2026-03-25):** Calendar booking cards now share one visual language across day/week/month/agenda. Non-month views dropped the inner booking-card borders in favor of background-only surfaces, while the week `today` column still uses the darker filled variant so the same design system reads consistently in every view.
> **Update Note (2026-03-25):** The remote Supabase project has been brought up to the repo migration head (`00095`–`00098`), which includes the calendar booking schema update required for manual duration override and customer email writes. The booking modal footer now also uses the standard non-compact button size.
> **Update Note (2026-03-25):** Instagram share-style DMs and story replies should no longer be forced into a blind `Open Instagram` fallback when Meta already includes a previewable URL in the webhook payload. Qualy now persists share/story preview URLs from Instagram webhook attachments or `reply_to.story`, attempts inline image rendering when the URL looks directly previewable, and keeps the explicit fallback only for genuinely non-previewable content.
> **Update Note (2026-03-25):** Unsupported Instagram attachment placeholders now persist a limited debug snapshot in message metadata (`mid`, `is_unsupported`, `attachments`, `reply_to`) whenever no previewable asset URL is available, so support can inspect what Meta actually delivered without storing the full webhook body.
> **Update Note (2026-03-25):** Inbox list filtering now lives behind a single title-row filter icon instead of a persistent second row. Operators can filter by `All / Unread` and `All / Hot / Warm / Cold`, clear filters with one inline `Sıfırla / Reset` action, use colored customer-score chips with stronger selected states, and keep unread threads visible until they manually switch to another conversation.
> **Update Note (2026-03-25):** Browser tab titles should now remain stable across App Router transitions. Route layouts/pages publish localized Next metadata titles for dashboard and auth surfaces, `calendar` is part of the shared tab-title route map, and Inbox keeps the unread-dot overlay without relying on a client-only base title race.
> **Update Note (2026-03-24):** Dashboard hard refresh should not block on a full accessible-organization list for normal tenant users. Active organization context now defaults to a slim active-org-only path, while Inbox thread-open fetches latest messages and lead snapshot in parallel and defers sender-profile hydration plus mark-read persistence until after first paint.
> **Update Note (2026-03-23):** Implemented targeted performance optimizations including enabling app-shell prefetching via `manual-prefetch`, reducing redundant database query overhead by reusing `supabase` client instances in dashboard workspace protection (`Leads`, `Inbox`, `Skills`, `Calendar`), and memoizing the 120KB i18n `messages.ts` import via React `cache()` to prevent duplicate parsing overhead per request.
> **Update Note (2026-03-23):** The app must self-recover from deploy-time Next chunk mismatches. If the browser hits a real `/_next/static/...` chunk 404 / `ChunkLoadError`, the root shell now performs at most one cache-busting reload instead of leaving the user on the generic client exception screen.
> **Update Note (2026-03-23):** Dashboard route switches must feel immediate in production too. Desktop sidebar, mobile nav, and Settings inner navigation now warm the primary dashboard route families on explicit user intent (`hover/focus/touch/click`), and the dashboard shell shows the matching route skeleton immediately until Next commits the destination loading state or page payload.
> **Update Note (2026-03-22):** Required-field population must stay sector-agnostic. Extraction now prefers exact configured required-field labels in `required_intake_collected`, and Inbox/Leads resolution may semantically match equivalent AI-collected or manual-override keys so approximate or high-confidence implied customer answers can directly fill custom fields without sector-specific hardcoding.
> **Update Note (2026-03-22):** Inbox media preview copy must follow message direction. Outbound media turns now use localized `sent/gönderildi` labels in sidebar previews and media cards, while inbound media keeps the existing `received/alındı` wording.
> **Update Note (2026-03-21):** Dashboard root no longer ships the full locale catalog on every route. The shared shell now carries only `auth/common/nav/mainSidebar/aiSettings`, while route-group layouts add heavier namespaces only where needed (`inbox`, `settings`, `knowledge`, `admin`, `calendar`, etc.), shrinking the root Turkish dashboard message payload from about `112 KB` raw to about `14.6 KB`.
> **Update Note (2026-03-21):** Remaining shell refresh work now avoids duplicate unread pressure and hidden-sidebar IO. Desktop `MainSidebar` is the primary unread source, unread checks use existence reads instead of exact counts, the tab-title path follows shared desktop unread state instead of opening its own realtime channel there, and `Settings` inner navigation no longer prefetches every visible destination on first paint.
> **Update Note (2026-03-21):** Inbox sidebar previews now self-heal when realtime conversation updates outrun or replace message-insert events. Thread refreshes reuse fetched history to refresh the list preview, and conversation-row realtime updates trigger a lightweight preview re-hydration only when `last_message_at` advances beyond the cached preview state.
> **Update Note (2026-03-21):** `Settings` route transitions no longer wait on server-side pending-suggestion counts. The shell now renders after org/billing access resolution, hydrates the organization badge count on the client, ignores stale async results during org switches, and keeps settings prefetch targets stable so badge updates do not retrigger warmup waves.
> **Update Note (2026-03-20):** Inbox list refresh and conversation-open latency now avoids sequential Instagram contact hydration on the critical path. Profile fetches run in bounded parallel mode with timeout budget, conversation switch flow no longer triggers duplicate lead refresh requests, and new DB indexes target conversation ordering plus message pagination/request-fallback existence queries.
> **Update Note (2026-03-20):** App entry and dashboard navigation now avoid extra auth/shell work on the critical path: successful login/signup sessions redirect straight to the localized final workspace route, main sidebar defers non-critical billing/pending/bot-mode reads until after first paint, the hidden desktop mobile nav no longer hydrates billing state, and prefetch is now selectively re-enabled for primary workspace/settings navigation instead of being blanket-disabled across the shell.
> **Update Note (2026-03-20):** Instagram `seen/read` system events no longer create false Inbox recency/unread state and no longer render orphaned day separators (`Today` with no visible message) in conversation timeline.
> **Update Note (2026-03-20):** Direct Instagram-app reply identity now retries canonical Instagram account IDs when webhook `echo` events arrive via `page_id`, so outgoing Inbox bubbles can still resolve the connected account username/avatar instead of degrading to generic `Instagram`.
> **Update Note (2026-03-19):** Unsupported Instagram share/reel-style events that Qualy cannot render inline yet must show an explicit `Open Instagram` fallback in Inbox previews and conversation bubbles instead of appearing as blank threads.
> **Update Note (2026-03-19):** Direct Instagram-app replies mirrored from webhook `echo` events must use the connected Instagram business username/avatar as the outgoing bubble identity whenever no internal `created_by` user profile exists.
> **Update Note (2026-03-19):** Instagram outbound reply sync now reuses existing customer threads when recipient IDs drift. After profile lookup resolves the same username/contact identity, webhook persistence must append to that conversation instead of opening a duplicate empty thread.
> **Update Note (2026-03-19):** Instagram business-account replies sent directly from the Instagram app are now part of the Inbox contract. Webhook `echo` events must persist as outbound `user` messages, keep the conversation/avatar in sync with the contact profile, and clear stale `instagram_request` tags after acceptance.
> **Update Note (2026-03-19):** Required-intake fallback is now intentionally conservative. Inbox/Leads may reuse generic extracted fields only for explicit canonical labels such as `Hizmet / Konum / Tarih / Bütçe`; custom organization-defined fields must come from `required_intake_collected` or manual operator input, preventing unrelated values from leaking into custom labels.
> **Update Note (2026-03-19):** Billing package cards now keep CTA rows bottom-aligned in `Settings > Plans`, preventing plan buttons from drifting vertically when marketing copy spans different numbers of lines.
> **Update Note (2026-03-19):** Inbox details now hide Instagram secondary identifiers under the profile name. Numeric IG user ids remain stored for transport/runtime, but operator-facing details surfaces should show only the readable username/avatar line for Instagram contacts.
> **Update Note (2026-03-19):** Inbox request-badge logic is now explicit-only for Instagram: Qualy must not auto-label a thread as `Request/İstek` merely because no operator reply exists yet or because the contact still shows as a numeric IG ID. Only `standby` / persisted `instagram_request` state counts as request-origin.
> **Update Note (2026-03-19):** Instagram connect must follow the official Instagram Business Login endpoints/scopes and call `/{instagram_account_id}/subscribed_apps` during connect. Without that subscription step the channel stays `pending` forever and real-user DMs never reach Inbox, even though OAuth/account permissions look correct.
> **Update Note (2026-03-19):** Instagram manage surfaces now use the same readiness contract as the channel gallery: `pending` means Qualy has not yet recorded webhook verification for that channel row, not that OAuth permissions are missing, so the detailed setup page no longer contradicts the card/debug state with stale `ready` copy.
> **Update Note (2026-03-18):** Instagram channel hardening now treats `connected` and `inbox ready` as different states: connect flows persist webhook provisioning metadata, callback verification marks the channel verified, webhook ingest accepts `page_id`-based events in addition to Instagram business/app-scoped IDs, and profile discovery preserves real page identity when Meta exposes it so Inbox does not silently miss delivered DMs.
> **Update Note (2026-03-18):** WhatsApp connect hardening now treats `asset attached` and `channel ready` as different states: webhook verification status is persisted in channel config, Channels UI shows pending/attention states until verification completes, and `another BSP migration` opens the guided existing-number Embedded Signup path instead of generic OAuth asset discovery.
> **Update Note (2026-03-18):** `Settings > Channels` no longer sits inside a centered `max-w` shell. The page now uses the full dashboard content width, and the channel gallery opens a fourth column on ultra-wide screens so the wider surface is actually used.
> **Update Note (2026-03-17):** The new/edit booking modal now lets operators override duration per booking, captures customer email as first-class booking data, and routes calendar selects through a shared primitive so dropdown chevrons stay consistently inset instead of hugging the right edge.
> **Update Note (2026-03-17):** `/calendar` view/date switches now stay client-side inside a buffered booking window instead of full route transitions on every click. Week/day/month/agenda changes update the URL with history state and only fetch a new window when the operator moves outside the loaded range.
> **Update Note (2026-03-17):** AI scheduling now keeps the booking thread alive across follow-up turns like `Cuma var mı?` without forcing the user to repeat the service or the word `randevu`. Booking-change requests such as reschedule/cancel stay intentionally human-routed in v1 instead of auto-mutating existing bookings.
> **Update Note (2026-03-17):** Calendar hardening now enforces `booking_enabled` on backend availability and booking creation, replaces weekly availability rules through one atomic RPC, keeps already-mirrored Google events in sync/cleanup paths even after write-through is turned off, and makes `no slot` plus implied reschedule AI branches trigger real operator handoff.
> **Update Note (2026-03-17):** Calendar review follow-ups are now closed: minimum notice is enforced consistently for generated slots, exact requested slots, and booking writes; disconnecting Google Calendar cleans mirrored future events before dropping the provider link; scheduling exceptions fail safe into operator handoff instead of generic AI fallback; generic suitability language such as `Bu bana uygun mu?` no longer counts as booking intent; and post-mutation calendar caches are dirtied so stale weeks/months are not reused.
> **Update Note (2026-03-17):** The `/calendar` workspace no longer repeats `Takvim ayarları` inside summary cards. The header action is now the only settings entry so the operator surface stays simpler.
> **Update Note (2026-03-17):** `Settings > Calendar` business-hour rows are now deliberately denser: each day keeps open/closed state, start time, and end time on one horizontal line, while slot interval / earliest booking / before-after gap rules expose inline `i` help instead of unexplained jargon. `Settings > Applications` also drops the redundant Google badge and uses a shorter `Bağla` CTA on the provider card.
> **Update Note (2026-03-17):** Calendar settings IA was simplified again: `/calendar` now routes users into dedicated settings pages instead of a modal, booking rules/business hours/service durations live under `Settings > Calendar`, and Google Calendar connection controls live under `Settings > Applications`.
> **Update Note (2026-03-17):** Calendar route now uses a neutral page component name instead of `CalendarPage`, preventing the Next.js 16.1.6 Turbopack dev overlay crash class (`'... cannot have a negative time stamp'`) on `/calendar`.
> **Update Note (2026-03-17):** Calendar moved out of the deferred backlog on purpose. The implemented scope is intentionally controlled: internal source of truth, existing service catalog reuse, org-level booking rules, Google busy overlay + optional write-through mirroring, and no fake claim of full two-way sync or multi-staff scheduling yet.
> **Update Note (2026-03-16):** Inbox Details sections are now collapsible, the top metadata block is renamed `Konuşma detayları`, required fields now live inside `Kişi` instead of a second standalone `Önemli bilgiler` section, the leave-conversation CTA sits in a dedicated footer region instead of blending into note content, and the composer now shows visible `Şablonlar / Gönder` actions with matched control heights.
> **Update Note (2026-03-15):** Added a GTM prelaunch audit (`docs/plans/2026-03-15-gtm-prelaunch-audit.md`) and expanded Pilot Launch scope so pre-pilot work explicitly covers activation/conversion, operator workflow polish, abuse controls, and a deliberate stance on competitor-parity gaps such as campaigns, widgets, integrations, and mobile alerts.
> **Update Note (2026-03-15):** Phase 9 load testing now distinguishes raw webhook throughput from realistic conversation pressure: `npm run test:load:messages` keeps the `autocannon` baseline, while `npm run test:load:users` simulates concurrent WhatsApp contacts with configurable multi-turn traffic, latency percentiles, timeout/transport-error reporting, and optional signed live-app execution against a real webhook URL.
> **Update Note (2026-03-15):** Admin now tracks durable AI latency analytics via dedicated event logs: lead-extraction completion and LLM-generated user-response durations are recorded at runtime and surfaced on the Admin dashboard as average + p95 cards scoped by selected organization and reporting period.
> **Update Note (2026-03-14):** Inbox mark-read flow now emits a shared unread-update browser event, so the main sidebar unread dot and browser tab title refresh immediately instead of waiting for realtime reconciliation.
> **Update Note (2026-03-14):** Main sidebar user identity now refreshes immediately after a successful profile photo save, so the new photo appears without requiring a manual page reload.
> **Update Note (2026-03-14):** Profile settings copy now uses `profil fotoğrafı / profile photo` wording, clarifies that the image is used only inside Qualy, and uploaded photos can be previewed by clicking the current image.
> **Update Note (2026-03-14):** Profile avatar persistence now cleans up the freshly uploaded storage object when saving `profiles.avatar_url` fails, reducing orphaned avatar files on retry/error paths.
> **Update Note (2026-03-13):** Settings > Profile now supports per-user avatar upload with client-side square WebP conversion, the main sidebar user chip reuses uploaded profile avatars with initials fallback, outbound operator messages resolve the real author avatar/name from persisted `messages.created_by`, and Kualia bot replies use a branded dark avatar treatment.
> **Update Note (2026-03-13):** AI intake refusal/no-progress protection now uses one shared wording-drift matcher across follow-up analysis and runtime response guards, and plain customer-number collection prompts are no longer misclassified as external contact redirects.
> **Update Note (2026-03-12):** Inbox now keeps `Request/İstek` visible for Instagram conversations that already carry the conversation-level `instagram_request` tag until an outbound reply clears it, even when the latest inbound metadata resolves to `messaging`.
> **Update Note (2026-03-12):** Optimistic outbound Instagram image bubbles now keep the selected local image preview alive during upload/send instead of briefly showing a broken placeholder image before refresh.
> **Update Note (2026-03-11):** Social avatar hydration now reads Instagram user `profile_pic` and Inbox can recover missing conversation avatars from inbound message metadata, so existing/live threads can show profile photos even if conversation-level avatar persistence is unavailable in a given environment.
> **Update Note (2026-03-11):** Locale entry route no longer exports a `Home` component, avoiding the Next.js 16.1.6 Turbopack dev overlay crash (`'Home' cannot have a negative time stamp`) on the root redirect page.
> **Update Note (2026-03-09):** Main sidebar bot-status now renders a neutral loading state until org bot mode fetch completes, preventing temporary incorrect green `Active` flash on refresh.
> **Update Note (2026-03-13):** Added an AI copywriter-ready static launch asset brief (`docs/launch-static-asset-copywriter-brief.md`) that consolidates repo, PRD, roadmap, release notes, and Turkish-first terminology guardrails for marketing visual generation.
> Mark items with `[x]` when completed.

---

## Phase 0: Project Setup ✅

- [x] Initialize project repository
- [x] Set up development environment
- [x] Choose and configure tech stack
- [x] Set up CI/CD pipeline (Netlify auto-deploys)
- [x] Configure database (Supabase client ready)
- [x] Set up environment variables
- [x] Codify agent workflow rules (always provide commit message)
- [x] Add subagent-driven-development skill for plan execution workflow
- [x] Use system fonts in app shell to avoid CI font-fetch issues
- [x] Self-host Plus Jakarta Sans from local project assets (`public/fonts/plus-jakarta-sans`) and remove runtime Google Fonts import

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
  - [x] Signout redirect now resolves `register` URL from runtime request origin instead of static app URL env fallback
  - [x] Sign Up now redirects unconfirmed users to a dedicated check-email checkpoint page (submitted email, spam hint, quick change-email return, and sign-in shortcut)
  - [x] Auth pages now avoid prefetching protected dashboard routes while signed out, reducing slow-feeling login/register open and signout return flows
  - [x] Successful login/signup sessions now redirect directly to the localized default workspace route instead of bouncing through locale entry
  - [x] Password reset and auth docs now recognize Netlify as the primary hosting/runtime platform
  - [x] Auth route layouts now send only auth-scoped translation namespaces instead of the full app message catalog

---

## Phase 2: Messaging Channels

- [x] **WhatsApp (Meta Cloud API)**
  - [x] Choose provider (Meta Cloud API selected for MVP)
  - [x] Finalize MVP scope (OAuth channel setup, inbound text + media (`image`/`document`) handling, reactive replies only)
  - [x] Write WhatsApp integration design document (`docs/plans/2026-02-08-whatsapp-meta-cloud-mvp-design.md`)
  - [x] Webhook endpoint for incoming messages
  - [x] Outgoing message API
  - [x] Parse inbound WhatsApp media events (`image` + `document`) alongside text messages in webhook runtime
  - [x] Persist inbound WhatsApp media snapshots to storage (`whatsapp-media`) and attach media metadata to inbox messages
  - [x] Render inbound WhatsApp media in Inbox message bubbles and show localized media preview labels in conversation list rows
  - [x] Group consecutive inbound image-only WhatsApp messages into gallery-style Inbox bubbles (2/3/4+ layout)
  - [x] OAuth connect flow (`/api/channels/meta/start` + `/api/channels/meta/callback`)
  - [x] One-click connect from channel card (no intermediate "continue with Meta" modal)
  - [x] OAuth error/status redirects return to current channels route using signed/safe `returnTo` path
  - [x] OAuth connect now opens in a dedicated popup window and pushes success/error status back to the main Channels page
  - [x] OAuth host resolution hardened for Netlify custom-domain deployments (configured app URL + forwarded host fallback)
  - [x] Popup return flow now preserves `meta_oauth_error` for direct diagnosis on Channels URL
  - [x] WhatsApp OAuth candidate discovery falls back from `/me/whatsapp_business_accounts` to business-edge lookup (`/me/businesses` + owned/client WABA edges)
  - [x] WhatsApp OAuth now requests only WhatsApp scopes (`whatsapp_business_management`, `whatsapp_business_messaging`) to avoid `Invalid Scopes: business_management` failures on newer Meta apps
  - [x] WhatsApp OAuth candidate selection no longer requires WABA `name`; connect flow now succeeds when Graph returns `id + phone_numbers` without `name`
  - [x] WhatsApp OAuth candidate hydration now fetches `/{waba_id}/phone_numbers` when nested `phone_numbers` is missing from WABA list responses
  - [x] Channels page now shows OAuth popup result feedback (`success` / failure reason) instead of silently returning with no visible status
  - [x] Meta OAuth authorize URL now enforces permission re-consent (`auth_type=rerequest`) and Graph errors include endpoint path in server logs for faster permission debugging
  - [x] WhatsApp OAuth supports env toggle `META_WHATSAPP_INCLUDE_BUSINESS_MANAGEMENT=1` to include `business_management` when required by `/me/businesses` fallback on certain Meta app setups
  - [x] WhatsApp fallback no longer forces `/me/businesses` on `Missing Permission` unless `META_WHATSAPP_INCLUDE_BUSINESS_MANAGEMENT=1`, so unsupported `business_management` apps fail on the real direct endpoint instead of looping into invalid-scope recovery
  - [x] WhatsApp callback now attempts `debug_token`-based WABA discovery when direct `/me/whatsapp_business_accounts` request fails, so missing-permission direct-edge failures can still complete connect without forcing `business_management`
  - [x] Channels > WhatsApp now includes Template Tools modal to list connected WABA templates and send test template messages for Meta App Review evidence
  - [x] Template Tools now includes a secondary in-modal usage guide (`How to use`) with operator-facing instructions for recipient format, variables, and verification steps
  - [x] WhatsApp Template Tools modal now auto-closes after successful send
  - [x] Replace blind WhatsApp Meta redirect with a guided connect modal (`existing number` / `new number` / `already have Meta assets`)
  - [x] Add Meta Embedded Signup as the default self-serve path for WhatsApp connect when workspace config is available
  - [x] Stop silently routing `existing number` through the generic new-number Meta Embedded Signup config; current-number path now requires a dedicated existing-number config and shows deterministic guidance if absent
  - [x] Keep current server OAuth discovery as an explicit fallback only for pre-existing Meta Cloud API assets
  - [x] Add deterministic blocked/unconfigured guidance when Embedded Signup is unavailable instead of dropping users into a dead-end Meta flow
  - [x] Complete Embedded Signup post-auth provisioning by registering the business phone number for Cloud API use, subscribing app webhooks on the customer WABA, and persisting the managed two-step verification PIN in channel config
  - [x] Persist WhatsApp webhook provisioning state across manual/OAuth/Embedded connect flows and treat the channel as ready only after webhook verification succeeds
  - [x] Route `another BSP migration` through existing-number Embedded Signup instead of the generic WhatsApp OAuth asset-discovery fallback
- [x] **Telegram (Sandbox)**
  - [x] Channel connect + webhook registration
  - [x] Incoming message webhook
  - [x] Outgoing message API
  - [x] Skill-match failures fail open to KB/fallback instead of dropping reply flow
- [x] **Instagram (Meta Messaging)**
  - [x] Channel connect via Meta OAuth + webhook verification
  - [x] Instagram OAuth now follows the official Instagram Business Login authorize flow (`instagram.com/oauth/authorize`) instead of switching the app onto Facebook Login/Page-token-only onboarding
  - [x] Instagram token exchange now stays on the official Instagram Login endpoints (`api.instagram.com/oauth/access_token` and `graph.instagram.com/access_token`) so connect returns the same token type the Instagram Messaging docs describe
  - [x] Instagram connect now provisions webhook delivery with `POST /{instagram_account_id}/subscribed_apps` before persisting the channel, preventing false-positive `connected` states that never receive live DMs
  - [x] Instagram connect persists webhook subscription metadata (`requested_at` + subscribed fields) alongside existing readiness state so debug surfaces can show whether delivery provisioning actually ran
  - [x] Instagram connect still merges optional linked Page metadata when `/me/accounts` is available, while profile metadata (`instagram_user_id` / app-scoped `id` / username) remains the primary identity source for Instagram Login
  - [x] Instagram outbound operator replies now use `graph.instagram.com/{IG_ID}/messages` first with compatibility fallback to `graph.facebook.com`
  - [x] Instagram onboarding/connect UI copy now says `Continue with Instagram` and no longer instructs Facebook Page selection in setup text
  - [x] Instagram onboarding helper text now uses concise respond.io-style redirect + permission guidance copy
  - [x] Instagram onboarding connect state simplified to a minimal respond.io-like layout: heading, short helper text, and single `Continue with Instagram` CTA
  - [x] Incoming message webhook
  - [x] Outgoing message API (reactive replies only)
  - [x] Normalize inbound Instagram image attachments into Inbox media metadata so DM images render in previews/timeline
  - [x] Support outbound Instagram Inbox image sends through the composer with signed upload flow and image-only validation
  - [x] Preserve local image preview in optimistic outbound Instagram bubbles until temp messages are replaced, so send-in-progress UI does not flash a broken image placeholder
  - [x] First bot reply starts only after inbound customer message
  - [x] One-click connect from channel card (no intermediate "continue with Meta" modal)
  - [x] OAuth popup flow mirrors WhatsApp and keeps main app context stable during Meta auth
  - [x] OAuth popup return bridge hardened with `localStorage` fallback so the popup still closes and main page refreshes when `window.opener` is dropped by cross-origin browser policy
  - [x] Instagram debug action now validates the same Instagram Login + webhook-provisioning contract used by connect/runtime, so missing `subscribed_apps` setup is surfaced during diagnosis
  - [x] Instagram connection readiness/debug now exposes webhook provisioning state (`pending` / `verified` / `error`) so `active` no longer falsely implies Inbox delivery is ready
  - [x] Channels card connect CTA is temporarily disabled and shown as `Çok Yakında` for non-connected orgs
  - [x] Meta channel credentials now support channel-specific env overrides (`META_INSTAGRAM_APP_ID/SECRET`, `META_WHATSAPP_APP_ID/SECRET`) with backward-compatible fallback to shared `META_APP_ID/SECRET`
- [x] **Facebook Messenger (Placeholder)**
  - [x] Added Channels settings card with `Çok Yakında` CTA (no backend integration in MVP)
  - [x] Placeholder card icon now uses `public/messenger.svg` and follows stacked row-card layout in Channels settings
- [x] **Channels Discovery UX**
  - [x] Redesign Settings > Channels into a responsive business-messaging gallery with calmer card tones, direct grid layout, full-width page usage, and up to 4 columns on ultra-wide desktop
  - [x] Promote WhatsApp as the primary CTA surface while keeping Telegram active and Instagram/Messenger launch-gated
  - [x] Route channel connect actions into dedicated onboarding pages (`/settings/channels/whatsapp`, `/telegram`, `/instagram`, `/messenger`)
  - [x] Move WhatsApp and Telegram setup into full-page onboarding flows while keeping Instagram/Messenger detail pages as launch-gated placeholders with preparation resources
  - [x] Split WhatsApp onboarding taxonomy into `new API account`, `existing API account`, and `WhatsApp Business app number` so Cloud API assets and app-number migration are no longer conflated
  - [x] Refine WhatsApp onboarding into a respond.io-style eligibility wizard: show `new API`, `existing API`, and `WhatsApp Business app number` on the landing screen, keep the `Meta Business Manager access -> final connect` sequence before opening Meta for guided flows, and split `existing API` into `Meta assets already in Meta` vs `another BSP migration`
  - [x] Compact channel onboarding detail pages (WhatsApp/Telegram/placeholders) to app-consistent spacing, typography, and icon treatment
  - [x] Remove the extra `Business Messaging` heading in channel gallery and use direct route push on `Connect` to reduce click-to-open delay for onboarding pages
  - [x] Make channel cards more compact: reduce card title size, move icons tighter to top-right, and decrease whitespace before divider
  - [x] For connected channels, replace card-level destructive `Disconnect` CTA with navigational `Manage` CTA that opens the channel detail page; keep disconnect action inside the dedicated channel setup page
  - [x] Channel platform logos are now anchored tighter to top-right on cards for respond.io-like visual balance
  - [x] Remove top-left gallery badges for launch simplicity (drop WhatsApp `Popular`), and render Messenger `Soon` badge in footer action row on the same line as `Learn more`
  - [x] Add icon-anchored radial background glow on channel cards so each platform uses tone-matched color fading from the top-right icon region
  - [x] Keep channel onboarding detail pages wrapper-free: remove gradient accents and place platform icon on the left under the back action
  - [x] Add `Meta Tech Provider` trust badges for Meta products (WhatsApp/Instagram/Messenger) on both channel cards and related setup pages
  - [x] Extend Instagram webhook parser to ingest inbound text events from both `messaging` and `standby` payload arrays to avoid missing DM-request traffic
  - [x] Surface Instagram request-folder traffic in Inbox by storing `instagram_event_source` metadata and showing `Request/İstek` badge for `standby` messages
  - [x] Expand Instagram webhook coverage for all inbound messaging payloads and shapes (`entry.messaging` / `entry.standby` plus `entry.changes` messaging fields): normalize non-text events (`attachments`, `postback`, `referral`, `reaction`, `read/seen`, `optin`, `handover`) into inbox-visible contact rows, relax strict recipient-id filtering for request-folder compatibility, and skip AI auto-reply for these system/media events
  - [x] Persist Instagram business-account `echo` replies from the native Instagram app into Inbox as outbound `user` messages, reusing the contact recipient for conversation lookup and refreshing username/avatar metadata when available
  - [x] Persist Instagram business-account username/avatar metadata on direct-app `echo` replies and use it for outgoing Inbox bubble identity when no internal operator profile is available
  - [x] Retry direct-app Instagram business identity lookup across stored canonical IG account ids when webhook `echo` events are addressed by `page_id`, preventing generic `Instagram` sender fallback on outbound bubbles
  - [x] Reuse the existing Instagram customer conversation when outbound webhook recipient ids differ from the stored thread id but the resolved username/contact identity matches, preventing duplicate empty threads
  - [x] Fix Instagram webhook identity mismatch by persisting both `instagram_user_id` and `instagram_app_scoped_id`, prioritizing `user_id` when profile metadata is available, and allowing webhook channel lookup + auto-reconcile across both identifiers
  - [x] Accept `page_id`-addressed Instagram webhook events during channel lookup/reconciliation so Meta-delivered DMs do not get dropped before the shared inbound pipeline persists them
  - [x] Persist Instagram request-origin state at conversation level (`instagram_request` tag on `standby` inbound) and surface `Request/İstek` badge across Inbox list, conversation header, and details
  - [x] Resolve Instagram sender identity via Graph profile lookup during webhook ingest (`/{CONTACT_ID}?fields=id,username,name`) and persist metadata/contact-name fallback so Inbox prefers username over numeric IG IDs
  - [x] Harden Instagram request-badge classification so normal DMs/reaction threads are not auto-labeled `Request/İstek` from missing outbound replies or unresolved numeric contact IDs; require explicit `standby` or persisted `instagram_request` state
  - [x] Keep Instagram request badges sticky for tagged request-origin conversations until an outbound reply clears acceptance state, even if the latest inbound event metadata resolves to `messaging`
  - [x] Replace unsupported Instagram share/reel attachment placeholders with localized `Open Instagram` fallback text in Inbox list previews and conversation bodies so operators are not shown empty-looking threads
  - [x] Persist previewable Instagram share/story reply URLs from webhook payloads (`attachments[].payload.url`, `reply_to.story.url`) and render them inline in Inbox when the URL is directly previewable, while preserving the existing `Open Instagram` fallback for non-previewable assets
  - [x] Refine onboarding detail readability and support CTA: smaller inner headings/body text, visible wizard step numbers in selected state, support banner `Ekiple konuş` mail action, and temporary no-op migration info link
  - [x] Left-align channel onboarding detail content container instead of centering it
- [x] **Shared Inbound AI Pipeline**
  - [x] Keep Telegram/WhatsApp/Instagram webhook routes separate
  - [x] Move inbound AI flow to shared pipeline function and reuse in WhatsApp + Instagram
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
  - [x] Add optional skill action buttons with types `trigger_skill` and `open_url` (WhatsApp displays first 3)
  - [x] Harden skill action reliability: action target picker excludes disabled skills, inbound invalid/disabled action clicks return deterministic unavailable notice, Skills editor allows 3+ actions while showing a banner that WhatsApp displays only the first 3, and route/client regression guards cover interactive button-reply wiring + defensive button sanitization
- [x] **Skill Matching Engine**
  - [x] Embedding generation for triggers
  - [x] Embedding generation now includes skill titles in addition to triggers
  - [x] Similarity search (top-5)
  - [x] LLM re-ranking
  - [x] Confidence threshold logic
- [x] **Skill Testing**
  - [x] Simulator is the canonical skill testing surface for MVP (no separate per-skill playground)

## Phase 3.5: Chat Simulator (Neutral Chatbot UI) ✅

- [x] **Chat Interface**
  - [x] Neutral chatbot UI (channel-agnostic bubbles, header, and input)
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

- [x] **Profile Settings**
  - [x] Settings > Profile now supports per-user avatar upload with client-side square WebP conversion before storage upload
- [x] **Inbox UI**
  - [x] Conversation list with lazy loading
  - [x] Conversation queue tabs (`All`, `Unassigned`, `Me`) with single circular badge presentation (red for attention count) and no duplicate badge on Unassigned/Me
  - [x] Conversation list row-level human-attention indicator is compact red `!` and rendered only on `All` tab (tooltip keeps reason detail: `Skill handover` / `Hot lead`)
  - [x] Main sidebar bot-status control now shows a neutral loading state on page refresh until org bot mode is fetched, preventing temporary incorrect `Active` (green) flash when actual mode is `Shadow`/`Off`
  - [x] Mobile inbox header now shows bot-status pill and opens a bot-mode quick-switch bottom sheet with `Active / Shadow / Off` explanations + Settings shortcut
  - [x] Mobile conversation details sheet now matches desktop key-info ordering and includes active agent, assigned operator, platform/channel, received time, and AI control metadata
  - [x] Mobile conversation header now exposes quick context without opening details (channel icon + active agent chip), with channel icon shown directly before contact name (no extra framed wrapper), and mobile bot-status quick-switch sheet now opens from top like the details panel
  - [x] Message history view
  - [x] Message-day badge now follows message timestamps (`Today` / `Yesterday` / localized date) instead of a static `Today` chip
  - [x] Inbox refresh and thread-open path now avoids duplicate/serial bottlenecks: Instagram contact hydration runs in parallel with timeout budget, conversation-switch no longer double-calls lead refresh, and DB indexes cover conversation ordering plus message pagination/request-existence query paths
  - [x] Dashboard refresh now resolves non-admin tenant context in slim active-org-only mode by default, and Inbox thread-open now loads latest messages plus lead snapshot in parallel while sender-profile hydration/read-mark persistence continue off the first-paint path
  - [x] Sidebar preview state now recovers from missed realtime message inserts: fetched thread history syncs the conversation row preview, and conversation realtime updates hydrate preview messages when `last_message_at` moves ahead of the cached snippet
  - [x] Instagram `seen/read` events no longer drive Inbox unread/recency indicators or timeline day-separator labels, preventing empty `Today` separators with no visible message bubble
  - [x] Delete conversation functionality
  - [x] Composer banner copy + centered layout
  - [x] Details avatar initials match conversation list
  - [x] Conversation avatars use shared initials/colors across list, chat, and details
  - [x] Instagram and Telegram conversations now hydrate/render stored social profile photos in shared Inbox avatars, while WhatsApp keeps initials fallback when no supported customer avatar source exists
  - [x] Outbound operator messages now render true author name/avatar from persisted `messages.created_by`, with initials fallback when no profile avatar exists
  - [x] Kualia bot replies now use a branded dark avatar treatment instead of a generic initials bubble
  - [x] Inbox now previews inbound Instagram images and lets operators send outbound Instagram image attachments from the shared composer
  - [x] Inbox media preview labels now reflect message direction so outbound image/document/audio/video/sticker turns use localized `sent` copy instead of `received`
  - [x] Lead snapshot grouped under Key Information with contact header restored
  - [x] Conversation details panel now shows cumulative AI credit usage (all AI operations) since conversation start
  - [x] Conversation AI credit totals are now persisted on the conversation record (trigger + backfill), and inbox details read the stored total without per-open recomputation
  - [x] Conversation-level AI processing pause toggle in Inbox details (desktop + mobile) to stop AI replies and lead extraction per contact
  - [x] Inbox Key Information now places conversation AI pause control directly under Total AI Credits
  - [x] Score reasoning UI uses locale-aware copy and labels
  - [x] Lead extraction paused notice + manual refresh in details panel
  - [x] Manual lead refresh is blocked when conversation-level AI processing pause is enabled
  - [x] Inbox details hide lead panel content when conversation-level AI pause is enabled
  - [x] Lead snapshot header shows AI extraction chip and status uses dot + text
  - [x] Platform row shows channel icon and channel cards use consistent icon sizing
  - [x] Platform icons in Channels cards + Inbox badges/details + Leads list now use shared public SVG assets (`/Telegram.svg`, `/whatsapp.svg`, `/instagram.svg`, `/messenger.svg`)
  - [x] Leads list rows/cards now show compact contact avatars immediately before the existing platform icon when conversation social avatar data exists
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
  - [x] Inbox list unread message text is bold and selected conversation uses a more visible light blue background
  - [x] Inbox mark-read now pushes a shared client-side unread refresh signal so sidebar and tab-title unread indicators stay in sync immediately
  - [x] Real-time updates (via polling/subscriptions)
  - [x] On-demand conversation summary (button + inline panel)
  - [x] Conversation summary minimum-message threshold updated to `3` customer messages (bot message optional)
  - [x] Closing and reopening summary panel now regenerates summary without requiring manual refresh
  - [x] WhatsApp conversations now show a far-right 24-hour reply-window indicator only when blocked (`reply unavailable`) next to the summary control, with tooltip reason
  - [x] WhatsApp conversations now show a compact in-input `Send Template` action (document icon + text) aligned to the composer’s far-right area
  - [x] Inbox composer send/template controls now collapse to icon-first mode on constrained widths, and reply input stays fixed single-line (scrollbar hidden) to prevent overflow/layout drift
  - [x] Inbox composer error state no longer shifts send-button alignment: error text renders below the row and non-attachment send failures now use channel-aware copy (instead of attachment-specific error wording)
  - [x] Instagram `seen` webhook events now render only inside conversation view (compact eye-icon read indicator inline on outbound message footer next to time) and are excluded from Inbox list last-message preview so list rows keep real message content
  - [x] Outbound Instagram replies now clear stale `instagram_request` conversation tag so `Request/İstek` badge is removed once the request thread is accepted/answered
  - [x] Inbox template picker now supports two-tab WhatsApp flow (`Hazır mesajlar` + `WhatsApp şablonları`) and single-tab predefined flow on non-WhatsApp conversations
  - [x] Inbox users can create, edit, delete, and select organization-scoped predefined templates, then insert selected content into `Write a reply` composer without auto-send
  - [x] Inbox template picker tabs now use compact underline navigation; refresh action is shown only on WhatsApp tab, select chevrons use inset alignment, and tab switching animates modal height smoothly (mobile + desktop)
  - [x] WhatsApp reply-window status now includes a question/help icon inside the blocked status badge with tooltip that shows explicit reason when unavailable
  - [x] Inbox composer now disables manual send for WhatsApp when the 24-hour free-form window is closed, shows a short lock overlay message, and keeps `active_agent` unchanged
  - [x] WhatsApp expired-window conversations now surface explicit action buttons (`Open in WhatsApp` / `Send Template`) so operators can continue via phone app or send an approved template directly from Inbox
  - [x] Inbox WhatsApp template modal now auto-closes after successful send
  - [x] Inbox composer now supports WhatsApp outbound image/document attachments with multi-select (`max 10`), pre-send attachment previews/removal in a dedicated attachment area (outside text input), signed upload targets, and optimistic send status indicators (`sending` / `failed`)
  - [x] Inbox composer textarea now supports clipboard image paste; pasted images are attached up to remaining slot limit (`max 10`) and optimistic outbound image bubbles render immediate local preview instead of placeholder label
  - [x] Mobile inbox app flow with list-to-conversation transition and back navigation
  - [x] Mobile chat header details toggle with compact contact/lead snapshot
  - [x] Mobile details payload now includes lead summary, service type, and collected required info
  - [x] Mobile operator takeover view shows a visible Leave Conversation action
  - [x] Mobile list/detail navigation uses slide transitions (forward/back)
  - [x] Mobile details panel now dims background with a dark overlay and closes on outside tap
  - [x] Mobile details panel open/close now uses smooth transition (fade + slight slide)
  - [x] Inbox list header no longer shows the dropdown chevron next to the title
  - [x] Inbox list header surface now matches the list column background for consistent sidebar visuals
  - [x] Inbox list header now exposes a single right-aligned filter icon menu for `All / Unread` plus `All / Hot / Warm / Cold`, includes inline `Sıfırla / Reset`, uses colored customer-score chips with stronger selected states, and keeps unread rows visible until the operator manually switches away
  - [x] Chat view now shows an animated "scroll to latest" button only when not at bottom, positioned on the composer divider
  - [x] Scroll-to-latest now keeps the thread pinned to the true bottom even after dynamic composer height changes and lazy-loaded message media reflow
  - [x] Conversation message history now lazy-loads older pages on upward scroll while preserving viewport position after prepend
  - [x] Reduced vertical gap between the "Konuşma Özeti" row and the assistant banner in composer area
  - [x] "Konuşma Özeti" action now uses a glowing gradient AI sparkles icon (filled style) plus an inline chevron toggle beside the label
  - [x] Shadow/Off bot modes now show compact inactive-state banner copy (single-line title + short body) in composer area
  - [x] Active bot assistant banner now follows the same spacing/typography layout as inactive banner (color palette unchanged)
  - [x] Conversation switch now shows loading skeletons until selected-thread messages load, preventing avatar-first stale content flashes
  - [x] Lead status chips now sync after manual lead refresh and realtime lead events
- [x] **Refactoring**
  - [x] Migrate to Lucide Icons
  - [x] Primitive component cleanup
  - [x] Skills and Knowledge Base primary CTA buttons now use `#242A40` accent styling
  - [x] Skills detail header delete/save actions now use standardized icon + label pattern (desktop/mobile compatible)
  - [x] Unsaved changes guard save callback now tracks pending-link transform dependency to avoid stale navigation targets
  - [x] Next.js locale interceptor moved from `src/middleware.ts` to `src/proxy.ts` (Next 16 convention)
  - [x] App shell no longer bulk-prefetches dashboard/settings/admin routes on mount; navigation now relies on visible-link prefetch instead of eager route floods
- [x] **Navigation Shell**
  - [x] Crisp-inspired main sidebar with collapse toggle and persisted state
  - [x] Refined collapsed icon layout and toggle placement (Netlify-style)
  - [x] Centered collapsed logo alignment
  - [x] Sidebar header branding uses `logo-black.svg` when expanded and `icon-black.svg` when collapsed
  - [x] Browser tab branding now uses `Qualy` title metadata and `/icon-black.svg` favicon/icons
  - [x] Browser tab title is route-aware (`Page | Qualy`) and Inbox title uses a dot indicator `(●)` for unread instead of numeric count
  - [x] Route layouts/pages now own localized browser-tab metadata so labels stay stable after Next App Router transitions (`Takvim`, `Kişiler`, `Yetenekler`, `Ayarlar`, auth pages, and admin surfaces)
  - [x] Collapsed sidebar brand icon scaled up to match active navigation item size
  - [x] Eyebrow section labels for grouped navigation
  - [x] Increased spacing between header and first sidebar section
  - [x] Sidebar nav icons use active/passive variants per item
  - [x] Yönetim/Admin menü ikonları `react-icons/hi2` (Heroicons v2) setiyle standardize edildi
  - [x] Sidebar accent and active-state color updated from blue to `#242A40`
  - [x] Mobile bottom navbar with 5 items (Inbox, Kişiler, Yetenekler, Bilgi Bankası, Diğer)
  - [x] Mobile bottom navbar IA compacted to 4 items (`Inbox`, `Kişiler`, `AI`, `Diğer`) and `AI` opens a sheet with `Yetenekler` + `Bilgi Bankası`
  - [x] Mobile “Diğer” quick menu with Simülatör, Ayarlar, and Signout
  - [x] Mobile “Diğer” menüden tekrar eden Faturalandırma/Kullanım kısa yolları kaldırıldı (Ayarlar içinden erişim tek kaynak)
  - [x] Mobile Skills page now uses app-style single-pane navigation (list page → detail page with back action)
  - [x] Mobile Skills detail header uses shorter labels (`Düzenle`, `Kaydet`) to reduce top-bar clutter
  - [x] Mobile Settings now uses app-style single-pane navigation (settings list page → detail page with back action)
  - [x] Mobile Settings detail pages now use animated back transition to the settings list (Inbox-style slide-out)
  - [x] Mobile Settings back action now performs client-side navigation (no full refresh feel on detail→list return)
  - [x] Mobile Settings detail geri akışında history döngüsü düzeltildi (`replace` tabanlı geri dönüş)
  - [x] Desktop Settings now keeps the inner settings sidebar persistent while only detail content switches/loading states
  - [x] Mobile Knowledge Base now uses a single-pane flow (sidebar hidden on mobile and files rendered as responsive cards)
  - [x] Mobile Knowledge edit header now uses compact labels (`Düzenle`, `Kaydet`) and icon-only back affordance
  - [x] Mobile bottom navbar now prefetches primary routes for faster tab transitions
  - [x] Desktop main sidebar and settings shell now prefetch settings routes to reduce transition latency
  - [x] Desktop main sidebar now prefetches core workspace/AI/admin routes for faster route transitions
  - [x] Main sidebar Settings entry routing optimized for lighter first-load behavior vs legacy `/settings/channels`
  - [x] Desktop main sidebar Settings entry now opens `/settings/ai`, while mobile quick action keeps `/settings` list-first flow
  - [x] Route prefetch warmups now run with a short delayed schedule (main sidebar, settings shell, mobile nav) to reduce active-interaction jank
  - [x] Manual navigation prefetch warmups now run in both development and production by default (with env opt-out) to reduce first-click route latency
  - [x] Shell prefetch policy is now selective: primary workspace/settings navigation stays warm, while secondary shell shortcuts remain opt-out to avoid route floods
  - [x] Dashboard desktop sidebar + mobile navigation + Settings inner navigation now use intent-based route warming and an immediate route skeleton bridge across primary route families (`Inbox`, `Calendar`, `Leads`, `Skills`, `Knowledge`, `Settings`, `Admin`) so taps/clicks do not sit on a stale screen while server payloads are still in flight
  - [x] Dashboard desktop sidebar + mobile navigation + Settings inner navigation now derive active state from shared optimistic route state so the clicked destination highlights before `pathname` commits
  - [x] Root locale shell now auto-recovers once from real Next chunk 404 / `ChunkLoadError` deploy mismatches by forcing a cache-busting reload instead of trapping the user on the generic client exception screen
  - [x] Settings shell no longer blocks route transitions on server-side pending suggestion counts; the organization badge now hydrates client-side with stale-response protection
  - [x] Main sidebar now keeps unread indicator on the immediate path and defers billing/pending/bot-mode hydration until after first paint
  - [x] Shell unread indicators now use existence checks + a shared desktop unread-state event, removing duplicate desktop tab-title realtime subscriptions and adding a dedicated unread partial index
  - [x] Hidden mobile `MainSidebar` no longer runs organization/unread/billing/bot-mode IO; heavy sidebar effects start only on actual desktop viewports
  - [x] Settings inner navigation no longer eagerly prefetches every visible route on render, reducing first-paint background route pressure
  - [x] Hidden desktop mobile nav no longer fetches billing snapshot; mobile billing hydration starts only on actual mobile viewports
  - [x] Post-auth route resolution now uses lightweight `profiles.is_system_admin` + active-org-cookie signals instead of validating organization selection before entering the app shell
  - [x] Root `(dashboard)` route group now exposes a shared loading boundary so auth-to-app entry and uncached dashboard transitions show shell skeletons earlier
  - [x] Billing-locked navigation now keeps desktop/mobile main menus and Settings inner menu structure visible; non-billing destinations render as locked/non-clickable while Settings stays accessible via Plans
  - [x] Billing-locked workspace sidebar now forces bot status indicator to `Kapalı/Off` (instead of `Dinleyici/Shadow`) so lock state is communicated clearly
  - [x] Main sidebar bot status now opens a filled quick-switch dropdown with inline Active/Shadow/Off explanations and a Settings shortcut
  - [x] Collapsed sidebar now shows immediate custom hover tooltips for bot/nav controls, and the bot quick-switch dropdown animates on open/close
  - [x] Settings > Usage credit ledger table now keeps fixed column layout when toggling `Daha fazla göster / Daha az göster`
  - [x] Anonymous `/` entry now short-circuits to `/login` using Supabase auth-cookie detection before resolving organization context, reducing landing→app redirect delay
  - [x] Dashboard route fetch paths now remove redundant page-level `auth.getUser()` checks in favor of shared organization-context resolution to reduce repeated server roundtrips
  - [x] Dashboard layout now reuses user identity fields from active-organization context (full name/email) and removes an extra per-navigation profile query
  - [x] Main sidebar user chip now renders uploaded profile avatars with initials fallback
  - [x] Active organization context + billing snapshot reads now use request-level caching so nested layout/page checks avoid duplicate DB calls on the same navigation request
  - [x] Removed explicit `force-dynamic` from Skills/Knowledge dashboard pages and parallelized Knowledge page data loading for faster warm-route transitions
- [x] **Inbox Reliability**
  - [x] Atomic operator assignment on manual send
  - [x] Message refresh fallback for bot/contact updates
  - [x] Realtime auth handshake for subscriptions
  - [x] Fixed inbox credit-usage refresh hook dependency regression causing React `useEffect` dependency-size console error in dev hot-reload
  - [x] Realtime auth token sync now refreshes missing tokens and listens to auth state changes to prevent stale inbox streams
  - [x] Realtime lead status updates for inbox list indicators
  - [x] Conversation list loading now falls back to flat per-table reads when nested relational query fails, preventing false empty-state inbox views
  - [x] Conversation list lead payloads are normalized for one-to-one nested responses so lead chips remain visible after full page refresh (without opening each thread)
  - [x] Conversation list relative-time labels now use deterministic base-time formatting to prevent SSR/CSR hydration mismatches
  - [x] Escalation runtime now persists conversation-level human-attention queue state (`human_attention_required/reason/requested_at/resolved_at`) for skill-handover and hot-lead escalations
  - [x] Skill routing now applies the first successful top-ranked match directly (no extra handover-intent guard); when matched skill has `requires_human_handover=true`, escalation switches conversation to operator
  - [x] MVP response-language detection now treats ASCII Turkish complaint turns (for example `Sikayetim var`) as Turkish and, when current turn is ambiguous, falls back to recent customer-message history to keep escalation/handover notices in the correct language
  - [x] Inbox bot-message parsing now strips trailing quoted disclaimer lines reliably (LF/CRLF tolerant) and supports skill-title extraction from JSON-string metadata payloads
  - [x] Inbox skill footer label now hides raw `skill_id` fallback (UUID) and shows only skill title; inbound runtimes now also fetch `skills.title` as a fallback source when matcher title is empty
  - [x] Operator outbound ownership flow now resolves conversation attention state automatically (`send_operator_message` + manual `setConversationAgent('bot')` cleanup)
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
  - [x] New Content source menu keeps placeholder providers visible and marks PDF as `Coming Soon` for transparency
- [x] **KB Status UI**
  - [x] Show indexing status per entry (Ready / Processing / Error)
  - [x] **RAG Pipeline**
- [x] Document chunking
- [x] Embedding storage
- [x] Retrieval logic
- [x] Response generation from KB
- [x] KB profile/intake suggestion context now truncates oversized document content before LLM handoff
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
  - [x] Router responses now enforce a max output token cap for predictable cost
  - [x] Fallback/RAG responses now enforce max output token caps for predictable cost
  - [x] Shared inbound webhook RAG generation path (`src/lib/channels/inbound-ai-pipeline.ts`) now sets explicit `max_tokens`
  - [x] Enforce MVP reply-language rule in RAG/fallback/simulator prompts: Turkish only for Turkish customer messages, otherwise English only
- [x] **Bot Mode (Org-Level)**
  - [x] Active / Shadow / Off (Simulator excluded)
  - [x] AI Settings selector + sidebar status indicator
  - [x] Turkish copy refinements (Dinleyici label + clearer descriptions)
  - [x] Active mode copy mentions background lead extraction
  - [x] Sidebar status dot uses green/amber/red for Active/Dinleyici/Kapalı
  - [x] Regression tests enforce `Shadow` guarantee in shared inbound + Telegram paths: no outbound bot reply while lead extraction still runs
- [x] **AI Settings:** Always-on flexible mode with a single threshold and prompt field
- [x] **AI Settings Copy:** Localized TR labels and sensitivity helper text
- [x] **AI Settings Copy:** TR locale now localizes `Skill Based Handover` section title, and skill button empty-state copy is channel-agnostic
- [x] **AI Settings:** Configurable bot name (org-level)
- [x] **AI Settings:** Channel-wide bot disclaimer toggle + localized TR/EN disclaimer text (default enabled)
- [x] **Bot Reply Formatting:** Outbound bot replies append disclaimer footer text when enabled; WhatsApp/Telegram keep blockquote format (`\n\n> ...`), while Instagram uses a separated footer (`\n\n------\n> ...`) because native quote styling is unavailable there
- [x] **Escalation Controls**
  - [x] AI Settings Escalation tab: two primary sections (`Automatic Escalation` + `Skill Based Handover`), hot lead score slider, action cards, and locale-aware handover message
  - [x] Skill-level `Requires Human Handover` toggle with read-only message preview
  - [x] Centralized escalation policy with precedence: skill override > hot lead score
  - [x] Locale-aware handover message repair so TR UI no longer displays EN default text
  - [x] `notify_only` hot-lead behavior now keeps AI replies active based on `active_agent` state (stale assignee no longer blocks bot replies)
  - [x] `notify_only` hot-lead behavior no longer sends customer-facing handover promise; handover message is only emitted when escalation switches to operator (or skill-triggered forced handover)
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
- [x] **Usage & Billing:** Track monthly calendar-month + all-time AI credit usage using ledger debits (`organization_credit_ledger` / `usage_debit`)
- [x] **Usage & Billing:** Keep Usage and Plans credit consumption consistent by reading the same debit source
- [x] **Usage & Billing:** Include operation-level breakdown for router, RAG, fallback, summary, lead extraction, and lead reasoning
- [x] **Usage & Billing UI:** Show calendar month label (`Europe/Istanbul`) in the monthly card header
- [x] **Usage & Billing UI:** Show only credit values (`30,3 kredi`) in monthly/all-time cards
- [x] **Usage & Billing UI:** Restore `Kullanım detayını gör` modal for per-operation credit visibility
- [x] **Usage & Billing UI:** Replace technical operation names with user-friendly labels (`AI yanıtları`, `Konuşma özeti`, `Kişi çıkarımı`, `Doküman işleme`)
- [x] **Usage & Billing UI:** Split document-processing credits (`hizmet profili`, `gerekli bilgiler`) from lead-extraction totals using usage metadata source mapping
- [x] **Usage & Billing UI:** Show month period in usage-breakdown modal header as `Bu ay • <Ay YYYY>` (same pattern as summary card)
- [x] **Usage & Billing UI:** Style `Detayı gör` action as black underlined link to match `Kullanımı gör` visual pattern in Plans
- [x] **Usage & Billing UI:** Render usage details modal via full-page portal overlay and compact 3-column table (`İşlem / Bu ay / Toplam`) so labels do not repeat and credit values stay on one line
- [x] **Usage & Billing UI:** Show organization storage totals in `Settings > Usage` with `Skills / Knowledge / WhatsApp media` breakdown
- [x] **Usage & Billing UI:** Remove the technical storage approximation footnote line from the storage section (card-only summary)
- [x] **Usage & Billing Reliability:** Fix premium-plan `organization_ai_usage` insert failures by casting debit-trigger `credit_pool` CASE branches to `billing_credit_pool_type` enum (prevents `42804` and restores conversation credit accumulation)
- [x] **Usage & Billing Reliability:** Prevent Usage totals undercount for high-volume orgs by paginating `organization_credit_ledger` usage-debit reads and batching `organization_ai_usage` metadata lookups (avoids Supabase default 1000-row truncation)
- [x] **Usage & Billing Reliability:** Prevent silent AI usage-reporting drift by making `recordAiUsage` fail fast on persistence errors (no swallowed insert failures)
- [x] **Usage & Billing Reliability:** Fix WhatsApp media storage totals showing `0 B` by making storage RPC media-bucket aware (`target_media_bucket_ids`) and reconciling empty media totals from storage object listings in server fallback path
- [x] **Usage & Billing Reliability:** Start tracking embedding token usage in `organization_ai_usage` for skill matching and knowledge retrieval/indexing flows
- [x] **Billing Lock Enforcement:** Add runtime entitlement re-check stages in shared inbound pipeline + Telegram webhook to stop follow-up AI calls after lock transition
- [x] **Billing Lock Enforcement:** Block offering-profile suggestion/service-catalog/required-intake AI generation when organization usage is locked
- [x] **Webhook Reliability:** Add Telegram inbound duplicate dedupe (`metadata.telegram_message_id`) to avoid duplicate processing and duplicate AI spend
- [x] **Settings UX:** Save buttons show a transient success state and clear dirty-state across settings pages
- [x] **Settings UX:** Two-column sections, header save actions, dirty-state enablement, and unsaved-change confirmation
- [x] **Settings UX:** Remove redundant current-value summaries above inputs
- [x] **Settings UX:** Align settings column widths and remove duplicate field labels for cleaner alignment
- [x] **Settings UX:** Refresh settings sidebar icons with bubbles/circle-user icons
- [x] **Settings UX:** Settings page headers now match sidebar item labels (AI + Organization)
- [x] **Settings UX:** AI and Organization settings pages now start directly with tabs (top description copy removed)
- [x] **Organization Settings IA:** Split page into 3 tabs (`General`, `Organization Details`, `Security & Data`) with grouped content (name+language, offering profile/service list/required fields, data deletion)
- [x] **Settings IA:** Removed dedicated General settings entry; language selector moved under Organization settings and `/settings/general` now redirects to `/settings/organization`
- [x] **AI Settings UI:** Compact bot mode/escalation selection cards (smaller title, radio, and padding)
- [x] **AI Settings UI:** Downsize selection card title text to section-title scale and reduce description font one step
- [x] **AI Settings IA:** Move `Sensitivity` control from `General` to `Behavior and Logic` for better settings grouping
- [x] **AI Settings IA:** Move `Lead extraction during operator` from `Behavior and Logic` to `Escalation`
- [x] **Settings Naming:** Rename Settings AI nav/page label from `AI` to `Qualy AI`
- [x] **AI Settings UI:** Align sensitivity slider with hot lead threshold styling (blue `>=` right-side highlight)
- [x] **AI Settings Copy:** Rename handover notice label from “Asistan Sözü” to “Bot mesajı” (TR/EN)
- [x] **AI Settings UI:** Remove Escalation section subtitle text and keep title-only section headers (`Automatic Escalation` + `Skill Based Handover`)
- [x] **AI Settings IA:** Reorganize AI settings into 3 tabs (`General`, `Behavior and Logic`, `Escalation`) and move sections accordingly (Bot mode/name/sensitivity, operator extraction + prompt, and escalation controls with primary `Automatic Escalation` + `Skill Based Handover` sections)
- [x] **Settings Components:** Add reusable `SettingsTabs` with smooth tab-content height animation for reuse across settings surfaces
- [x] **AI Settings Matching:** Apply inclusive threshold semantics (`>=`) for Skill + KB similarity checks
- [x] **Skill Matching Guardrail:** Evaluate matched skills in order and reject likely false-positive `requires_human_handover` matches when inbound intent does not indicate handover/escalation; use next valid skill candidate, otherwise continue via KB/fallback
- [x] **Bot Disclaimer Reliability:** Add regression coverage to enforce default TR/EN disclaimer fallback when localized disclaimer fields are missing at runtime
- [x] **Inbox Bot Message Readability:** Hide trailing bot disclaimer footer from Inbox bubble rendering for both standard quote (`\n\n> ...`) and Instagram separator (`\n\n------\n> ...`) variants while keeping outbound channel disclaimer payload unchanged
- [x] **Inbox Skill Attribution:** Persist/show matched `skill_title` for bot skill replies in message footer metadata area (no label when no skill match)
- [x] **Unsaved Changes Modal:** Make secondary buttons hug content, save CTA single-line, and discard soft-danger
- [x] **Profile/Organization Settings:** Basic pages for user and org details
- [x] **Organization Settings:** Add self-service organization contact-data deletion flow (`Settings > Organization`) with password-confirmed modal and irreversible delete confirmation
- [x] **Auth UX Refresh**
  - [x] Sign In redesign (settings-aligned UI)
  - [x] Sign Up redesign (settings-aligned UI)
  - [x] Sign In/Sign Up primary CTA + auth switch links now use ink accent `#242A40` (blue removed)
  - [x] Auth shell now includes logo header, EN/TR language switcher, and desktop visual canvas panel
  - [x] Auth right panel now uses animated messenger preview (user + Qualy typed/deleted message loop)
  - [x] Auth messenger flow now simulates send lifecycle (type -> sent -> input reset -> Qualy reply)
  - [x] Auth composer now shows empty-field caret state after typed send and includes short sending delay animation before user bubble appears
  - [x] Auth sending state now keeps typed text visible until dispatch completes, then resets to placeholder-style empty input
  - [x] Auth composer reduced to compact single-line style with animated size transition, and right-panel chat block is vertically centered
  - [x] Auth canvas now runs 3 distinct conversation scenarios (2 turns each) and keeps 4 bubbles visible before switching scenario
  - [x] Auth canvas now includes dynamic lead scoring block near canvas header text, updated after each message (2 hot scenarios, 1 cold scenario)
  - [x] Auth composer stays single-line while disabled and briefly expands during sending state (`Gönderiliyor...`)
  - [x] Lead scoring pre-message state now shows a waiting placeholder (no pre-message prediction shown)
  - [x] Lead scoring UI moved to compact internal-analysis chip under top-left canvas text with animated 0-100 progress bar and stronger hot-state emphasis
  - [x] Removed duplicate lead scoring panel under the composer (single scoring surface kept in top-left analysis chip)
  - [x] Support-only scenario closes with concise handoff copy (“Talebin destek ekibine iletildi.”)
  - [x] Auth bubbles now explicitly label customer messages as `Müşteri` for role clarity in the preview
  - [x] Auth preview chat thread now uses max-height + internal scroll with hidden scrollbar and top gradient fade so long simulated conversations do not expand auth page height
  - [x] Auth preview message bubbles are anchored at the bottom so chat stays immediately above the composer/input area
  - [x] Auth preview thread now uses fixed/clamped viewport height with top fade clipping so the 4th bubble no longer pushes layout on shorter desktop heights
  - [x] Auth preview incoming bot bubbles now use smooth enter animation + typing-height reservation to remove perceived jitter during agent typing
  - [x] Auth preview thread/composer spacing increased so multi-line bot bubbles no longer touch the input/composer area
  - [x] Auth preview thread/composer spacing and bubble gap density tightened to reduce excessive vertical whitespace
  - [x] Sign Up consent sentence now stays single-line on desktop and wraps only on smaller screens
  - [x] Removed in-form Sign In/Sign Up segmented switcher (route-level pages + footer link navigation only)
  - [x] Reduced auth header logo size for a lighter top bar visual balance
  - [x] Sign Up form simplified to Full Name + Email + Password + inline legal consent notice (no required checkbox)
  - [x] Sign Up consent copy now links `Hizmet Koşulları` and `Gizlilik Politikası` to `https://askqualy.com/terms` and `https://askqualy.com/privacy` in a new tab
  - [x] Sign Up consent notice now renders as plain inline text (no bordered/boxed wrapper)
  - [x] Sign In and Sign Up forms now support password show/hide toggle
  - [x] Mobile Sign In/Sign Up inputs now use iOS-safe sizing (`text-base` on small screens) to prevent keyboard-triggered auto zoom
  - [x] Auth shell now uses dynamic viewport height (`dvh`) with stable light background defaults to avoid top/bottom black bars on mobile
  - [x] Password Recovery flow (forgot + reset)
  - [x] Forgot/Reset password forms now use the same auth visual language as Sign In/Sign Up (no nested card wrapper, ink-accent focus/CTA/link styles)
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
- [x] Offering profile AI suggestions now retry terse outputs with richer detail expansion, enforce post-repair detail validation, and use a higher completion token cap for slightly longer service-profile drafts
- [x] AI suggestions archive (archived tab with archive action; regenerate when no pending)
  - [x] Knowledge Base banner copy updated to “Hizmet profili önerileri hazır” and spaced from header
- [x] **Service Catalog (Hybrid)**
  - [x] Auto-propose services from Skills/KB
  - [x] Direct auto-add workflow (no manual approve/reject queue)
  - [x] Organization Settings Service List section (manual chips + AI toggle + AI-tag badges)
  - [x] Turkish UI terminology update: `Servis listesi` -> `Hizmet listesi`
  - [x] AI service-candidate extraction now parses Skill/Knowledge content for multiple service names (not title-only)
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
  - [x] Enforce JSON response mode (`response_format: json_object`) for extraction/follow-up/offering-profile structured outputs
  - [x] Extraction and lead-reasoning/summary helpers now enforce max output token caps
  - [x] Label customer vs assistant messages and respect customer negations
  - [x] Use last 5 customer messages and LLM-provided score/status
  - [x] Add role-labeled recent-turn context (`customer`/`owner`/`assistant`) so short customer confirmations can resolve the referenced field reliably
  - [x] Ensure latest message is included even with async writes
  - [x] Enforce locale-aware output language (TR/EN) for lead summary and extracted detail fields
  - [x] Include manual profile note with approved AI suggestions in extraction context
  - [x] Preserve previously extracted lead details when later turns omit fields (merge-on-update instead of destructive overwrite)
  - [x] `service_type` is intentionally not carry-forward merged; when current extraction has no service clue, service stays empty (`null`)
  - [x] Keep lead summary aligned to the current extraction window (avoid stale summary carry-over when omitted)
  - [x] Reject `service_type` inference on greeting-only/no-service-clue customer messages (prevents profile-only service hallucination)
  - [x] Accept `service_type` when customer wording matches profile service signals even if inferred service text is in another language (prevents false `Unknown` on bilingual extraction output)
  - [x] Canonicalize accepted `service_type` to approved catalog service name when alias-language matches exist (keeps extraction output consistent with org catalog/UI language)
  - [x] Extract and persist `services[]` (one or more) and keep `service_type` as primary canonical service for backward compatibility
  - [x] Force greeting-only low-signal conversations to remain `cold` and clear false `non_business=true` outputs
  - [x] Resolve extraction language with precedence: explicit preferred locale, then organization locale, then message-language heuristics
  - [x] Tighten required-intake fallback matching so only explicit canonical generic labels reuse `service/date/location/budget`; custom required fields no longer inherit unrelated generic extracted values
  - [x] Resolve custom required fields semantically across AI-collected and manual-override keys, and steer extraction to reuse exact configured field labels plus high-confidence implied answers when customer meaning is clear
- [x] **Lead Scoring**
  - [x] Implement 0-10 scoring algorithm
  - [x] Auto-generate AI summary
  - [x] Keyword-based intent fallback + score reasoning modal
- [x] **Lead Status**
  - [x] Hot / Warm / Cold classification
  - [x] Simplified status model to only `hot/warm/cold` (legacy `ignored/undetermined` normalized to `cold`)
  - [x] Status update triggers
- [x] **Inbox Lead Details**
  - [x] Read-only lead snapshot in conversation details
  - [x] Lead header shows "Updating" indicator during extraction
  - [x] Keep "Updated" timestamp visible while updating
  - [x] Show collected "Required Fields" values in lead details using Organization > Required Fields definitions
  - [x] Present collected required fields in an "Important info" card section with plain label-value rows inside
  - [x] Required-info resolver supports manual override precedence for future lead-edit workflows
  - [x] Manual overwrite UI for "Important info" values in Inbox (per field edit + save source tracking)
  - [x] Important info editor now renders missing required fields as editable blank rows so operators can fill AI gaps manually
  - [x] Important info now uses a full-width wrapped summary block in the panel with the single `Edit` action aligned in the section header, and opens one dedicated modal/sheet-style editor instead of inline per-row editing
- [x] **Lead List UX**
  - [x] Mobile leads list now uses compact card rows with reduced spacing while preserving the existing desktop table layout
  - [x] Desktop leads table keeps status chips on a single line and truncates long contact names to a single line
  - [x] Required-intake values shown in Inbox "Important info" are now rendered consistently in Leads table/mobile rows via shared resolver logic
  - [x] Leads service column/cards now render AI-extracted `services[]` values from `extracted_fields.services` (fallback to `service_type` for legacy rows)
- [x] **Operator Takeover Control**
  - [x] Toggle to keep lead extraction running during operator takeover (AI Settings)
  - [x] Inbox `Hizmet` row now supports compact inline editing from the active service catalog and preserves manual service overrides across extraction reruns
  - [x] Compact Details operator tools: tags/private note now render as plain sections below lead extraction, tag input is collapsed by default, empty private notes stay collapsed behind a single add action, empty tag state stays silent, private-note conflict checks ignore unrelated conversation updates, note metadata is reduced to two compact lines (`who`, `when`), and the main Details section titles/spacings are visually standardized
  - [x] Keep operator tags user-managed only; internal runtime tags such as `instagram_request` stay out of the editable tag surface
  - [x] Details sections (`Konuşma detayları`, `Kişi`, `Etiketler`, `Özel not`) are individually collapsible, and required-field rows now live inside `Kişi` instead of a second standalone `Önemli bilgiler` section
  - [x] `Konuşmadan Ayrıl` now stays in a dedicated footer region instead of sitting directly under private-note content
  - [x] Inbox composer now keeps `Şablonlar / Gönder` visible as labeled controls with matched heights alongside the reply input

---

## Phase 7: Admin Panel

- [x] **Dashboard**
  - [x] Overview stats
  - [x] Recent leads
- [ ] **Lead List**
  - [x] Filterable/sortable table
  - [x] Score, summary, status display
  - [ ] "Open in WhatsApp" button
- [x] **Skills Management**
  - [x] CRUD UI
  - [x] Search positioned above the unified skills list with always-visible add CTA
  - [x] Removed Core/Custom tab split; skills are managed in one list
  - [x] Skills empty-state icon now matches the sidebar Skills icon
  - [x] Backfill missing skill embeddings automatically when seeded skills exist without vectors
  - [x] Simulator-first testing accepted for MVP (no additional per-skill playground)
- [x] **Knowledge Base UI**
  - [x] CRUD with categories
  - [x] Rich text editor
- [x] **Channels**
  - [x] Telegram connection status + debug
  - [x] WhatsApp connection status + debug

---

## Phase 8: Platform Admin Features

- [x] System admin dashboard + organizations/users/leads lists
- [x] Organization switcher
  - [x] Searchable org switcher in main sidebar (system admin)
  - [x] Compact current-org summary in sidebar with explicit `Select/Change` action (always-open list removed)
  - [x] Modal-based organization picker with search, active marker, and reset action
  - [x] Persist active organization context via server-side cookie
  - [x] Apply switched org context across Inbox/Leads/Skills/Knowledge/Simulator/Settings
  - [x] Apply switched org context in platform-admin lead monitoring (`/admin` recent leads + `/admin/leads` list)
  - [x] Default home landing now routes system admins without explicit organization selection to `/admin` (not `/inbox`)
  - [x] Fallback to membership-linked org list when full system-admin organization query is unavailable
  - [x] Resolve system-admin active org in slim mode during navigation (avoid full org-list query on every route)
  - [x] Lazy-load full system-admin organization options only when org-picker modal opens
  - [x] Enforce read-only impersonation mode across tenant modules
  - [x] Show clear "viewing as organization" state and reset action
- [x] Admin route loading UX
  - [x] Admin organizations/users/detail routes now show explicit loading skeletons
  - [x] Loading UI now uses subtle animated `icon-black.svg` branding
- [ ] Cross-org debugging tools
  - [x] Admin-only org details page (`/admin/organizations/[id]`)
  - [x] Read org-level snapshots: usage, token usage, skills, knowledge stats (read-only table)
  - [x] Include profile-level details via user details view (multi-profile-ready membership listing)
  - [ ] Audit trail for admin-driven plan/quota updates
  - [x] Manual billing actions (system-admin): extend trial, adjust credits, assign/cancel premium with required reason
- [ ] Usage analytics per org
  - [x] Admin organization table columns: total usage, total token usage, total skill count, knowledge base count
  - [x] Admin organization list/detail now shows total storage usage per org with WhatsApp media breakdown
  - [x] Prevent admin organization list/detail message + token undercount by replacing single-page aggregate reads with per-organization exact count/paginated usage queries (Supabase default 1000-row limit safe)
  - [x] Admin organization table now shows current paid subscription fee with original billing currency (`TRY`/`USD`)
  - [x] Admin dashboard plan metrics now shows `Toplam Aylık Ödeme / Total Monthly Payment` (monthly plan + monthly extra-credit payment)
  - [x] Add premium/trial status visibility and plan cycle/status visibility (integrated with membership + credit snapshot read model)
  - [x] Add search + pagination for admin organization and user lists
  - [x] Compute admin dashboard stat cards via DB-side aggregate RPC (avoid full org summary scan on dashboard load)
  - [x] Clarify admin dashboard metrics: rename `Toplam Kullanım` card to `Toplam Mesaj` and show platform-wide credit usage when system admin has no explicit organization selection
  - [x] Add admin dashboard monthly plan metrics block (monthly plan payment amount/count, monthly top-up payment amount, monthly top-up credits purchased/used) and remove redundant overview/read-only/active-org summary cards
  - [x] Add admin dashboard period selector (`Tüm Zamanlar` + month) for message/token/used-credit cards
  - [x] Align admin used-credit totals with `organization_ai_usage`-based credit cost aggregation to fix dashboard vs organization-detail mismatches
  - [x] Move organization list search/pagination to DB-level count + range queries (no in-memory full-list slicing)
  - [x] Batch organization metric aggregation to avoid per-organization N+1 read fan-out
  - [x] Load organization detail profile layer with targeted org/member/profile queries (no full-table scans)
  - [x] Avoid heavy org-summary aggregation when building admin user lists (use lightweight organization lookup only)
  - [x] Load admin user detail via targeted profile + memberships + related-org snapshots (no full user/org scan)
- [x] Billing/Quota Visibility (Admin)
  - [x] Show premium/trial periods with membership/lock reason + credit used/remaining visibility (read-only)
  - [x] Show token/message usage values (read-only)
  - [x] Enable system-admin billing edit controls with required reason capture

---

## Phase 8.5: Monetization & Subscription (Pre-Pilot)

- [ ] **Pricing Strategy**
  - [x] Define plan tiers, quotas, and overage policy
  - [x] Confirm launch pricing posture: low-entry starter around ~USD 10 equivalent (TRY-localized) to reduce first-purchase friction
  - [x] Lock billing order: recurring monthly premium package first, then optional credit top-up overflow
  - [x] Lock top-up eligibility: disabled during trial; enabled for any active premium organization (package exhaustion not required)
  - [x] Lock package credit policy: monthly package credits do not roll over to the next billing cycle
  - [x] Define monthly premium package defaults (`X TL` price, `Y` included credits) and admin change boundaries
  - [x] Publish pricing/credit guide with token-based COGS, trial credit option analysis (`100/120/200/250/1000`), and recommended baseline (`docs/plans/2026-02-16-pricing-credit-strategy-guide.md`)
  - [x] Define Lovable-like `upgrade-first` reference model in pricing guide (plan-tier ladder + non-stacking mid-cycle upgrade behavior + premium burst top-up packs)
  - [x] Add customer-facing conversation-equivalent ranges and package-level cost/profit tables to pricing guide
  - [x] Set Turkish market baseline price points and localized USD prices (admin-configurable TRY/USD per plan and top-up)
  - [ ] Define annual discount policy
  - [ ] Finalize feature gating by plan (channels, AI limits, seats)
- [ ] **Plan Purchase (Online Payment)**
  - [x] Select payment provider + integration model (TR compliance and invoice requirements; recurring subscriptions required)
  - [x] Implement recurring monthly premium checkout flow
  - [x] Implement immediate Iyzico upgrade flow for active premium subscriptions with non-stacking entitlement update
  - [x] Implement top-up checkout flow (available for active premium subscriptions)
  - [x] Prevent implicit mock auto-activation when live env vars are missing; explicit mock now requires `BILLING_MOCK_ENABLED=1` in every environment
  - [x] Implement payment webhook sync + failed-payment handling
- [ ] **Membership States (Trial / Premium)**
  - [x] Define state model (`trial_active`, `trial_exhausted`, `premium_active`, `past_due`, `canceled`, `admin_locked`)
  - [x] Enforce entitlements in tenant runtime and admin read models
  - [x] Surface membership state in settings and platform admin pages
- [ ] **Trial Policy Finalization**
  - [x] Decide trial model: trial-only launch (no freemium plan in pre-pilot)
  - [x] Define trial end behavior and lock rule: system locks token-consuming features when either time or credit cap is reached first
  - [x] Define trial limits and precedence (`14 days`, `200.0 credits`, precedence: whichever is reached first)
  - [ ] Finalize upgrade prompts for in-product conversion
  - [ ] Add grace/extension policy for manual sales-assisted overrides (if needed)
- [ ] **Paywall Implementation (Execution)**
  - [x] Add billing schema (`organization_billing_accounts`, `organization_credit_ledger`, `credit_purchase_orders`, `platform_billing_settings`) with RLS and entitlement SQL helpers
  - [x] Enforce paywall gates in inbound AI pipeline + dashboard token-consuming actions
  - [x] Split tenant settings IA into `/settings/plans` (subscription/top-up management entry) and `/settings/billing` (usage + receipts details)
  - [x] Refine IA split to remove duplicate plan controls from `/settings/billing` and keep `/settings/billing` focused on read-only account snapshot + ledger/usage analytics
  - [x] Add admin trial-default controls (new organizations only) and admin premium-package controls (`X TL`, `Y` credits)
  - [x] Add admin credit visibility (used/remaining/lock reason) on organization/user detail surfaces
  - [x] Add admin per-organization manual overrides: trial extension, top-up/trial/package credit increment-decrement, premium activation/deactivation, and membership/lock override
  - [x] Add admin per-organization billing action history visibility (audit rows with actor + reason)
  - [x] Add tenant billing paywall UI foundations (membership/lock banners, trial/package/top-up balances, credit usage history)
  - [x] Simplify tenant billing UX copy/labels (Plans + Billing) and remove non-essential Billing sub-analytics to keep decision-first flow
  - [x] Add lightweight usage visibility entry points in desktop sidebar and mobile More menu (trial + package progress and quick links to Plans action surface)
  - [x] Refine desktop sidebar + mobile More usage card copy to decision-first state matrix (trial credits until trial end, then package credits + top-up breakdown with actionable lock/upgrade hints)
  - [x] Standardize Turkish billing terminology to use `ücretsiz deneme` instead of `trial` in user-facing copy
  - [x] Refresh sidebar/mobile billing snapshot on checkout query updates so premium activation is reflected without manual page reload
  - [x] Make transient Plans checkout/renewal banners dismissible so stale query-state errors can be cleared without leaving the page
  - [x] Reset stale Iyzico checkout runtime on hosted checkout mount/unmount and switch Plans/callback redirects to locale-aware `as-needed` paths so repeated package attempts do not render a blank checkout surface
  - [x] Add pre-Iyzico legal consent gate for subscription and top-up checkout, using public `Qualy-lp` legal pages in new tabs and a non-final `continue` CTA before provider payment
  - [x] Enforce checkout legal consent server-side and resolve selected plans/top-up packs from server catalog IDs so hidden client fields cannot bypass consent or tamper with credits/pricing
  - [x] Preserve unused trial credits as persistent extra-credit balance on first premium activation while keeping monthly package credits non-rollover
  - [x] Refresh sidebar/mobile billing snapshot on client-side route changes and reconcile embedding/indexing usage into visible `Settings > Usage` buckets so async content-processing credits do not require a hard reload to appear consistently
  - [x] Emit explicit browser refresh events after async Knowledge Base processing completes so sidebar/mobile billing cards and KB suggestion indicators update even when realtime timing is delayed
  - [x] Standardize user-facing top-up terminology to `ek kredi / extra credits`
  - [x] Make sidebar usage card compact: default view shows remaining credits + decreasing progress bar, with chevron-expand breakdown (package vs extra credits)
  - [x] Gate system-admin tenant sidebar sections behind explicit organization selection (no selection shows only Admin navigation)
  - [x] Move platform billing default controls from `/admin` dashboard to dedicated `/admin/billing` page
  - [x] Expand platform billing defaults for multi-currency pricing catalog (Starter/Growth/Scale + top-up 250/500/1000 in TRY/USD) and seed final baseline values via migration `00061_multicurrency_pricing_catalog.sql`
  - [x] Update Scale package baseline from `999 TRY` to `949 TRY` to keep plan ending consistency
  - [x] Overhaul `/settings/plans` with package ladder + top-up ladder, organization billing-region-based currency display (TR=TRY, non-TR=USD), and safe monthly conversation-range marketing copy
  - [x] Replace manual billing-region selection in `/settings/organization` with automatic signup-time billing-region persistence on organization (`organizations.billing_region`) and use that persisted value as `/settings/plans` currency source (`TR` => `TRY`, non-TR => `USD`)
  - [x] Standardize Turkish package display names to `Temel / Gelişmiş / Profesyonel` across tenant plans and admin billing dictionaries
  - [x] Standardize `/admin` tables as full-width with horizontal overflow support
  - [x] Fix admin empty-state rendering on server routes by avoiding non-serializable icon component props across server-client boundaries
  - [x] Add mock checkout simulation (subscription + top-up success/failure states) to validate flow before real provider integration
  - [x] Add tenant self-serve subscription renewal controls in `/settings/plans` (turn auto-renew off/on with period-end effect) backed by migration `00062_mock_subscription_renewal_controls.sql`
  - [x] Align package-change UX with common SaaS behavior: upgrades stay immediate, downgrades are scheduled to next cycle with effective-date messaging, and tier cards hide direct downgrade CTA (`00063_mock_checkout_schedule_downgrades.sql`)
  - [x] Move premium subscription controls to modal-first UX: `Planı yönet / Manage plan` modal for tier changes + separate cancellation confirmation modal
  - [x] Improve top-up modal option-row readability: larger right-column price text and vertical centering
  - [x] Enforce billing hard-lock workspace mode: when entitlement is locked, tenant access is restricted to `/settings/plans` and `/settings/billing` only; inbox read/send access is blocked
  - [x] Backfill existing non-system-admin organizations into trial mode baseline for rollout (`00058` migration)
  - [x] Publish iyzico production-integration execution plan (`docs/plans/2026-02-17-iyzico-billing-integration-implementation-plan.md`)
  - [x] Add recurring premium checkout + top-up checkout callback sync (token retrieve) + idempotent credit/package grants
  - [x] Add payment webhook sync for provider lifecycle events
  - [x] Make iyzico self-serve cancellation provider-backed but keep access active until period end, hide unsupported in-app resume for provider-backed cancellations, and treat failed recurring renewals as `past_due` with locked usage until payment is resolved
  - [x] Remove scheduled-cancellation undo CTA from Plans UI so users resubscribe manually after period end if needed
  - [x] Add one-hour post-period grace window plus atomic renewal-success RPC to reduce false lockouts and partial renewal-state drift during webhook retries/delays
  - [x] Validate iyzico sandbox success/decline card scenarios and normalize provider failure codes into user-facing checkout errors instead of generic callback failures
- [ ] **Trial Abuse Prevention**
  - [x] Enforce one-trial-per-business policy keyed by `whatsapp_business_account_id` + normalized phone + company identity signals (`trial_business_fingerprints` + signup pre-check + billing initialization + WhatsApp connect enforcement)
  - [ ] Add risk controls for disposable email domains, VOIP-heavy signup numbers, and repeated device/IP fingerprints
  - [x] Add signup velocity limits + cooldown windows for repeated failed/abusive trial attempts (implemented via `check_signup_trial_rate_limit` + `record_signup_trial_attempt` RPCs using `email + IP` buckets and optional Turnstile CAPTCHA on Sign Up)
  - [ ] Define suspicious-signup review flow (auto-restrict to sandbox/no-live-reply until manually cleared)
  - [ ] Add admin-side trial-abuse audit log for unblock/override actions

---

## Phase 8.6: Public Legal Center

- [x] Add markdown legal source folder (`legal/*.md`) with required version metadata (`id`, `version`, `last_updated`, `document_title`)
- [x] Add legal routing and rendering for `/legal`, `/terms`, `/privacy` on landing app
- [x] Add build-time legal manifest generation (`scripts/generate-legal-assets.mjs` -> `public/legal_versions.json`)
- [x] Wire footer legal navigation to legal center, privacy, and terms routes
- [x] Add Netlify SPA redirect fallback (`public/_redirects`) so direct legal route visits resolve to `index.html`
- [x] Simplify footer information architecture by removing Resources/Company columns and keeping Product + Legal columns
- [x] Route Product footer links to homepage sections with smooth auto-scroll (`features`, `pricing`, `how-it-works`)
- [x] Repoint Product scoring item to testimonials section and update label copy to testimonials (`#testimonials`)
- [x] Publish Facebook/Meta data-deletion instructions guide for landing implementation (`docs/FACEBOOK_DATA_DELETION_INSTRUCTIONS_GUIDE.md`)

---

## Phase 9: Testing & QA

- [x] Address strict TypeScript build errors (router history typing + indexed access guards)
- [x] Stabilize test + lint + build quality gates after troubleshooting sweep
- [x] Remove `no-explicit-any` debt in critical modules (AI, Inbox, Knowledge Base, Leads, Channels, shared types)
- [x] Document executable Phase 9 closure plan (`docs/plans/2026-02-10-phase-9-testing-qa-implementation-plan.md`)
- [x] Add non-photography Knowledge Base extraction QA fixture for dental-clinic domain validation (`docs/kb-fixtures/2026-02-dis-klinigi-kb-cikartim-test-fixture.md`)
- [x] Publish manual simulator-only AI QA Lab design for LLM-generated, multi-turn closed-loop evaluation (`docs/plans/2026-02-19-ai-qa-lab-llm-closed-loop-design.md`)
- [x] Implement admin `AI QA Lab` manual run queue + immutable run snapshot persistence (`qa_runs` migration, `Settings > QA Lab` page, server actions)
- [x] Implement runtime executor lifecycle (`queued -> running -> completed/failed`) with immutable artifact/report writes
- [x] Implement two-model QA flow (`Generator` + `Judge`) with QA-local responder execution (synthetic KB + fallback, no tenant skill/org dependency)
- [x] Keep QA assistant profile explicitly isolated/versioned (`qa_lab_only`) so iterative QA prompt improvements do not auto-apply to live assistant behavior
- [x] Surface QA assistant profile metadata (`assistant id`, `profile version`, `isolation`, `auto-port`) in QA run detail parser/UI and align QA report schema version to `v2`
- [x] Implement run preset configuration surface (`Quick`, `Regression`) with hard token budgets (`100k`, `100k`) in run snapshots
- [x] Implement runtime budget-stop behavior (`BUDGET_STOPPED`) during scenario execution
- [x] Expose AI QA Lab in Admin navigation for system-admin workflow (`/admin/qa-lab`)
- [x] Lock QA Lab access to only allowlisted admin identity (`togayaytemiz@gmail.com`): enforce in server actions, settings/admin QA Lab pages, and admin sidebar visibility
- [x] Exclude internal `AI QA LAB` organization from system-admin organization picker / active-context fallback so admin panel tenant selection stays clean
- [x] Exclude internal `AI QA LAB` organization from admin dashboard platform totals and admin organization read-model lists (`organizations`, `skills`, `knowledge docs`, `messages/tokens/credits` cards)
- [x] Standardize Admin AI QA Lab headers with consistent `Back/Geri` breadcrumb behavior
- [x] Move QA run launch to queue-first async flow with automatic background worker execution (no manual worker button in UI) to reduce timeout risk and keep trigger UX simple
- [x] Fix QA run launch FIFO misfire: UI now executes the newly created run ID directly after enqueue, preventing older queued runs from being picked first on `batch=1`
- [x] Harden QA responder/judge sector-agnostic consistency: refusal replies no longer count as fulfilled fields, policy/procedure intents de-prioritize intake forcing, missing-field prompts use category-based wording, and judge missing-field claims are filtered against case-level intake coverage
- [x] Add per-scenario effective required-intake scoping in QA execution/coverage so policy-procedure scenarios can opt out of global lead-qualification required fields
- [x] Improve QA sector-agnostic semantic/type-field handling and judge exact-field consistency: infer type-like fields from natural entity cues (`kedim`, `...yım`, `my X`), prioritize explicit general-info intent over generic service-word routing, and normalize/drop judge field-name mismatches against case-level intake coverage
- [x] Tighten QA sector-agnostic semantic fallback and judge scenario consistency: broad semantic fallback now applies only to generic fields (not timeline/business-size/etc.), intake categories recognize `timing` / `business size`, re-ask findings prefer judge-declared target field category, and cold+resistant+general-info fails are softened to `warn` when handoff readiness is already `pass`
- [x] Align QA run-result and responder fidelity with scenario reality: run result now treats scenario `warn/fail` assessments as `pass_with_findings` even when finding list is empty, service-detail detection recognizes broader sector-agnostic project/service wording, judge missing-field claim filters recognize `did not ask` style phrasing, and generic “no clear detail” fallbacks are rewritten to actionable but non-pressuring next steps
- [x] Tighten QA run realism for cross-sector simulation quality: enforce generator scenario-mix coverage (`hot/warm/cold` + at least one `resistant`), require urgency collection via value-level semantics (not keyword-only mention), strengthen responder KB baseline context with critical policy/service anchors, and suppress consecutive repeated engagement-question patterns
- [x] Add Judge output normalization into a pipeline improvement action set section on QA run details
- [x] Extend generator flow to produce sequential QA assets (`KB fixture -> derived setup -> scenario mix`) with hot/warm/cold + info-sharing variants for realistic lead-quality coverage
- [x] Expand QA run details to show full artifact chain (`KB fixture lines`, `ground truth references`, `derived setup`, `conversations`, `findings`) for manual QA review
- [x] Align AI QA Lab list/detail headers and layout with admin full-width page standard (`PageHeader` + left breadcrumb + full-width content)
- [x] Keep KB artifact UI compact with preview-first card and full-text modal viewer (no long inline KB block)
- [x] Add run-level sequential pipeline self-check block (`pass/warn/fail`) to validate KB -> setup -> scenario -> execution -> judge order
- [x] Harden QA generator execution with retry attempts and persisted attempt-level diagnostics on failure (`error.details.stage=generator`)
- [x] Lower QA fixture minimum-line requirement from `200` to `150` for run presets and DB validation
- [x] Refine Judge pricing-groundedness rule: if KB has no numeric pricing, no penalty for withholding exact price; penalize only fabricated pricing claims
- [x] Refine QA engagement-question policy: allow contextual single follow-up, penalize only repetitive/menu-like consecutive prompts
- [x] Add per-run USD cost estimation (`gpt-4o-mini` input/cache/output rates) to QA run report/list/detail surfaces
- [x] Add intake-fulfillment coverage analysis (required field asked/fulfilled/missing) and handoff-readiness signals to QA report, judge payload, pipeline checks, and run detail UI
- [x] Remove communication-preference from mandatory QA intake expectation (replace with better coordination signals) and penalize only repetitive asks
- [x] Tighten QA generator quality gate for semantic fixture diversity and excessive fallback-line artifacts
- [x] Add generator fixture auto-stabilization pass to repair low-diversity outputs before final quality gate failure
- [x] Adapt simulated customer turns to previous assistant clarifications (answer-or-boundary behavior) so execution transcripts remain context-coherent
- [x] Make simulated customer adaptation sector-aware via generated service catalog (remove education-specific fallback replies in non-education sectors)
- [x] Add history-aware contradiction filter for synthetic customer budget statements (avoid cross-turn budget drift when not explicitly re-asked)
- [x] Normalize urgency-like required fields (`Acil Durum` etc.) to actionable urgency intake and extend coverage matching with natural urgency language
- [x] Enforce deeper scenario-turn distribution in Quick/Regression generation (meaningful share of scenarios reach 4+ turns within 3-6 bounds)
- [x] Tighten Judge evidence discipline: each finding must include scenario/turn citation formatting before high-confidence reporting
- [x] Add sector-agnostic semantic intake fulfillment inference and responder blocked-field re-ask guard (fulfilled/deferred), and update Judge to penalize re-asking inferable provided fields
- [x] Fix intake-coverage false negatives for context-style service fields (e.g., `Talep bağlamı`): allow broad semantic fallback for service-context fields after explicit assistant ask, while still excluding deflection replies
- [x] Add Judge consistency guards: retry suspiciously low judge scores with strict 0-100 scale and drop findings whose cited scenario attributes contradict finding text
- [x] Fix intake asked-coverage false negatives for natural question phrasing (e.g., "öğrenebilir miyim") and normalize asked/fulfilled contradictions (`asked=0` with high fulfillment)
- [x] Enforce per-scenario Judge assessments (answer quality, logic, groundedness) with fallback completion for omitted cases and expose results in run detail UI
- [x] Stabilize Judge JSON reliability via dynamic output-token scaling by scenario count + invalid-JSON recovery retry; cap QA preset scenario count to `15`
- [x] Reduce Judge false positives and improve QA realism: drop citation-backed `did not ask` mismatches when assistant already asked the field/category, penalize low-information assistant replies at scenario level, tighten synthetic customer continuation alignment to previous assistant prompts, and suppress engagement questions after explicit stop-contact requests
- [x] Finalize QA-Lab intake scoping consistency: general-information scenarios now use empty required-intake scope like policy/procedure scenarios, and Judge generic missing-intake findings/issues are dropped when case-level intake coverage already indicates sufficient progression
- [x] Harden QA assistant realism: enforce answer-first ordering on direct questions, strip intake pressure in general-information/policy modes and refusal turns, and trigger soft no-progress next-step responses after two consecutive non-progress qualification turns
- [x] Apply run-driven QA stabilization patchset: promote request mode to qualification when customer intent becomes actionable mid-scenario, require same-field repeat evidence for repetitive-question findings, keep QA responses chat-first (no website/phone redirect loops), and sanitize duplicated fixture expansion suffixes
- [x] Harden sector-agnostic QA mode-routing and consistency cleanup: prioritize lead intent over incidental policy-fact overlap (unless explicit policy cues exist), force customer-turn-first policy/general -> qualification promotion for actionable turns, widen external-contact redirect sanitization (`telefon numaramız`, `iletişim bilgilerinizi paylaşın`, etc.), and drop stale scenario issues when consistency summaries explicitly state the claim was cleared
- [x] Tighten Judge pricing false-positive cleanup and responder unknown-fallback grounding: clear scenario-level/conversation-level pricing-detail penalties when KB has no numeric price and assistant gives pricing-basis guidance, and replace generic unknown replies with best available grounded KB detail before follow-up prompting
- [x] Extend Judge finding consistency cleanup for follow-up-style false positives: treat `insufficient follow-up / inquiry` phrasing as did-not-ask category, and drop top-level findings when cited scenario summary explicitly states that the corresponding claim was cleared by consistency checks
- [x] Strengthen generator + judge realism gates: enforce minimum actionable lead-intent scenario ratio, add semantic-duplication checks for scenario openings/goals, soften missing-field penalties when remaining field was asked on the final turn, and normalize QA assistant numeric/punctuation surface artifacts (`12. 000` -> `12.000`)
- [x] Add generator-side scenario auto-stabilization for actionable-coverage failures: when generated scenario packs miss required lead-intent ratio, rewrite a minimal subset to diverse sector-agnostic actionable openings/goals before final quality validation so retries do not fail on repeated low-actionable output
- [x] Calibrate judge for cold-resistant informational cases: clear generic `lack of proactive questioning` warnings/findings when request mode is `general_information`, coverage is already sufficient, and assistant behavior stays grounded/non-pushy
- [x] Harden QA response language lock by improving Turkish ASCII detection (`Sadece iptal edin yeter`) and normalizing mixed-language fallback snippets so assistant replies stay in the user’s turn language
- [x] Start live-assistant QA-port Phase 1: add shared response guards (language consistency, answer-first ordering, refusal-aware intake-question stripping, repeated-engagement suppression, chat-first redirect sanitization, surface artifact normalization) to fallback and RAG response paths (WhatsApp shared pipeline, Telegram webhook, simulator chat actions)
- [x] Start live-assistant QA-port Phase 2 foundations: make required-intake followup guidance request-mode aware (policy/general turns avoid forced intake) and add refusal/no-progress guardrails to reduce repetitive intake pressure
- [x] Complete live-assistant QA-port Phase 2/3 runtime behavior: add sector-agnostic intake-state analysis (dynamic minimum short-conversation scope, collected/deferred blocked re-ask fields, missing-field priority calibration) and enforce the same state via response guards in fallback + RAG across shared inbound pipeline, Telegram webhook, and simulator
- [x] Finalize live-assistant QA-port P1/P2 hardening: enforce no-progress loop-break outputs (concise summary + soft next-step) in runtime guards and inject best-available KB context hints into generic fallback generation before topic-only redirection
- [x] Finalize live-assistant rollout strategy as no-flag global default: keep QA-port behavior active for all current organizations and as default behavior for every new organization
- [x] Fix live blocked re-ask regression for refusal/no-progress turns: partial-but-strong field mention matching now blocks repeat intake asks for previously asked fields (e.g., `Öğrenci Yaşı` vs `çocuğunuzun yaşı`) and follow-up guidance explicitly enforces `do not insist`
- [x] Tighten live intake wording-drift safety for contact fields: shared follow-up/response-guard matching now also catches phone-number phrasing drift (for example `Telefon Numarası` vs `ulaşabileceğimiz numara`), and external-contact redirect sanitization no longer rewrites ordinary customer-number intake asks
- [x] Fix QA Lab request-mode Unicode normalization regression: Turkish dotted-uppercase inputs (e.g., `İptal koşulları...`) now normalize without token split so explicit policy/procedure intent is not misclassified as `general_information`
- [x] Tighten QA assistant closure quality: keep one-turn deferred retry tolerance (without refusal pressure), enforce explicit follow-up missing-field closure questions, guarantee question-first answer chunks for direct asks, and replace filler-style low-info enrichments with grounded concise detail + mini-summary next-step phrasing
- [x] Refine resistant-flow trustworthiness: closure summaries now require explicit customer evidence, snake_case intake fields are humanized in user-facing questions, and resistant pricing turns use a single soft critical-field ask with no-pressure fallback wording
- [x] Unit tests for core logic
- [x] Integration tests for WhatsApp flow
- [x] E2E tests for admin panel
- [x] Baseline webhook load testing for message handling (`autocannon`)
- [x] Concurrent-user WhatsApp stress scenario runner with configurable signed live-webhook mode, multi-turn contact simulation, and latency/error summaries
- [x] Admin AI latency analytics for load testing: record lead-extraction completion time and LLM reply latency, then surface average + p95 metrics on the Admin dashboard

---

## Phase 9.5: Calendar / Scheduling / Booking ✅

- [x] Deliberately promote calendar / booking from post-MVP backlog into pilot-operational scope with a controlled v1 boundary
- [x] Add first-class `/calendar` route with desktop sidebar access and mobile bottom-nav access
- [x] Convert `/calendar` into a full-width operator workspace and move heavy settings editing behind a dedicated `Takvim ayarları` entry instead of a bottom-of-page settings wall
- [x] Ship day / week / month / agenda views plus quick `today / this week` summaries and filterable booking lists
- [x] Add org-scoped booking settings: timezone, fallback duration, slot interval, minimum notice, and before/after buffers
- [x] Add weekly availability-rule management and service-duration management on top of the existing service catalog
- [x] Move durable calendar configuration into top-level `Settings > Calendar` and keep Google Calendar integration controls under `Settings > Applications`
- [x] Polish calendar settings density and clarity: compact per-day business-hour rows, inline timing-rule help, and a simpler Google provider status card
- [x] Keep `/calendar` interactions fast by moving view/date switching into client-local cached navigation instead of full route pushes on every click
- [x] Add booking persistence foundation with overlap protection, conversation/lead/service metadata, and organization isolation
- [x] Add Google Calendar OAuth connection boundary with free/busy overlay and optional write-through mirroring
- [x] Add AI scheduling behavior for service clarification, real alternative slot suggestions, and confirmed booking creation
- [x] Extend AI scheduling continuity across follow-up availability questions and hand booking-change requests to operators instead of auto-rescheduling
- [x] Harden calendar correctness boundaries: enforce disabled-booking backend guards, replace availability rules atomically, keep existing Google mirrors clean after write-through opt-out, and escalate no-slot / implied-reschedule AI turns into real human handoff
- [x] Close calendar review follow-ups: enforce minimum notice consistently, clean mirrored future events on Google disconnect, fail scheduling exceptions safe into handoff, tighten booking-intent detection, and invalidate cached calendar windows after mutations
- [x] Let operators override booking duration per appointment, capture customer email in the modal + booking record, and standardize calendar dropdown spacing through a shared select primitive
- [x] Align `/calendar` header action sizing with `/knowledge` and switch the `Yeni randevu` CTA from blue to the shared dark primary styling
- [x] Keep manual booking validation inside the popup with localized past-date / slot-unavailable / conflict messaging instead of raw page-level English errors
- [x] Add targeted tests for service duration fallback, availability computation, booking intent, scheduling flow, and mobile nav access

---

## Phase 10: Pilot Launch

- [x] Prepare AI copywriter-ready static launch asset brief grounded in repo + PRD + roadmap + release notes, with Turkish-first terminology and non-team positioning guardrails
- [ ] Finish GTM readiness hardening before expanding beyond the first 5 pilots
  - [x] Keep inbound AI reply path fast by deferring lead extraction + hot-lead escalation side work until after reply delivery, with regression coverage for deferred execution and failure isolation
  - [x] Make operator outbound delivery durable by queueing pending Inbox rows before provider dispatch and finalizing them to `sent` / `failed` across text, template, and media send paths
  - [ ] Close remaining P0 product gaps tracked elsewhere: Leads `Open in WhatsApp`, cross-org admin audit trail, plan feature gating, upgrade prompts, and trial-abuse controls
  - [ ] Add pilot KPI instrumentation and weekly review cadence (`signup -> channel connected -> first AI reply -> first hot lead -> operator takeover -> paid conversion`)
  - [x] Add lightweight operator CRM tooling for pilot teams (editable conversation tags and private notes)
  - [ ] Decide the post-pilot parity roadmap for website widget/live chat, third-party integrations, tenant-facing reports, and mobile/PWA alerts while keeping campaigns/broadcasts out of pilot scope
- [ ] Onboard 5 pilot customers
- [ ] Monitor success metrics
- [ ] Collect feedback
- [ ] Iterate based on learnings

---

## Post-MVP (Future)

- [x] Calendar / booking integration foundation promoted to Phase 9.5 and implemented as v1
- [ ] Flow builder
- [ ] Auto follow-up sequences
- [ ] Vertical preset marketplace
