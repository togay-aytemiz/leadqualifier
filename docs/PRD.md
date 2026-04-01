# WhatsApp AI Qualy — PRD (MVP)

> **Update Note (2026-04-01):** WhatsApp disconnect copy must say this action removes only Qualy's local channel relationship. The operator-facing confirm state should explicitly say it does not disconnect the customer's WhatsApp Business app, phone number, or Meta/WABA setup.
>
> **Update Note (2026-04-01):** `Settings > Channels > WhatsApp > Disconnect` must only sever Qualy's local channel relationship. It should remove the local channel record without requiring operators to disconnect their WhatsApp Business app or provider-side WABA setup first.
>
> **Update Note (2026-03-31):** WhatsApp template tooling must be unmistakably separate from Qualy's generic saved-message templates. `Settings > Channels > WhatsApp` should label this surface as `WhatsApp Templates`, keep the main send modal focused on that separation, and place WABA-specific onboarding/help inside the `How to use` guide only. Closing the nested guide must dismiss just that guide without navigating away or closing the parent template modal.
>
> **Update Note (2026-03-31):** On the WhatsApp onboarding landing screen, the `WhatsApp Business app number` / coexistence path should be the first and default option because it is expected to be the most common SMB path. Copy should stay simple, explicitly mention `WhatsApp Business Account (WABA)`, and mark this option as recommended.
> **Update Note (2026-03-31):** Pending WhatsApp channels must support non-destructive webhook recovery. Operators should be able to retry webhook provisioning without disconnecting the channel, and the first valid inbound WhatsApp webhook POST should mark the channel verified automatically so a locally pending row can self-heal as soon as real delivery starts.
> **Update Note (2026-03-31):** WhatsApp Business app / coexistence Embedded Signup completion must recover immediately after auth-code return when the client does not receive Meta's final `FINISH` postMessage. The UI may wait only a short grace window for the event; after that it must continue with server-side WABA/phone discovery from the exchanged token, persist the local channel row, and let Inbox/webhook provisioning proceed instead of sitting in `Bağlanıyor...` while the phone already shows Business Platform linked.
> **Update Note (2026-03-31):** WhatsApp disconnect failures must stay operator-friendly. If local channel removal fails, the UI should render a localized Qualy-side error instead of leaking a generic server-action failure.
> **Update Note (2026-03-31):** Auth surfaces must map common provider credential failures into localized UI copy. Turkish sign-in should never show raw Supabase English errors like `Invalid login credentials`; it should render the product translation instead.
> **Update Note (2026-03-31):** Collapsed desktop sidebar nav-item tooltips must appear immediately on hover. The slim rail should not add fade/slide delay before the label becomes readable.
> **Update Note (2026-03-31):** The collapsed desktop main sidebar must use a dark rail treatment with white branding/icons and higher-contrast active pills, so the slim shell state matches the intended focused navigation mood instead of reading like a compressed light sidebar.
> **Update Note (2026-03-31):** WhatsApp Business app / coexistence onboarding launch must include Meta's `extras.featureType = "whatsapp_business_app_onboarding"` flag on the client launcher. A dedicated existing-number config ID alone is not sufficient; without the feature flag, the Embedded Signup popup can fall back to the generic `add a phone number` flow.
> **Update Note (2026-03-31):** `Settings > Channels` gallery order must stay `WhatsApp`, `Instagram`, `Facebook Messenger`, `Telegram`, and the responsive card grid must top out at 3 columns so the fourth card wraps onto the next row instead of stretching to 4-up on ultra-wide desktops.
> **Update Note (2026-03-31):** Lead extraction must treat media-backed first-contact info requests as real commercial intent, not `cold` ambiguity. When a customer asks for information/details about the shared attachment (for example `bunun hakkında daha fazla bilgi alabilir miyim?`), the lead should be promoted to at least `informational_commercial` / `warm` even before the exact service name is explicit.
> **Update Note (2026-03-31):** Sign Up confirm-email completion must return client-consumable redirect state from the register server action so successful no-session signups reliably leave the register form and land on `/register/check-email`.
> **Update Note (2026-03-30):** WhatsApp onboarding support must now open the team WhatsApp chat directly instead of drafting an email, and the landing-card copy must explicitly route personal-account users into the `new API account` path while keeping the `Business app number` path reserved for existing WhatsApp Business app numbers.
> **Update Note (2026-03-30):** WhatsApp existing-number / coexistence Embedded Signup completion must stay mode-aware. The server may only call phone-number registration and persist a generated two-step PIN for `new` Embedded Signup; `existing` onboarding must skip that new-number registration step while still completing shared token exchange and app subscription.
> **Update Note (2026-03-30):** WhatsApp Embedded Signup mode hardening now requires both client entry points to forward the chosen mode into completion, and invalid/untyped mode payloads must fail with a dedicated validation error instead of collapsing into the generic missing-fields branch.
> **Update Note (2026-03-29):** In live Iyzico billing mode, active-premium downgrades must be scheduled at period end through the provider and persisted as a pending plan change on the active subscription record so `Settings > Plans` can keep showing the upcoming package and effective date on later visits. When auto-renew has already been turned off at Iyzico, the UI must also avoid promising an in-app resume path. Active premium plan-change popups must also distinguish hosted checkout from direct subscription actions, show current vs target monthly pricing plus effect timing, and avoid quoting an exact upgrade charge unless the integration can preview it reliably.
> **Update Note (2026-03-29):** Inbox browser-tab unread indicator must update from live inbox unread state snapshots while the operator is already on the Inbox route. New inbound realtime messages should light the tab immediately without waiting for manual refresh or a delayed unread-count roundtrip.
> **Update Note (2026-03-29):** Inbox selected-thread timeline must refresh when realtime conversation metadata proves the list preview has moved ahead of the loaded thread. Operators should not see a newer last-message snippet in the sidebar while the open conversation body still lags behind.
> **Update Note (2026-03-29):** Instagram deleted-message handling should suppress deleted-only Inbox noise end to end. If the first or only customer DM is later deleted, Inbox should not keep a visible thread at all; established conversations may still show the deleted state without treating it like a fresh unread inbound turn, Inbox list fallback should also hide older deleted-only Instagram rows whose sole preview message is that deleted event, and those stale rows must no longer leak into queue counts or Inbox/browser unread indicators. Unresolved IG identities should use a localized generic contact label instead of raw numeric ids.
> **Update Note (2026-03-28):** Inbox realtime should self-recover after long idle tabs. Browser resume events (`visibilitychange`, `focus`, `pageshow`, `online`) must rebuild Supabase subscriptions and reconcile the first conversation page plus the selected thread, and broken channel states (`CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`) must trigger the same self-healing path so operators do not need a manual refresh to see new messages.
> **Update Note (2026-03-28):** Instagram Inbox reaction events should no longer render as raw `[Instagram reaction] react ❤️` text bubbles. Reaction rows must persist structured reaction metadata, parse legacy raw rows backward-compatibly, and clarify when the customer reacted to the business message instead of sending a standalone heart message.
> **Update Note (2026-03-28):** Localized Instagram reaction labels may keep an `{emoji}` placeholder in EN/TR copy. Inbox must treat those as raw templates and inject the emoji at render time instead of requesting formatted i18n output without interpolation values.
> **Update Note (2026-03-28):** Lead extraction should classify first-message business interest with a sector-agnostic semantic `intent_stage` (`none`, `informational_commercial`, `qualification`, `booking_ready`) instead of relying on static language-specific pricing keywords. First-message commercial inquiries should therefore rise to `warm` even before service confirmation, while `hot` still requires stronger qualification evidence.
> **Update Note (2026-03-27):** AI QA Lab consistency cleanup must recognize normalized clear-summary phrasing and English `budget` wording. Stale did-not-ask/follow-up/missing-field penalties should clear when transcript or intake coverage already disproves the claim, while abstract placeholder replies still count as low-information unless the assistant is giving a grounded general-information offer.
> **Update Note (2026-03-27):** Lead extraction should recover the approved canonical service from current conversation plus summary evidence when raw `service_type/services` are empty, and required-intake repair should scan recent customer turns for category-compatible answers including relative timeline phrasing such as `1 ay içinde` instead of only trusting the latest message.
> **Update Note (2026-03-27):** Lead scoring now recalibrates `score/status` from merged extraction evidence before persistence, so later acknowledgement-only turns such as `Teşekkürler` cannot overwrite previously captured date/intent signals with `cold/0`.
> **Update Note (2026-03-27):** Turkish calendar-integrations copy should consistently say `Google Takvim` on the applications surface instead of mixing `Google Calendar` into otherwise localized descriptive text.
> **Update Note (2026-03-27):** `Settings > Applications` should treat Google Calendar as a passive coming-soon integration for now. The app card must use localized placeholder status copy (`Google Takvim` / `Yakında` in TR), expose no clickable connect CTA yet, and `Settings > Calendar` plus `Settings > Applications` save actions must stay disabled until the active surface actually has unsaved changes.
> **Update Note (2026-03-27):** `Settings > Plans` should keep the one-time extra-credit purchase as the primary expansion action: the custom-package contact card belongs directly beneath it and should use a quieter secondary CTA treatment.
> **Update Note (2026-03-27):** `Settings > Plans` extra-credit balance must keep the original trial limit visible when premium extra credits come from trial carryover. A remaining balance like `153.5` should therefore render against `200`, not collapse to `153.5 / 153.5`.
> **Update Note (2026-03-27):** Desktop main sidebar should feel calmer and more scannable. The expanded sidebar now uses Linear-style category headers with per-section collapse/expand behavior, slightly larger gaps between groups, lighter active pills, and slightly smaller desktop nav typography while the collapsed rail keeps the full icon set visible.
> **Update Note (2026-03-27):** Settings navigation should now preserve the shell on settings-to-settings transitions. The global dashboard pending overlay must not paint over settings routes, settings loading should stay scoped to the detail pane, and billing-lock nav state should hydrate client-side so the settings layout does not block on billing snapshot reads.
> **Update Note (2026-03-27):** Heavy settings detail routes should stream their slow server payloads behind local `Suspense` boundaries. `Settings > Billing`, `Settings > Plans`, and `Settings > Organization` must show page chrome first, then resolve slower detail data; `Settings > Plans` must also treat `billing_region` persistence as non-blocking post-response work instead of mutating during the GET render path.
> **Update Note (2026-03-27):** Settings first-load bundle cost should stay focused on immediately visible UI. Hidden organization-details sections and checkout legal-consent modals must lazy-load with `next/dynamic` instead of landing in the initial settings bundle.
> **Update Note (2026-03-27):** Settings subpage revisits within the same session should feel instant. The shell may reuse the last rendered detail-pane content for a previously opened settings route during the pending navigation phase, provided that warmed snapshot is scoped to the same organization and locale and stays non-interactive until fresh content arrives.
> **Update Note (2026-03-27):** Settings navigation must keep a production-like E2E guard. Playwright coverage should delay settings destination responses, prove that cold settings navigation leaves the shell visible, and prove that warmed revisits paint cached detail content immediately while the detail pane remains `aria-busy` until fresh data lands.
> **Update Note (2026-03-27):** Workspace route entry should keep the same bundle discipline as Settings. `Inbox`, `Calendar`, `Leads`, `Skills`, and `Knowledge` must lazy-load their heavy route containers behind `next/dynamic`, and `Inbox` must not block initial page paint on the first selected-thread bootstrap.
> **Update Note (2026-03-27):** Leads-to-Inbox operator flow should be direct. Clicking any lead row/card must open `/inbox?conversation=...`, and Inbox bootstrap must hydrate that requested conversation even when it is not present in the default first-page list payload.
> **Update Note (2026-03-27):** Desktop dashboard typography should now be denser by default on operator surfaces. Inbox, details, calendar, leads, settings, knowledge, and admin content use a slightly smaller shared text scale, while the desktop sidebar is nudged one step larger than its current size so navigation still reads comfortably.
> **Update Note (2026-03-27):** `Settings > Plans` premium status should hide redundant credit cards once extra credits are exhausted. If `topupBalance` reaches `0`, the extra-credit balance and combined-total cards should disappear, leaving only the monthly package card visible; while extra credits remain, usage priority stays `extra credits first, then monthly package`.
> **Update Note (2026-03-27):** Inbox header utility controls should use plain icon chrome. The list filter trigger and selected-thread read/unread toggle stay icon-only with subtle hover/active cues instead of persistent bordered pill buttons.
> **Update Note (2026-03-27):** Inbox template picker must not flash the empty-state warning before template fetches finish. First-open empty panes should stay in a loading state with skeleton/copy feedback until the initial request resolves; only then may the `no templates` message appear.
> **Update Note (2026-03-27):** Inbox selected-thread header now includes a manual read/unread toggle. Marking a thread unread must survive the normal switch-away auto-read path; it becomes read again only when the operator marks it read manually or re-enters that thread later from another conversation.
> **Update Note (2026-03-27):** Cross-surface best-practices remediation should keep dashboard UI semantics and runtime safety aligned: Inbox attachment chips, Knowledge cards/table rows, and Skill cards must use valid link/button structure; shared primitives plus calendar/settings/mobile-nav/auth flows must avoid synchronous effect-driven state mirroring; route-prefetch inputs should stay memoized; and channel webhook lookups should rely on indexed JSONB keys.
> **Update Note (2026-03-27):** Shared modal primitives now require a localized `common.close` label in both EN and TR bundles. Missing that key is treated as a runtime regression because client-rendered dialogs can fail during render and trigger misleading React/Turbopack overlay errors on top of the original i18n exception.
> **Update Note (2026-03-26):** Inbox operator-facing bot labels must treat the stored default bot name as non-custom. If `bot_name` is still the default assigned value, mobile/desktop header and details surfaces should continue to show the generic assistant label; only custom bot names should replace it.
> **Update Note (2026-03-26):** Inbox mobile composer should keep template/send actions icon-only on phone widths so the reply field can consume the remaining horizontal space; visible text labels return from `sm` upward.
> **Update Note (2026-03-26):** Client-side Inbox thread-cache hydration must be idempotent. After the selected conversation is already loaded, list/sidebar rerenders must not re-apply the same cached payload, and shared dropdown primitives must ignore duplicate open-state notifications, otherwise local React render loops can break Inbox and sidebar surfaces.
> **Update Note (2026-03-26):** Required-intake repair must validate value-to-field category compatibility before persisting AI-collected values. If a stale AI value is semantically incompatible with the target field, it should be dropped; then related stronger sibling evidence may backfill the correct field and infer a clean affirmative status (for example a due-date answer can fill the due-date field and normalize a related status field to `Evet`, while unrelated status fields stay untouched).
> **Update Note (2026-03-26):** Inbox must not trust a warmed empty thread cache when the conversation list already shows a real preview message. If sidebar preview data and cached thread payload disagree, the client should invalidate the stale cache entry and refetch the thread instead of opening the conversation as blank.
> **Update Note (2026-03-26):** Inbox thread caching must never let a selection change overwrite another conversation’s cached thread with the transient empty reset state. Cache writes should be scoped to the currently loaded conversation only, otherwise the list can show a valid preview while the thread opens as blank.
> **Update Note (2026-03-26):** Inbox inline images should keep a stable bubble footprint while media is decoding. Chat media must reserve a consistent image frame and show an in-frame loading spinner instead of rendering a zero/partial-height bubble that later expands after image load.
> **Update Note (2026-03-26):** Inbox first-load UX must preserve the server-bootstrapped conversation list through client hydration. Filter-reload logic may reset the list only after a real filter key change, not on initial mount or React Strict Mode replays, so `/inbox` does not flash `No messages / Mesaj yok` before the actual list/thread payload becomes visible.
> **Update Note (2026-03-26):** Client-cached `/leads` navigation must preserve browser history semantics. Operator-driven page/sort/search changes should create back/forward entries, `popstate` should restore the visible query state from the URL, and stale in-flight page fetches must be invalidated when history navigation lands on an already cached result.
> **Last Updated:** 2026-04-01 (WhatsApp disconnect now removes only Qualy's local channel relationship without requiring provider-side deregistration, and the operator-facing confirm copy explicitly says it does not disconnect the customer's WhatsApp Business app/Meta setup; WhatsApp template UX explicitly separates Meta WABA templates from Qualy's normal saved messages and keeps WABA setup/help inside the `How to use` guide; nested guide close no longer dismisses the parent template modal; WhatsApp onboarding defaults to the recommended WhatsApp Business app/WABA path with simpler copy; pending WhatsApp channels support webhook retry without disconnect plus first-inbound self-verification; WhatsApp Embedded Signup requires auth-code-based recovery plus short-grace fallback after missing Meta `FINISH`; alongside localized sign-in credential errors, the dark collapsed desktop sidebar rail with immediate slim-mode tooltips, and the `Settings > Channels` `WhatsApp`, `Instagram`, `Facebook Messenger`, `Telegram` order with a maximum of 3 columns on wide desktop.)
> **Update Note (2026-03-26):** Client-cached Leads prefetch must stay non-destructive: background warming may populate the cache, but it must not replace the currently visible page state or jump operators from page 1 to a later page. Inbox/Leads navigation should also avoid stacked loading surfaces; the global optimistic route overlay should yield to route-segment loaders for these heavy pages so operators do not see a `loading -> content -> loading` flash during entry.
> **Update Note (2026-03-26):** Inbox thread-open should now bootstrap the first selected conversation from one combined server payload (`messages + lead`) and keep a per-conversation client cache so reopening hot threads can render immediately instead of waiting for duplicate client-side actions. Leads sort/search/pagination should likewise stay inside a client cache seeded from the initial server payload rather than forcing a full App Router navigation on every interaction.
> **Update Note (2026-03-26):** Required-intake capture and live follow-up now share one sector-agnostic semantic contract: contextual same-turn answers can count as fulfilled before extraction reruns, and lead extraction runs deterministic exact-label repair plus a constrained missing-field repair pass to recover remaining high-confidence required fields from conversation evidence.
> **Update Note (2026-03-26):** When unused trial credits are converted into persistent extra credits on premium activation, premium AI usage must consume that extra-credit balance before the monthly package, and `Settings > Plans` should show the same total remaining credits visible in the sidebar.
> **Update Note (2026-03-26):** Desktop sidebar and mobile usage cards must format billing renewal dates and credit counts with the active app locale instead of browser defaults, so Turkish workspaces render fully localized values such as `20 Nis` and `2.081,1`.
> **Update Note (2026-03-26):** Leads list relative-time copy should stay compact: use single-line `Last Activity / Son Aktivite` labels, replace localized approximation prefixes like `about` / `yaklaşık` with `~`, and keep both mobile cards and desktop rows visually dense.
> **Update Note (2026-03-26):** Inbox filters must not claim an empty result set from a partial page. When `Unread` or customer-score filters have no matches in the currently loaded conversation slice but additional pages remain, the client should backfill more conversations before rendering the filter empty state so the list stays consistent with org-level unread indicators.
> **Update Note (2026-03-26):** Inbox `Unread` and customer-score list filters should run in backend paginated conversation queries. The client may still live-filter locally after realtime updates, but it must not rely on post-filtering only the already loaded slice because that hides matching conversations behind lazy-load boundaries.
> **Update Note (2026-03-26):** Skills page reads should stay on a strict hot-path budget: query existing skills first, seed localized defaults only when the workspace is truly empty, and never run embedding-maintenance scans during normal list navigation. Knowledge collection counts should come from an aggregate DB path rather than scanning every `knowledge_documents` row on page load.
> **Update Note (2026-03-26):** Inbox should inline-preview inbound media whenever the stored asset clearly resolves as an image (for example `image/*` MIME type or image-like stored URL/filename), even if the provider-level message type was persisted as `document` or `unknown`; only non-image assets should remain on the explicit `Open file` fallback card.
> **Update Note (2026-03-26):** Instagram `lookaside.fbsbx.com/ig_messaging_cdn` links should count as previewable image assets even when Meta does not provide a file extension or MIME type, so shared/story attachment previews render inline from the persisted remote URL instead of degrading to the generic file card.
> **Update Note (2026-03-25):** Dashboard navigation and auth entry should now acknowledge intent immediately. Sidebar/mobile/settings active state switches to the clicked destination before `pathname` commits, post-auth redirect resolution uses only lightweight profile + active-org-cookie signals instead of validating full organization context, and the `(dashboard)` group now exposes a root loading boundary so auth-to-app entry shows shell feedback earlier.
> **Update Note (2026-03-25):** `/calendar` header actions should visually match `/knowledge`: the settings action keeps the standard secondary button size, and `Yeni randevu` uses the shared dark primary CTA instead of blue.
> **Update Note (2026-03-25):** Manual calendar booking errors must render where the operator is working. The booking modal now owns past-date and common availability/conflict validation messaging, and UI copy must map away raw English backend messages for expected scheduling failures.
> **Update Note (2026-03-25):** Calendar detail browsing should stay focused on the grid. Booking cards no longer need a status chip in the calendar surface, and detail inspection/edit/cancel now happens from a click-open modal instead of a persistent desktop side panel.
> **Update Note (2026-03-25):** The booking-detail interaction must be view-consistent. Day, week, month, and agenda cards should all open the same detail modal, and month-view cards must expose enough scannable context at a glance, including customer identity and the visible start-end time span.
> **Update Note (2026-03-25):** Calendar card styling should also stay view-consistent. Day, week, and agenda booking cards now use the same background-only filled treatment as month view instead of bordered mini-cards, with the week `today` state keeping the matching darker filled variant.
> **Update Note (2026-03-25):** Deployment environments must stay current with calendar schema migrations before manual booking writes are expected to work, and booking modal footer actions should keep the standard page button footprint rather than compact `sm` sizing.
> **Update Note (2026-03-25):** Instagram share-style messages and story replies should opportunistically render inside Inbox when Meta includes a directly previewable URL in webhook payloads. Qualy now persists preview URLs from Instagram `attachments[].payload.url` and `reply_to.story.url`, attempts inline preview when the URL looks like a real media asset, and falls back to the existing `Open Instagram` copy only when no previewable asset link is available.
> **Update Note (2026-03-25):** When Instagram still sends an unsupported attachment placeholder without a previewable asset link, Qualy now persists a limited raw-debug snapshot (`mid`, `is_unsupported`, `attachments`, `reply_to`) on the message so support can inspect the exact Meta shape that produced the fallback bubble.
> **Update Note (2026-03-25):** Inbox list filtering is now a compact header action. The title row exposes one filter icon that opens `All / Unread` and `All / Hot / Warm / Cold` choices, includes an inline `Sıfırla / Reset` action, keeps customer-score chips color-coded with a stronger selected state, and leaves unread conversations in the filter until the operator manually switches away.
> **Update Note (2026-03-25):** Browser tab titles must survive App Router transitions consistently. Dashboard layouts and auth pages now publish localized Next metadata titles as the canonical base title, while the client-side tab-title sync is limited to dynamic Inbox unread decoration on top of that metadata.
> **Update Note (2026-03-24):** Dashboard refresh should default to active-org-only tenant resolution unless a surface explicitly needs the full accessible-organization list. Inbox thread-open should fetch the latest message page and lead snapshot in parallel, reuse the already known organization context when possible, and push sender-profile hydration plus mark-read persistence off the first-paint path.
> **Update Note (2026-03-23):** The client shell must fail safe across deploy-time asset drift. If the browser receives a real Next chunk 404 / `ChunkLoadError` from `/_next/static/...`, Qualy now retries exactly once with a cache-busting reload so stale HTML or chunk manifests do not strand the operator on the generic application-error screen.
> **Update Note (2026-03-23):** Dashboard navigation must feel immediate in production. Desktop sidebar, mobile bottom-nav, and Settings inner navigation now warm the main dashboard route families on explicit user intent (`hover/focus/touch/click`), and the dashboard shell renders the destination skeleton immediately while the App Router is still resolving the next payload.
> **Update Note (2026-03-22):** Required-field population is now explicitly sector-agnostic. Lead extraction should prefer exact configured field labels in `required_intake_collected`, while runtime resolution may semantically match equivalent AI-collected or manual-override keys and accept approximate or high-confidence implied customer answers when evidence is strong.
> **Update Note (2026-03-22):** Inbox media preview wording must respect message direction. The operator should see localized `sent/gönderildi` copy for outbound media turns and `received/alındı` copy for inbound media in both sidebar previews and media-card fallback labels.
> **Update Note (2026-03-20):** Inbox refresh/open should stay responsive even when Instagram profile hydration is needed. Contact profile lookups now run in bounded parallel mode with a timeout budget, and conversation-switch flow avoids duplicate lead refresh calls for the same selection.
> **Update Note (2026-03-20):** Auth/session entry and dashboard navigation should feel immediate in normal use. Successful login/signup sessions with an active session now redirect directly to the localized final workspace route, hidden desktop mobile-nav instances skip billing hydration entirely, main sidebar keeps only unread state on the immediate path while billing/pending/bot-mode hydrate after first paint, and shell prefetch is selectively enabled for primary workspace/settings navigation instead of being blanket-disabled.
> **Update Note (2026-03-21):** `Settings` navigation must not block on advisory badge data. Pending suggestion counts now hydrate on the client after the shell renders, stale async responses from prior organization contexts are ignored, and settings-route prefetch targets stay stable when badge state changes.
> **Update Note (2026-03-21):** Dashboard shell refresh should minimize duplicated client IO. Desktop sidebar is now the canonical unread-state producer, unread checks use existence reads plus a partial DB index instead of exact counts, hidden mobile-only sidebar mounts no longer start unread/billing/bot-mode work, and settings inner-nav links avoid eager visible-link prefetch on first paint.
> **Update Note (2026-03-21):** Dashboard route payloads must scope locale messages by route family. The root shell now carries only `auth/common/nav/mainSidebar/aiSettings`, and nested route layouts add heavier namespaces only when required (`inbox`, `settings`, `knowledge`, `admin`, `calendar`, etc.), cutting the raw Turkish root dashboard message payload from about `112 KB` to about `14.6 KB`.
> **Update Note (2026-03-21):** Inbox list previews must remain correct even when realtime delivery is partial. If a conversation-row realtime update advances `last_message_at` ahead of the cached snippet, the sidebar should re-hydrate preview messages in the background; when a thread is fetched directly, that fetched history should also refresh the corresponding sidebar preview without requiring a hard browser reload.
> **Update Note (2026-03-20):** Instagram `seen/read` events are operational metadata, not customer message turns. They must not bump conversation unread/recency state, and conversation day separators must be derived from visible (non-seen) messages so Inbox cannot show orphaned `Today` labels without a bubble.
> **Update Note (2026-03-20):** Direct Instagram-app reply identity must survive `page_id`-addressed webhook deliveries. When an outbound `echo` event is keyed by linked Page ID instead of the canonical Instagram business ID, Qualy should keep trying the stored Instagram-scoped account identifiers before falling back, so outgoing bubbles can still show the connected account username/avatar instead of generic `Instagram`.
> **Update Note (2026-03-19):** Unsupported Instagram content that Qualy cannot render inline yet (for example share/reel-style attachment placeholders without previewable media) must not open as an apparently empty thread. Inbox list and conversation body should show a localized fallback telling the operator to open Instagram to view that content.
> **Update Note (2026-03-19):** When direct Instagram-app replies are mirrored from webhook `echo` events and there is no internal `created_by` user profile, outgoing Inbox bubbles should render the connected Instagram business username/avatar from persisted webhook metadata instead of generic `User` initials.
> **Update Note (2026-03-19):** Direct-Instagram outbound sync must reuse the existing customer conversation when recipient IDs drift across Instagram-scoped identities. If Qualy resolves the same customer username/profile, it should append the outbound turn to that existing thread instead of opening a second empty conversation.
> **Update Note (2026-03-19):** Instagram webhook ingest must persist business-account `echo` messages as outbound Inbox history. If an operator replies directly inside the Instagram app, Qualy should mirror that turn into the same conversation as a `user` message, refresh the contact username/avatar from Graph when available, and clear stale `instagram_request` state after the reply.
> **Update Note (2026-03-19):** Required-intake fallback must stay conservative. Qualy may reuse generic extracted fields only for explicit canonical labels such as `Hizmet / Konum / Tarih / Bütçe`; custom organization-defined required fields must be filled by explicit `required_intake_collected` extraction or manual operator edits.
> **Update Note (2026-03-19):** `Settings > Plans` subscription catalog cards should anchor their primary CTA row to the bottom edge of each card so plan buttons stay visually aligned even when conversation-range copy wraps to different line counts.
> **Update Note (2026-03-19):** Inbox details should not show Instagram numeric user IDs as a secondary line under the username/avatar. Keep the stored identifier for routing and API calls, but hide that secondary identifier in operator details surfaces for Instagram conversations.
> **Update Note (2026-03-19):** Instagram `Request/İstek` badge classification must stay explicit. Qualy should only mark a thread as request-origin when webhook metadata resolves to `standby` or when the conversation already carries the internal `instagram_request` tag that has not yet been cleared by an outbound reply. Missing outbound replies, unresolved numeric Instagram IDs, plain `messaging` events, or reaction-only previews are not sufficient evidence on their own.
> **Update Note (2026-03-19):** Instagram messaging onboarding must follow the official Instagram Business Login flow (`instagram.com/oauth/authorize` → `api.instagram.com/oauth/access_token` → `graph.instagram.com/access_token`) and must provision webhook subscriptions with `POST /{instagram_account_id}/subscribed_apps` before the channel is considered deliverable. Missing subscription setup leaves the channel stuck in `pending` with no inbound DM delivery.
> **Update Note (2026-03-19):** Channel setup surfaces must use one readiness contract. For Instagram, `pending` means OAuth/account access exists but Qualy has not yet recorded webhook verification for that channel row; operator-facing copy should not describe that state as fully ready to receive conversations.
> **Update Note (2026-03-18):** Instagram channel readiness now mirrors WhatsApp: a channel row marked `active` is not enough to claim Inbox delivery is ready. Connect flows persist webhook provisioning state, verification marks the channel `verified`, and webhook ingest must accept Meta `page_id` delivery identities in addition to Instagram business/app-scoped ids so delivered DMs reach Inbox.
> **Update Note (2026-03-18):** WhatsApp onboarding now distinguishes `asset attached` from `channel ready`: manual/OAuth/Embedded connect flows persist webhook provisioning state, operator UI stays in pending/attention until Meta verifies the callback, and BSP migration uses guided existing-number Embedded Signup instead of generic asset-discovery OAuth.
> **Update Note (2026-03-18):** `Settings > Channels` now follows the same wide dashboard rhythm as `/calendar` and admin surfaces: the centered max-width shell is gone, and the gallery uses the full page width while capping the card grid at 3 columns on wide desktop layouts.
> **Update Note (2026-03-17):** New/edit booking modal UX now treats expected duration as an operator-editable per-booking field, persists customer email as first-class booking data, and uses one shared select primitive so calendar dropdown chevrons keep the same inset spacing across filters and modal forms.
> **Update Note (2026-03-17):** `/calendar` interactions should feel immediate in normal operator use. View/date switches now stay inside client state with a buffered booking window and URL sync, instead of re-running the full route on every calendar click.
> **Update Note (2026-03-17):** AI scheduling now continues inside the same booking thread when the user asks follow-up availability questions like `O gün yok mu?` or `Cuma var mı?` without repeating the service. Reschedule/change requests remain intentionally human-routed in v1.
> **Update Note (2026-03-17):** Calendar hardening closes correctness gaps behind the UI: disabled booking mode now blocks backend availability and creation, weekly availability-rule replacement is atomic, already-mirrored Google events still clean up after write-through is disabled, and no-slot / implied-reschedule AI paths emit real human handoff.
> **Update Note (2026-03-17):** Calendar review follow-ups are now part of the product contract: minimum notice is enforced for generated slots, exact requested slots, and booking writes; disconnecting Google Calendar must clean mirrored future events before unlinking; scheduling exceptions fail safe into operator handoff instead of generic AI fallback; generic suitability turns like `Bu bana uygun mu?` no longer count as booking intent; and `/calendar` dirties cached windows after mutations so stale weeks/months are not reused.
> **Update Note (2026-03-17):** The operational `/calendar` surface should expose only one `Takvim ayarları / Calendar settings` entry. Summary cards no longer repeat the same settings CTA.
> **Update Note (2026-03-17):** Calendar preference UI was tightened again: business-hour editing now keeps day status plus start/end times on one row, timing-rule jargon is clarified with inline help, and the Google provider card removes redundant labels in favor of a shorter `Bağla / Connect` action.
> **Update Note (2026-03-17):** Calendar UX is now deliberately split into dedicated settings homes: `/calendar` stays the operational workspace, `Settings > Calendar` owns booking rules/business hours/service durations, and `Settings > Applications` owns Google Calendar connectivity plus sync behavior.
> **Update Note (2026-03-17):** Calendar route no longer exports a `CalendarPage` component; it now uses a neutral page component name to avoid the same Next.js 16.1.6 Turbopack dev overlay crash class (`'... cannot have a negative time stamp'`) previously seen on the locale entry route.
> **Update Note (2026-03-17):** Calendar was intentionally promoted from post-MVP backlog into the active product scope as a controlled v1 foundation: one org-level scheduling resource, internal source of truth, existing service catalog reuse, optional Google Calendar busy overlay + write-through mirroring, first-class `/calendar` route, and AI behavior that clarifies service before making duration-sensitive promises.
> **Update Note (2026-03-16):** Inbox Details now uses collapsible `Konuşma detayları / Kişi / Etiketler / Özel not` sections on both mobile and desktop, keeps `Konuşmadan Ayrıl` in a visually fixed footer region instead of letting it drift into section content, nests required-field rows inside `Kişi` instead of rendering a second standalone `Önemli bilgiler` block, and the composer now exposes visible `Şablonlar / Gönder` actions with matched control heights for a cleaner reply surface.
> **Update Note (2026-03-15):** Added a GTM prelaunch audit (`docs/plans/2026-03-15-gtm-prelaunch-audit.md`) to distinguish launch-critical pilot work from competitor-parity items; pre-pilot focus is now activation/conversion, operator workflow essentials, abuse controls, and pilot KPI visibility rather than full-suite parity.
> **Update Note (2026-03-15):** Admin now records durable AI latency events separately from token/cost usage so real load tests can track average and p95 lead-extraction completion plus successful LLM user-response times per organization and reporting period.
> **Update Note (2026-03-15):** Phase 9 QA now includes a second load-test layer for realistic webhook traffic: `npm run test:load:messages` remains the raw `autocannon` baseline, while `npm run test:load:users` simulates concurrent WhatsApp contacts with configurable multi-turn traffic, latency percentile reporting, timeout/transport-error counts, and optional signed execution against a real app URL.
> **Update Note (2026-03-14):** Inbox mark-read now emits a shared unread-update client event so the main sidebar dot and Inbox tab title refresh immediately instead of waiting for realtime state to catch up.
> **Update Note (2026-03-14):** Successful profile photo saves now trigger an immediate dashboard-layout refresh so the sidebar user chip reflects the new image without a manual reload.
> **Update Note (2026-03-14):** Profile settings now use `profile photo / profil fotoğrafı` wording in user-facing copy, clarify that the uploaded image is used only inside Qualy, and let users preview the current photo by clicking it.
> **Update Note (2026-03-14):** If avatar upload succeeds but saving `profiles.avatar_url` fails, the newly uploaded storage object is now cleaned up immediately so retry/error paths do not leak orphan avatar files.
> **Update Note (2026-03-13):** Profile settings now support per-user avatar upload with client-side square WebP conversion, the main sidebar user chip reuses uploaded profile avatars with initials fallback, outbound operator Inbox messages resolve the real author identity from persisted `messages.created_by`, and bot bubbles use a branded Kualia avatar treatment.
> **Update Note (2026-03-13):** Live AI intake protection now shares one wording-drift matcher across follow-up analysis and runtime response guards, and plain customer-number collection prompts must not be rewritten by the external-contact redirect sanitizer.
> **Update Note (2026-03-13):** Launch/marketing asset generation now has a dedicated source brief (`docs/launch-static-asset-copywriter-brief.md`); Turkish launch messaging should prefer single-inbox/operator framing and avoid English `lead` terminology or team-based primary positioning.
> **Update Note (2026-03-12):** Inbox now keeps `Request/İstek` visible for Instagram conversations that already carry the conversation-level `instagram_request` tag until an outbound reply clears it, even when the latest inbound metadata resolves to `messaging`.
> **Update Note (2026-03-12):** Outbound Instagram image optimistic rendering now keeps the selected local preview visible during upload/send; Inbox should not flash a broken placeholder image before realtime/server refresh swaps in the stored media URL.
> **Update Note (2026-03-11):** Social avatar hydration now uses Instagram user `profile_pic` and Inbox can fall back to inbound message metadata for contact avatars, so existing/live conversations still render profile photos when conversation-level persistence lags behind deployment state.
> **Update Note (2026-03-11):** Locale entry route no longer exports a `Home` component, avoiding the Next.js 16.1.6 Turbopack dev overlay crash (`'Home' cannot have a negative time stamp`) on the root redirect page.
> **Update Note (2026-03-09):** Main sidebar bot-status now uses a neutral loading state until org bot mode is fetched, preventing temporary incorrect `Active` (green) rendering on refresh.
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

| Segment        | Profile                             |
| -------------- | ----------------------------------- |
| Beauty centers | Solo owner or small team            |
| Photographers  | Newborn / maternity specialists     |
| Future         | Dental clinics, real estate offices |

**Common traits:** Non-technical, 1-3 person team, WhatsApp-heavy operations.

---

## 3. MVP Scope

### ✅ In Scope (Target MVP)

| Feature                | Description                                                                                                                                                                                                                                                                                                                  | Status (2026-02-10)                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp Integration   | Single number per org                                                                                                                                                                                                                                                                                                        | Implemented (Meta Cloud API MVP: OAuth channel setup, popup-based connect UX, webhook verification, inbound text + media (`image`/`document`) processing, and reactive outbound replies)                                     |
| Instagram Integration  | Single business account per org                                                                                                                                                                                                                                                                                              | Implemented (Meta OAuth channel setup, popup-based connect UX, webhook verification, inbound text + image processing, reactive outbound text + image replies; separate channel from WhatsApp)                                |
| AI Auto-Reply          | Skill-based + KB fallback                                                                                                                                                                                                                                                                                                    | Implemented for Telegram + WhatsApp + Instagram + Simulator                                                                                                                                                                  |
| User-Generated Skills  | Custom intent → response mappings                                                                                                                                                                                                                                                                                            | Implemented                                                                                                                                                                                                                  |
| Knowledge Base (RAG)   | FAQ, packages, policies                                                                                                                                                                                                                                                                                                      | Implemented                                                                                                                                                                                                                  |
| Lead Extraction        | AI summary + score (0-10)                                                                                                                                                                                                                                                                                                    | Implemented (Telegram + WhatsApp + Instagram; Inbox details now supports manual overwrite for important-info fields with AI/manual source tracking and return-to-AI reset)                                                   |
| Human Takeover         | Bot pauses when business replies                                                                                                                                                                                                                                                                                             | Implemented (active_agent + assignee lock)                                                                                                                                                                                   |
| Multi-Tenant           | Organization-based isolation                                                                                                                                                                                                                                                                                                 | Implemented                                                                                                                                                                                                                  |
| Admin Panel            | Leads, Skills, KB, Channels management                                                                                                                                                                                                                                                                                       | Partial (Dashboard + Leads + Skills/KB/Inbox/Settings/Channels implemented; organization-level billing audit history is visible in org detail; pending: `Open in WhatsApp` quick action and cross-org billing audit tooling) |
| Public Legal Center    | Landing legal docs (`/legal`, `/terms`, `/privacy`) rendered from versioned markdown and exposed via `public/legal_versions.json`                                                                                                                                                                                            | Implemented                                                                                                                                                                                                                  |
| **Inbox UI**           | **Real-time chat, history, manual reply, delete, assignee system, unread indicators, on-demand summary, glowing AI summary trigger + inline chevron toggle, mobile list→conversation flow with details toggle, and cumulative per-conversation AI credit usage in details**                                                  | Implemented                                                                                                                                                                                                                  |
| **Calendar / Booking** | **First-class `/calendar` module with org-level booking settings, business hours, service-duration-aware scheduling, booking CRUD, per-booking duration override + customer-email capture in operator booking forms, day/week/month/agenda views, Google Calendar connection boundary, and AI availability/booking support** | **Implemented as controlled v1 foundation (internal source of truth + optional Google busy overlay / write-through mirroring)**                                                                                              |

### ❌ Out of Scope (Intentional)

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
- Language detection for this policy must also handle common ASCII Turkish turns without diacritics (for example `Sikayetim var`); when the current turn is ambiguous, runtime should use recent customer-message history as fallback so Turkish conversations do not receive English escalation/handover notices.
- Instagram MVP supports reactive inbound text + image capture and reactive outbound text + image replies to customer-started threads (no proactive/template-initiated flow in MVP). When an operator includes both text and images in the Inbox composer, Instagram sends the images and then sends the typed text as a separate follow-up message because the media send path is attachment-based.
- WhatsApp MVP supports reactive inbound text plus media (`image`/`document`) capture. Media-only inbound events are persisted to Inbox without automatic AI reply; captioned media continues through normal AI flow. Inbox should inline-preview any inbound media whose persisted asset clearly resolves to an image (for example `image/*` MIME type or image-like stored URL/filename), even when the provider event itself was delivered as `document` or `unknown`.
- Inbox timeline groups consecutive image-only WhatsApp messages from the same sender into gallery-style bubbles (2/3/4+ image grid) to reduce visual clutter in media-heavy threads.
- Inbox scroll-to-latest behavior must keep smooth animation while also remaining pinned to the true latest message when layout changes after initial render (for example composer warning blocks and lazy-loaded media reflow).
- Inbox message history should default to latest-page load and fetch older pages on upward scroll (infinite history), preserving viewport position after prepend.
- Inbox realtime must self-heal after long-lived tab inactivity. When the browser returns to the app (`visibilitychange`, `focus`, `pageshow`, `online`) or a Supabase channel reports a broken state (`CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`), the client must rebuild subscriptions and reconcile the first conversation page plus the selected thread so operators do not need a hard page refresh to see new messages.
- Inbox browser-tab unread indicator must stay in sync while the operator is already inside Inbox. New inbound realtime messages should publish an immediate unread-state snapshot to the shared shell so the tab title dot can update without waiting for manual refresh or a delayed unread query.
- Inbox selected-thread timeline must also self-heal when conversation-level realtime updates advance `last_message_at` beyond the loaded thread preview. If the sidebar row is newer than the open thread, the client must refresh that selected thread immediately instead of waiting for a later resync.
- Inbox composer now supports outbound WhatsApp `image`/`document` attachments with pre-send preview/remove controls, `max 10` attachment cap, and optimistic delivery state feedback.
- WhatsApp template send is available only as an explicit manual utility (Settings > Channels and Inbox expired-window action) for review/operational continuation, not as automated conversation runtime behavior.
- Skill replies in WhatsApp can include quick-action buttons; each button either deterministically triggers another skill (`trigger_skill`) or sends a configured URL (`open_url`) as a bot reply text, and WhatsApp displays only the first 3 actions.
- Inbox WhatsApp conversations expose template access as a compact in-composer action (right-aligned document icon + label) to keep manual actions in one interaction zone.
- Inbox composer controls should degrade gracefully on constrained widths: template/send actions collapse to icon-first buttons, and the reply input stays single-line (scrollbar hidden) so send controls do not overflow or jump.
- Inbox mobile composer keeps `Şablonlar / Gönder` as icon-only actions on phone widths so the text input can keep the remaining row width; visible labels return from `sm` upward.
- Inbox header utility controls should stay visually lightweight: the list filter trigger and selected-thread read/unread toggle render as plain icon actions with subtle hover/active feedback instead of persistent bordered pill chrome.
- Inbox manual text-send errors should use message-send specific copy (not attachment-only errors), and composer error rendering must not vertically shift the send button alignment.
- Inbox template picker behavior:
  - all platforms can open predefined templates and insert selected content into composer (`Write a reply`) without auto-send
  - WhatsApp conversations additionally show official WhatsApp template tab in the same picker
  - template picker UI is compact/mobile-first: underline tab navigation, refresh action only on WhatsApp tab, inset-aligned select chevrons, and smooth modal height transition when switching tabs
  - empty panes must stay in a loading state on first open and show `no templates` warnings only after the initial fetch resolves with zero results
  - 24-hour expired fallback keeps direct official template send flow (separate modal/action)
- Meta OAuth channel connect starts in a separate popup and returns success/error status to the existing Channels page context (main app tab remains stable)
- Meta OAuth popup return should tolerate `window.opener` loss or dropped popup query markers after cross-origin OAuth hops by using same-origin fallback bridges (`window.name` popup-context detection + `storage` event), so popup closes and the main Channels view still refreshes with result state.
- Meta OAuth origin resolution prioritizes canonical app URL and supports forwarded-host fallback for Netlify routing consistency.
- Meta OAuth callback diagnostic hint (`meta_oauth_error`) is propagated from popup to main Channels URL for production support troubleshooting.
- Meta channel credentials can be configured per channel: Instagram prefers `META_INSTAGRAM_APP_ID/SECRET`, WhatsApp prefers `META_WHATSAPP_APP_ID/SECRET`, and both fall back to shared `META_APP_ID/SECRET` for backward compatibility.
- Instagram channel onboarding should use Instagram Business Login OAuth (`https://www.instagram.com/oauth/authorize`) with the Instagram Login messaging scopes required by the official Messaging API docs.
- Instagram OAuth callback/token exchange should use the Instagram Login endpoints (`https://api.instagram.com/oauth/access_token` and `https://graph.instagram.com/access_token`) so the returned long-lived token can call Instagram Login Messaging and webhook subscription APIs.
- Instagram connect-time identity discovery should always resolve the Instagram professional account profile (`user_id`, app-scoped `id`, `username`) and may merge linked Page metadata from `/me/accounts` when available, but connection success must not depend on Facebook Login/Page-token-only discovery for apps configured under Instagram Login.
- Instagram outbound manual replies should use Instagram Login host first (`https://graph.instagram.com/{IG_ID}/messages`) with compatibility fallback to Facebook Graph only when the primary request path fails.
- Instagram onboarding connect state should stay minimal (single heading, short helper copy, one `Continue with Instagram` CTA) to reduce setup friction.
- Instagram onboarding helper copy should explicitly explain redirect-to-Instagram account selection and partner-permission approval in one short paragraph.
- Instagram debug/readback diagnostics should expose the same Instagram Login + webhook-provisioning contract used by channel connect/runtime, including whether webhook subscription was requested and whether callback verification has been recorded.
- Connected channel cards in Settings > Channels should show `Manage` (navigate to `/settings/channels/<channel>`) instead of a destructive `Disconnect` CTA; destructive disconnect remains in channel detail pages.
- Channel card platform icons should stay visually anchored to the top-right corner.
- Channel gallery top-left marketing badges are removed for launch clarity; `Soon` appears only in the action row (same line as `Learn more`) on placeholder cards.
- Channel card backgrounds should use a tone-matched radial glow that starts from the platform icon anchor (top-right) and smoothly fades into the card surface.
- Channel onboarding detail pages should remain wrapper-free: do not add radial gradient, and place the platform icon on the left directly below the back action.
- Meta trust signaling should appear on Meta products (`WhatsApp`, `Instagram`, `Messenger`) via a `Meta Tech Provider` badge both in `/settings/channels` cards and inside corresponding channel setup pages.
- Instagram webhook ingestion should read inbound text messages from both `messaging` and `standby` arrays so DM requests routed under `İstekler`/handover contexts are not silently dropped.
- Instagram webhook setup in Meta should keep both `messages` and `standby` fields subscribed for request-folder coverage, and Inbox should label `standby`-sourced Instagram contact messages as `Request/İstek`.
- Instagram webhook ingestion should support both payload shapes (`entry.messaging` / `entry.standby` and `entry.changes` with `field=messages|standby|messaging_*`), tolerate recipient-id variants seen in request-folder traffic, and normalize non-text inbound messaging events (`attachments`, `postback`, `referral`, `reaction`, `read/seen`, `optin`, `handover`) into Inbox-visible contact rows with `instagram_event_type` metadata; image attachments should additionally persist `instagram_media` metadata so Inbox can preview the image in conversation history and previews. These events must persist in conversation history but skip AI auto-reply automation unless a caption text is present.
- Instagram webhook ingestion should also persist business-account `message.is_echo === true` events as outbound Inbox history: use the recipient as the conversation contact, store the turn as a `user` message instead of `contact`, hydrate the contact username/avatar when possible, and avoid treating those externally sent operator replies as inbound AI-triggering messages.
- When direct-Instagram outbound replies arrive with a recipient id that does not exactly match the stored `contact_phone`, Qualy should fall back to the resolved Instagram username/contact identity and reuse the existing conversation for that customer instead of creating a duplicate empty thread.
- Instagram webhook channel lookup must accept Meta delivery ids across `page_id`, `instagram_business_account_id`, `instagram_user_id`, and `instagram_app_scoped_id`; page-addressed events must not be dropped before shared inbound persistence.
- Inbox rendering for Instagram `read/seen` events should be an icon-only read-status indicator (eye icon) and must not look like a normal inbound customer message bubble; show it only inside conversation view (inline beside outbound message time metadata), and exclude `seen` events from Inbox list last-message preview.
- Instagram reaction events should persist structured reaction metadata (`instagram_reaction_action`, `instagram_reaction_emoji`, `instagram_reaction_target_message_id`) when Meta provides it, while still parsing legacy raw `[Instagram reaction] ...` content for older rows. Inbox should render these as compact reaction rows instead of normal inbound message bubbles, and when the reacted provider message id resolves to a known outbound turn, the UI should explicitly say the customer reacted to `your message`.
- Instagram `read/seen` events must not update conversation unread counters or `last_message_at` recency ordering, and Inbox day-separator labels must be computed from visible (non-seen) turns to avoid empty `Today/Yesterday` chips.
- Instagram request badge state should auto-clear after outbound acceptance/reply: once the app sends an outbound Instagram message, stale `instagram_request` conversation tag must be removed so accepted threads stop showing `Request/İstek`.
- Instagram identity persistence should store both webhook-stable `instagram_user_id` and profile `instagram_app_scoped_id`; connect-time resolution should prioritize `user_id` when both exist, and webhook channel lookup should accept either identifier (with token-based reconciliation fallback) to avoid silently dropping delivered events.
- Inbox should treat Instagram request-folder origin as conversation state (not only latest-message preview): `standby` inbound events persist `instagram_request` tag so request badge visibility remains stable across list/header/details until outbound acceptance/reply clears request state.
- Once an Instagram conversation is explicitly marked with `instagram_request`, Inbox request rendering should continue to trust that conversation-level state until an outbound reply clears it; a later inbound message carrying `instagram_event_source: messaging` must not hide the badge on its own.
- Instagram inbound ingest should attempt sender-profile resolution (`/{contact_id}?fields=id,username,name`) when webhook payload lacks sender name, persist resolved `instagram_contact_username`/`instagram_contact_name` metadata, and update conversation contact name so numeric Instagram IDs are replaced by readable handles where possible.
- Inbox must not infer Instagram request-folder origin from generic `no outbound reply yet` state or unresolved numeric IG identifiers alone. If explicit `standby`/request-origin metadata is absent, the thread should remain a normal DM until a real request signal is observed.
- Optimistic outbound Instagram image rendering should behave like a real sent image bubble while delivery is pending: render the selected local preview immediately, keep the footer metadata (`You · time · Sending...`) intact, and only dispose local blob previews after the temporary optimistic message is replaced or removed.
- Inbox unread-indicator rule: when a conversation is marked as read inside Inbox, the client should broadcast a shared unread-update signal so sidebar and document-title indicators refresh immediately even if realtime propagation is delayed.
- WhatsApp OAuth candidate discovery supports fallback via `me/businesses` + business WABA edges when direct user node field access is unavailable in Graph.
- WhatsApp OAuth scope request is limited to `whatsapp_business_management` + `whatsapp_business_messaging` (do not request `business_management` in the WhatsApp connect flow).
- WhatsApp OAuth candidate resolution accepts WABA payloads without `name` as long as `id` + `phone_numbers` are present.
- WhatsApp OAuth candidate discovery now hydrates missing nested phone data via `/{waba_id}/phone_numbers` before failing with missing assets.
- Channels UI shows Meta OAuth popup result feedback (success/failure reason) on return, instead of silent close behavior.
- OAuth authorize URL requests explicit re-consent (`auth_type=rerequest`) to prevent stale/partial previous grants from being silently reused.
- WhatsApp OAuth can optionally include `business_management` via `META_WHATSAPP_INCLUDE_BUSINESS_MANAGEMENT=1` when Meta app setup requires `me/businesses` fallback access for WABA discovery.
- On direct `me/whatsapp_business_accounts` missing-permission errors, fallback to `me/businesses` is attempted only when `META_WHATSAPP_INCLUDE_BUSINESS_MANAGEMENT=1`; otherwise the direct-endpoint permission error is surfaced.
- If direct `me/whatsapp_business_accounts` discovery fails, callback also attempts `debug_token` granular-scope discovery to resolve WABA assets without requiring `business_management`.
- WhatsApp channel readiness rule: storing a channel row or marking `status='active'` is not enough to claim the channel is ready. The workspace should count WhatsApp as connected only after webhook verification completes (`config.webhook_verified_at` / verified webhook state), and otherwise show a pending or attention-needed state.
- WhatsApp onboarding rule for BSP migration: `another BSP migration` must launch the existing-number Meta Embedded Signup flow rather than the generic OAuth asset-discovery fallback, because migration/coexistence needs the guided Meta onboarding contract.
- Channels remain independent in runtime/data model (`telegram`, `whatsapp`, `instagram` each has separate channel config + webhook route).
- Bot mode (org-level): Active (replies), Shadow (lead extraction only), Off (no AI processing). Simulator is unaffected.
- Main sidebar bot-status control opens a compact dropdown panel that shows the meaning of `Active / Shadow / Off`, supports quick mode switching when writes are allowed, includes a shortcut to Settings, and uses animated open/close transitions.
- Main sidebar bot-status control should render a neutral loading state until organization bot mode is fetched on client mount/refresh, so users never see an incorrect temporary `Active` (green) state before settling to `Shadow` or `Off`.
- Mobile Inbox header shows a compact bot-status pill; tapping it opens a bottom sheet with `Active / Shadow / Off` meanings, quick mode switching (when writes are allowed), and a shortcut to `Settings > AI`.
- Mobile conversation details sheet should keep desktop-equivalent key-info coverage and order (`Active Agent`, assigned operator when active, channel/platform, received timestamp, credit usage, AI pause control) before lead-extraction details.
- Mobile conversation header should surface quick operational context before opening details (leading channel icon + active-agent chip); channel icon should render directly before contact name without extra framed wrapper, and the inbox bot-status quick-switch sheet should open from the top (matching mobile details-panel motion direction).
- In collapsed desktop sidebar mode, bot status and navigation controls show immediate hover tooltips (custom UI tooltip, not delayed browser title-only behavior).
- Conversation-level AI pause (`conversations.ai_processing_paused`) hard-stops inbound AI automation for that specific contact (no lead extraction, no AI reply) while still persisting inbound messages and unread counters.
- Inbox composer banner mirrors bot mode state: Active shows “assistant active”, Shadow/Off show “assistant not active”.
- Shadow inactive banner copy is compact by default (single-line title + one short explanatory sentence).
- Inbox conversation view should only render message content after selected-thread data is loaded; while loading, show skeletons to avoid stale previous-thread visuals.
- Inbox conversation-open critical path should unblock after the latest message page and current lead snapshot arrive; sender-profile hydration and mark-read persistence should continue in the background, and server fetches should reuse the already-known organization context instead of re-querying conversation ownership on every open.
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
- When disclaimer is enabled, outbound bot replies append a disclaimer footer after one empty line: WhatsApp/Telegram use `\n\n> ...`, while Instagram uses `\n\n------\n> ...` to preserve visual separation even without native quote styling.
- If localized disclaimer fields are missing/blank at runtime, outbound formatting falls back to default TR/EN disclaimer text.
- Runtime evaluates matched skills in ranked order (top-5) and applies the first successful match directly; there is no extra handover-intent guard.
- If the applied matched skill has `requires_human_handover=true`, runtime always escalates to operator (`switch_to_operator`) and marks human-attention state.
- Inbox rendering rule: if a bot message ends with the standardized disclaimer footer (`\n\n> ...` on WhatsApp/Telegram or `\n\n------\n> ...` on Instagram), UI strips it from visible bubble content (disclaimer stays in outbound channel payload).
- Inbox skill attribution rule: for bot messages created from skill matches, message metadata carries `skill_title` and UI displays it in the bot footer area; if no skill title exists, attribution is hidden (do not show raw `skill_id`/UUID).
- Conversation identity hydration rule: persist `conversations.contact_avatar_url` when a supported social channel exposes a customer profile image. Instagram and Telegram should best-effort hydrate avatar URLs for Inbox list/header/details/message bubbles; WhatsApp should keep initials fallback unless Meta exposes a supported customer-avatar source in the future.
- Operator message identity rule: persist `messages.created_by` on manual operator sends and resolve outgoing user-bubble name/avatar from that author profile; do not substitute the current viewer identity for historical messages.
- Bot identity rule: Inbox bot replies use a dedicated branded Kualia avatar treatment instead of generic initials/avatar fallback.
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
| `skill_actions` | Optional quick actions (`trigger_skill` or `open_url`); WhatsApp renders only first 3 as reply buttons |
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
- The latest 5 customer messages still ground the extraction prompt, and recent role-labeled turns (`customer`, `owner`, `assistant`) still disambiguate short confirmations (for example, "evet"); however persisted lead `score/status` must be recalibrated from the merged extracted evidence before write-time so later low-signal acknowledgement turns do not erase previously captured qualification signals.
- Owner/assistant turns are contextual only: extracted facts must still come from explicit customer statements or customer confirmations.
- The most recent customer message is always injected into the extraction prompt to avoid replication delays.
- Offering Profile consists of manual text plus AI suggestions generated from Skills/KB in the org UI language; suggestions use a hybrid format (short intro + 3-5 bullets), start pending, require admin approval, may propose updates to existing approved suggestions, and only approved suggestions are used for extraction (manual text is never overwritten). Suggestion generation is context-aware (manual summary + approved + rejected suggestions) and retries formatting with detail expansion when output is too sparse/terse; repaired outputs must still pass the same detail gate before being persisted. Generation always follows the active UI locale (no dual-language generation). Rejected suggestions can be archived for audit (excluded from AI context), and users can regenerate suggestions whenever there are no pending items.
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
- Blocked re-ask detection must accept partial-but-strong field cues from prior ask context (for example `Öğrenci Yaşı` vs `çocuğunuzun yaşı`) during refusal/no-progress turns so semantically same fields are not asked again.
- Shared blocked re-ask matching must be applied consistently in both follow-up analysis and runtime response guards so common contact-field wording drift (for example `Telefon Numarası` vs `ulaşabileceğimiz numara`) is blocked everywhere, not only in one layer.
- External-contact redirect sanitization must stay specific to true “contact us / call us / our number” instructions; it must not rewrite legitimate intake questions that ask the customer for their own phone number.
- When no-progress is detected (two consecutive refusal/uncertainty turns), live guards now enforce loop-break output style (concise status summary + soft next step) to avoid repetitive field-collection loops.
- No-progress/refusal guardrail wording must explicitly include a `do not insist` instruction to avoid pressure phrasing in follow-up generation.
- Generic fallback generation now attempts best-available low-threshold KB context grounding before topic-only redirection, reducing overly generic unknown responses.
- KB/fallback prompting also includes the last 3 assistant replies to reduce repeated greetings/openings in consecutive bot turns.
- Final KB/RAG/fallback generation now receives recent multi-turn user+assistant history and known lead snapshot facts (when available) so replies continue naturally, avoid repetitive greetings, and reduce repeated question loops.
- Lead extraction now stores collected required-intake values as `extracted_fields.required_intake_collected` when customer messages clearly provide them.
- Lead extraction applies merge-on-update persistence for collected required fields; `service_type` is not carry-forward merged when latest extraction has no service clue, and `summary` is always tied to the current extraction window (latest 5 customer messages) to prevent stale status-summary mismatch.
- Required-intake fallback is intentionally conservative: generic extracted fields may auto-fill only explicit canonical labels (`Hizmet`, `Konum`, `Tarih`, `Bütçe`, and narrow language equivalents). Custom/business-specific required field labels must stay empty unless explicitly collected by extraction or filled manually by an operator.
- Required-field population is sector-agnostic: extraction should prefer exact configured field labels in `required_intake_collected`, but runtime may semantically match equivalent extracted or manual-override keys and accept approximate/high-confidence implied customer answers when evidence is strong enough to fill a custom field directly.
- Lead extraction output language is locale-aware (TR/EN): summary and extracted detail values follow customer/locale signal instead of defaulting to English.
- Service inference guard: when recent customer turns are generic greetings/acknowledgements without a clear service clue, extraction must keep `service_type = null` (do not infer solely from profile text).
- Cross-language service acceptance: when recent customer turns contain a concrete service clue that aligns with approved profile/service signals, keep inferred `service_type` even if model output language differs from customer text (for example, customer TR + inferred EN).
- Service canonicalization: when inferred service matches catalog aliases in another language, persist `service_type` as the approved catalog `name` (catalog/UI language source of truth).
- Empty-service recovery: when raw `service_type/services` are empty but current conversation plus extracted summary still clearly match an approved catalog service, recover and persist the canonical catalog `service_type` instead of leaving the UI at `Unknown`.
- Insufficient-information conversations (e.g., greeting-only/unclear short turns with no qualifying signals) are normalized to low-score `cold`.
- Greeting-only turns are normalized to `cold` even if raw model output marks `non_business=true`, preventing false non-business classification on first-contact hellos.
- Extraction locale precedence is deterministic: explicit preferred locale (UI/manual refresh) > organization locale > customer-message language heuristics.
- Required-intake repair now scans recent customer turns, not only the latest message, and accepts category-compatible relative timeline phrasing such as `1 ay içinde` or month names with Turkish suffixes (`Temmuzda`) when repairing missing date-like fields.
- Inbox lead details now show collected required fields in an "Important info" card section based on Organization Settings > Required Fields, rendered as plain label-value rows.
- Leads list required-field columns/cards use the same required-intake resolver as Inbox details so `required_intake_collected` values stay consistent across both surfaces.
- Leads service column/cards show the operator-resolved primary service; manual `service_override` wins, otherwise UI falls back to AI-extracted `services[]` / `service_type`.
- Clicking a lead row/card should deep-link into the matching Inbox thread via `/inbox?conversation=...`, and Inbox route bootstrap must seed that requested conversation when it falls outside the default first-page conversation list.
- Required-info resolution supports manual override precedence (`extracted_fields.required_intake_overrides`) for future editable lead workflows.
- Inbox "Important info" now supports per-field manual overwrite in Details; saved values are locked against future extraction reruns, marked with `AI / Manual` source state, can be reset per field with `Return to AI`, and missing required fields still render as editable rows so operators can fill blanks manually.
- Conversation-level metadata (`aktif asistan`, `operatör`, `platform`, `oluşturuldu`, `AI kontrolleri`) is grouped under `Konuşma detayları`, not under a generic second `Önemli bilgiler` heading.
- Required-field display is no longer a standalone lower section; those rows now live inside `Kişi` as a compact `Gerekli alanlar` sub-block so lead data stays in one place.
- The main Details section titles (`Konuşma detayları`, `Kişi`, `Etiketler`, `Özel not`) now share one common heading style plus consistent section spacing before/after each block.
- Inbox Details section bodies (`Konuşma detayları`, `Kişi`, `Etiketler`, `Özel not`) are collapsible/expandable so operators can hide low-priority blocks without leaving the conversation.
- Manual required-intake corrections persist in `extracted_fields.required_intake_overrides` with lightweight metadata in `required_intake_override_meta` (`updated_at`, `updated_by`, `source=manual`).
- Inbox `Hizmet` row is now operator-editable from the active Settings > Organization service list; selection happens in a compact inline editor, persists as `extracted_fields.service_override`, updates `lead.service_type`, and survives future extraction reruns until the operator explicitly returns to AI.
- Inbox Details now includes lightweight operator CRM context: editable freeform conversation tags plus one shared private note with last-updated metadata.
- Tags and private note live as compact plain sections below lead extraction in Details; tag input stays hidden until the operator explicitly opens add mode, empty tag state stays silent (no `No tags / Etiket yok` copy), an empty private note stays collapsed behind a single `Add note / Not ekle` action until opened, private-note stale protection is keyed to `private_note_updated_at` so unrelated conversation updates do not create false conflicts, and note metadata is shown as two compact lines (`who`, then `when`) without extra prefix labels.
- The leave-conversation control should remain visually fixed at the bottom of the Details experience (desktop footer, mobile sheet/footer region) instead of sitting immediately after note content, so operator exit is always easy to find.
- Inbox composer actions should remain visible as labeled controls (`Şablonlar / Gönder`, `Templates / Send`) with the same height as the text-input shell; action labels must not disappear when there is still available horizontal space.
- System/runtime tags such as Instagram request-origin state (`instagram_request`) remain internal state and should not be surfaced inside the operator tag editor; the tag editor is reserved for user-managed labeling only.
- Non-business conversations are excluded from lead scoring and kept at low-score `cold` (while preserving `non_business=true` as metadata when applicable).
- Manual lead refresh from Inbox is blocked when conversation-level AI pause is enabled for that contact.

---

### 4.5 Human Takeover

**Trigger:** Business owner sends ANY message from their WhatsApp OR claims via Inbox.
**Behavior:**

- **Explicit State:** `active_agent` switches to 'operator'.
- **Assignee Ownership:** Operator is assigned (`assignee_id`) for ownership/visibility and claim tracking.
- **Inbox Queue Visibility:** Inbox list is segmented into `Me`, `Unassigned`, and `All` queues for faster takeover routing.
- **Inbox Header Filters:** Inbox title row exposes a single filter trigger for `All / Unread` plus `All / Hot / Warm / Cold`; the menu must stay mobile-safe, include one inline reset action, filter against live client state so matching conversations can appear immediately after realtime updates, and backfill additional pages before showing the filtered empty state when more conversations remain available.
- **Unread Review Behavior:** Opening an unread conversation must not immediately remove it from the `Unread` filter. Qualy marks the previous conversation as read when the operator manually switches to another conversation, so unread queues stay scannable.
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

### 4.8 Calendar / Scheduling / Booking (Implemented v1 Foundation)

**Scope decision:**

- Calendar/booking was promoted from the post-MVP backlog into active scope as a deliberate foundation for pilot operations.
- v1 stays intentionally constrained: one org-level scheduling resource, no staff dispatch board, no recurring-rules suite, and no claim of full two-way Google sync.

**Product surface:**

- Calendar is a first-class dashboard module with desktop sidebar access, mobile bottom-nav access, and a dedicated `/calendar` route.
- The in-app calendar remains the primary operator surface even when Google Calendar is connected.
- `/calendar` should use a full-width content layout instead of a narrow centered shell, so day/week/month/agenda views can use the same wide workspace language as the rest of the dashboard.
- `/calendar` view/date interactions should stay client-local during normal use; changing day/week/month/agenda or previous/next/today should update instantly and only request a fresh booking window when the operator leaves the currently loaded range.
- The calendar header includes a dedicated `Takvim ayarları / Calendar settings` action that routes operators into `Settings > Calendar`.
- The `/calendar` header should reuse the same action sizing language as `/knowledge`; `Takvim ayarları` uses the standard secondary button footprint, and `Yeni randevu` uses the shared dark primary CTA.
- Manual booking validation errors should render inside the booking modal itself, not only in a page-level banner. Past-date attempts require a dedicated localized message, and expected availability/conflict/booking-disabled failures should be translated away from raw backend English.
- Views include day, week, month, and agenda/list, plus quick `today / this week` summary cards and status/service/source/channel filters.
- Operators can create, update, reschedule, and cancel bookings from the calendar module.
- New/edit booking modal must let operators override duration for a single appointment without rewriting the service catalog default, and must capture customer email alongside existing customer fields.
- `Settings > Calendar` is the durable home for booking rules, business hours, and service durations.
- `Settings > Applications` is the durable home for Google Calendar connection state and sync controls.
- Business-hour editing should stay compact: each day row keeps day identity, open/closed switch, and start/end times within one dense horizontal layout on desktop.

**Scheduling model:**

- Booking settings are organization-scoped and include timezone, default fallback duration, slot interval, minimum notice, and before/after buffers.
- Slot interval, minimum notice, and before/after gap fields should expose inline explanatory help so scheduling jargon does not rely on operator intuition.
- Minimum notice is a real scheduling rule, not a UI hint: it must apply to generated slots, exact requested-slot checks, and direct booking writes.
- Business hours are stored as weekly availability windows; the current UI exposes one active window per day for simplicity, while the schema remains extensible.
- The calendar workspace may summarize scheduling state for speed, but durable editing lives in `Settings > Calendar` and `Settings > Applications`.
- Double-booking protection is enforced both in application logic and at the database layer through an overlap guard.
- If booking is disabled, manual/API/AI availability lookup and new booking creation must all reject consistently; the toggle cannot be cosmetic.
- Replacing weekly availability windows must be atomic so a failed save cannot leave the organization with zero active rules.

**Service model integration:**

- Scheduling reuses the existing `service_catalog`; there is no second appointment-only service list.
- Each service can define its own default duration in minutes.
- If a service duration is missing, availability and booking logic fall back to the organization default duration and keep the source explicit.
- Booking records should link to canonical service catalog rows when available and keep free-text snapshots only as secondary context.

**Google Calendar boundary (v1):**

- Qualy is the internal source of truth for bookings.
- Google Calendar is optional and supports OAuth-based connection, free/busy overlay, and controlled write-through event mirroring.
- If a booking was already mirrored to Google, later booking updates/cancellations should still attempt to update or delete that external event while the same active Google connection exists, even if new write-through creation has since been turned off.
- Disconnecting Google Calendar should delete mirrored future external events before unlinking the provider connection; disconnect must not knowingly orphan active mirrored bookings.
- Full bidirectional sync, ownership arbitration, and generic multi-provider orchestration remain future work; v1 does not pretend otherwise.

**AI scheduling behavior:**

- AI should resolve the requested service before making duration-sensitive availability promises.
- When a requested slot is unavailable, AI should offer real alternative slots from computed availability instead of replying with a dead-end rejection.
- AI should continue booking context across nearby follow-up turns about alternate days/times without forcing the user to restate the service each time.
- When service intent remains ambiguous, AI should clarify the service or fall back safely rather than guessing duration.
- Generic suitability wording on its own (for example `Bu bana uygun mu?`) should not start the booking flow unless the turn also carries stronger scheduling cues such as explicit booking language or a time/date anchor.
- Confirmed booking creation updates internal booking state first and then mirrors outward when Google write-through is enabled.
- Booking change/reschedule requests should not auto-mutate existing bookings in v1; they should route into human handoff instead.
- Scheduling exceptions should fail safe into operator handoff rather than falling through into unrelated generic AI responses.
- If AI cannot find a valid slot, it should promise human follow-up only when that branch also raises real operator attention/handoff state.

---

## 5. Admin Panel

### 5.1 Lead List (Partially Implemented)

- Name, phone, status (Hot/Warm/Cold)
- Score, AI Summary, last message time
- "Open in WhatsApp" button
- Mobile layout uses compact, tappable card rows with reduced spacing; desktop keeps the full sortable table layout.
- Desktop table keeps status chips on one line and keeps contact name on one line with truncation when needed.
- Required-field values in lead rows are resolved from the same normalized source used by Inbox details (`required_intake_collected` + conservative canonical fallback only) for parity.

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
- WhatsApp and Telegram connection now start from dedicated onboarding routes under `Settings > Channels > <channel>` instead of doing setup directly inside the gallery view
- Settings > Channels card order is fixed to `WhatsApp`, `Instagram`, `Facebook Messenger`, `Telegram` so Meta-first channels stay highest in the gallery
- Facebook Messenger card is visible in Settings > Channels as `Çok Yakında` placeholder (integration out of MVP scope)
- Channels settings render as a responsive business-messaging gallery with calmer channel-specific surfaces, concise benefit copy, footer actions inside each card, and a direct grid layout that tops out at 3 desktop columns
- Channel onboarding now uses dedicated detail pages with content-first setup surfaces instead of a left info rail, compact spacing/typography aligned with the rest of settings pages, and wrapper-free icon treatment (`/settings/channels/whatsapp`, `/telegram`, `/instagram`, `/messenger`)
- WhatsApp onboarding taxonomy is explicitly split into three branches: `new API account`, `existing API account`, and `WhatsApp Business app number`, so users do not confuse existing Cloud API assets with keeping a number that is still active in the WhatsApp Business app
- WhatsApp onboarding landing order should prioritize `WhatsApp Business app number` as the first/default recommended option, with simpler SMB-friendly copy that explicitly expands `WhatsApp Business Account (WABA)`
- Connected WhatsApp cards include a `WhatsApp Templates` modal for listing WABA templates and sending a manual test template message (review/debug utility)
- `WhatsApp Templates` includes an additional usage guide modal (`How to use`) with concise operator instructions (WABA requirement, template refresh, recipient format, variable order, send verification); closing this nested guide must leave the parent template modal open
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
- Escalation tab uses two primary sections (`Automatic Escalation` and `Skill Based Handover`) with localized section titles, hot lead threshold slider, escalation action cards, and locale-aware editable handover message
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
- Profile: per-user avatar upload is supported; accepted images are client-converted to square `512x512` WebP before upload, and the final public URL is stored in `profiles.avatar_url`.
- Profile: the settings card uses `profile photo / profil fotoğrafı` wording in user-facing copy, clarifies that the image is used only inside Qualy, and allows click-to-preview for the currently uploaded photo.
- Profile: after a successful profile photo save, the dashboard layout is refreshed so the sidebar user chip picks up the new image immediately.
- Profile security: password recovery via email reset link (Forgot + Reset)
- Forgot/Reset password screens share the same auth form visual language as Sign In/Sign Up (typography, input focus, CTA/link accents) and avoid nested wrapped-card layout.
- Public auth pages now include a top logo header and inline EN/TR language switcher.
- Sign Up form fields for MVP are `full_name`, `email`, and `password`; legal consent is communicated as inline Terms/Privacy links (no required checkbox).
- Sign In and Sign Up password inputs include show/hide toggle controls.
- Sign In must translate common provider auth failures into product copy before rendering. For example, Supabase `Invalid login credentials` should map to the localized `invalidCredentials` UI string instead of appearing raw in English on Turkish auth pages.
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
- Main sidebar user chip reuses `profiles.avatar_url` when present; fallback remains initials from the user’s full name (or email-local-part when needed).
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
  - Lock v1 billing order as: trial -> persistent extra-credit balance in premium (trial carry-over + extra credits) -> recurring monthly premium package.
  - v1 package controls are admin-managed with TRY+USD values per tier (`Starter/Growth/Scale`) and per top-up pack (`250/500/1000`).
  - Current baseline package prices:

    | Plan    | TRY | USD   |
    | ------- | --- | ----- |
    | Starter | 349 | 9.99  |
    | Growth  | 649 | 17.99 |
    | Scale   | 949 | 26.99 |

  - Current baseline extra-credit prices:

    | Pack         | TRY | USD  |
    | ------------ | --- | ---- |
    | 250 credits  | 99  | 2.99 |
    | 500 credits  | 189 | 5.49 |
    | 1000 credits | 349 | 9.99 |

  - Lock v1 package policy: monthly included credits are non-rollover.
  - Finalize feature gates by plan (channels, AI limits, seats, and premium-only controls).

- **Plan Purchase (Online Payment):**
  - Iyzico is selected as the first live provider for Turkey-first recurring and one-time checkout rollout.
  - Recurring monthly premium checkout now initializes via Iyzico `subscription checkout form` and finalizes state/credits on callback token retrieval.
  - Active premium tier upgrades now execute immediately via Iyzico subscription upgrade API and switch the current cycle entitlement to the target plan without stacking old+new monthly credits.
  - One-time top-up checkout now initializes via Iyzico `checkout form` payment page and finalizes order/credits on callback token retrieval.
  - Top-up is not available during trial.
  - Monthly package credits do not roll over between billing periods.
  - Unused trial credits do not disappear on first purchase. They are converted once into persistent extra-credit balance (`topup` behavior) at first premium activation, then remain available until consumed.
  - Mock simulation flow is never implicit. It runs only when `BILLING_PROVIDER=mock` and `BILLING_MOCK_ENABLED=1`; otherwise checkout returns `provider_not_configured` instead of auto-activating.
  - Hosted Iyzico checkout must clear stale `iyzi*` runtime globals and previously injected bundle scripts on mount/unmount so repeated package attempts in the same SPA session reinitialize reliably instead of rendering a blank checkout area. The runtime reset must be descriptor-safe so non-configurable `window` globals cannot crash the page.
  - Billing checkout-start and callback-finish redirects must use locale-aware `as-needed` path building instead of hardcoded `/{locale}` routes, keeping the default Turkish locale canonical without forced `/tr`.
  - Before any paid checkout is started, the app must show merchant-controlled legal links in a separate confirmation step and require explicit acceptance of `pre-information`, `distance-sales-agreement`, and `terms`, plus an immediate digital-service start acknowledgment. This step must happen in-app before the user reaches Iyzico, and the same consent fields must be enforced again in the server action so client-side bypass attempts are rejected.
  - Checkout server actions must derive the selected subscription plan and top-up pack from canonical server-side catalog IDs. Client-posted price/credit values are not trusted for provider initialization, ledger grants, or entitlement changes.
  - Public legal-doc sources remain hosted on `askqualy.com`. Checkout must visibly expose at minimum `pre-information`, `distance-sales-agreement`, `terms`, `cancellation-refund`, and `kvkk`; `subscription-trial` may remain publicly available but should not be redundantly repeated in post-trial purchase checkout.
  - KVKK disclosure is informational, not bundled into a mandatory acceptance checkbox. Optional commercial-message consent stays separate and is not part of the billing gate.
  - Iyzico lifecycle is now split into two layers: initial subscription/top-up checkout finalizes from callback token retrieval, while recurring subscription renewal success/failure/cancellation syncs from a dedicated provider webhook route.
  - Renewal success must reset monthly package credits for the new period without rolling over unused monthly package credits, while preserving persistent extra-credit balance (`topup`, including trial carryover).
  - Renewal success persistence must be atomic across subscription row, billing account, and package-grant ledger so webhook retries cannot leave the account active without the matching ledger entry.
  - Premium expiry uses a one-hour grace window after `current_period_end` while local state is still `premium_active`, reducing false lockouts when `subscription.order.success` arrives slightly late; explicit `past_due` failure state still blocks immediately.
  - Renewal failure policy is intentionally strict in v1: local state moves to `past_due`, token-consuming usage is paused immediately, and failure metadata (`orderReferenceCode` / event reference) is stored for future retry/card-update flows.
  - Self-serve Iyzico cancellation is provider-backed and immediately turns off renewal at Iyzico, but local access stays active until the paid `current_period_end`. Local entitlement becomes effectively `canceled` only after that boundary, and there is no in-app resume because Iyzico does not expose a documented `cancel at period end / resume auto-renew` toggle.
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
  - **Implementation status (v1.24):** Sign Up now enforces signup velocity throttling with `email + IP` buckets and cooldown windows (`check_signup_trial_rate_limit` + `record_signup_trial_attempt`), and supports optional Turnstile CAPTCHA gate when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` are configured.
  - **Implementation status (v1.25):** One-trial-per-business policy is now enforced via `trial_business_fingerprints`: Sign Up pre-checks company/domain identity (`check_trial_business_identity`), org billing initialization claims/validates business fingerprint, and WhatsApp connect enforces additional WABA + normalized phone signals (`enforce_org_trial_business_policy`) to lock duplicate-trial organizations into subscription-required state.

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
- Intake fulfillment analysis also infers sector-agnostic _type-like_ fields (for example `... türü`, `... cinsi`, `segment`) from natural entity cues such as possessive nouns (`kedim için`) or self-identification (`freelance yazılımcıyım`) without hardcoding specific sectors.
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

| Concept        | Implementation                                                                                                                                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organization   | 1 customer = 1 org                                                                                                                                                                                                                        |
| Data Isolation | All tables have `organization_id`                                                                                                                                                                                                         |
| Platform Admin | System admin dashboard, org/user lists, searchable org switcher, read-only cross-org impersonation for tenant surfaces, and billing default/override controls with reason capture implemented; advanced audit tooling UI remains deferred |

---

## 7. Success Metrics

| Metric                        | Target       |
| ----------------------------- | ------------ |
| Daily messages handled by bot | Track growth |
| Lead → Hot conversion         | > 20%        |
| Human takeover rate           | < 30%        |
| FAQ coverage by bot           | > 70%        |
| 7-day lead follow-up rate     | Track        |

---

## 8. MVP Exit Criteria

MVP is successful when:

- [ ] 5 pilot customers actively using
- [ ] ≥50% of daily inbound messages handled by bot
- [ ] Users report "time saved"

---

## 8.5 GTM Readiness Before Pilot Scale

Before expanding beyond the first 5 pilot customers, the product should prioritize:

- **Activation & Conversion:** finalize feature gating by plan, in-product upgrade prompts, annual-pricing posture, and a clear pilot offer path that turns trial usage into paid conversion.
- **Operator Workflow Essentials:** close remaining day-to-day workflow gaps such as manual overwrite for collected `Important info`, `Open in WhatsApp` shortcuts in lead-management surfaces, and lightweight editable conversation tags/private notes for operator context.
- **Abuse Controls & Ops:** add disposable-email / VOIP / repeated device-IP risk controls, a suspicious-signup review flow, and a complete admin audit trail for manual plan/quota overrides.
- **Pilot KPI Visibility:** track the business path from `signup -> channel connected -> first AI reply -> first hot lead -> operator takeover -> paid conversion`, not only infrastructure latency and token/credit usage.

Common competitor capabilities that are visible in the market but intentionally not treated as pre-pilot blockers:

- Campaigns / broadcasts
- Website widget / live chat
- Marketplace-style third-party integrations
- Dedicated mobile app or PWA push-notification layer
- Full CRM / pipeline expansion

**Product decision:** for initial Turkish SMB GTM, prioritize proof of value, operator speed, safety, and conversion over full-suite parity. Campaigns/broadcasts, full CRM expansion, and flow-builder-style automation remain deferred unless pilot evidence proves they are necessary for retention or close-rate.

---

## 9. Future Roadmap (Post-MVP)

| Feature                     | Priority |
| --------------------------- | -------- |
| Flow Builder                | Medium   |
| Auto Follow-up              | Medium   |
| Vertical Preset Marketplace | Low      |

---

## Appendix: Tech Decisions ✅

> Finalized: 2026-01-31 (updated with implementation decisions through 2026-03-31)

- **RAG Architecture:** Store raw knowledge documents and embedded chunks separately (`knowledge_documents` + `knowledge_chunks`) to support large content and future file ingestion.
- **Auth Error Localization Boundary (Implementation v1.59):** Auth server actions may return structured error codes for common provider failures, but auth forms must render those through local translation keys instead of exposing raw upstream English strings on localized surfaces. Invalid sign-in credentials are treated as a first-class mapped case.
- **Inbox Unread State Broadcast (Implementation v1.56):** While the Inbox route is mounted, client-local unread knowledge is fresher than the eventual shared unread query path. New inbound realtime messages must therefore publish an immediate unread-state snapshot to shared shell consumers (`MainSidebar`, `TabTitleSync`) so the browser-tab dot and sidebar unread affordances can update without waiting for delayed database reconciliation.
- **Inbox Selected Thread Catch-Up (Implementation v1.57):** Conversation-row realtime updates already know when the sidebar preview is stale via `shouldHydratePreview`. If that signal fires for the selected conversation, the client must refresh the open thread immediately so the timeline cannot lag behind the sidebar preview after a missed/delayed message-insert event.
- **Inbox Realtime Recovery Strategy (Implementation v1.55):** Treat websocket delivery as primary but not sufficient. Inbox must rebuild Supabase subscriptions and reconcile the first conversation page plus the selected thread on browser resume events (`visibilitychange`, `focus`, `pageshow`, `online`) and when channels enter broken states (`CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`) so long-lived operator tabs self-heal without manual reload.
- **ICU Reaction Label Rendering (Implementation v1.54):** Inbox reaction labels that intentionally keep an `{emoji}` placeholder must read localized templates via `next-intl` `raw/has` access and inject the emoji only when the event row is rendered; calling formatted translation helpers without interpolation values is treated as a runtime regression.
- **Scheduling Source of Truth (Implementation v1.35):** Keep Qualy as the canonical booking system of record; Google Calendar is an optional provider overlay and mirroring target, not the primary source of truth.
- **Calendar Provider Boundary (Implementation v1.35):** Model calendar connections by provider and isolate provider secrets so Google can ship first without locking the product into a Google-only runtime shape.
- **Service-Duration Scheduling Model (Implementation v1.35):** Extend the existing `service_catalog` with per-service duration metadata instead of creating a second appointment-service registry; booking duration falls back to organization defaults when a service-specific duration is missing.
- **AI Booking Safety (Implementation v1.35):** AI must not suggest slots against an uncertain service duration. Resolve the canonical service first or fall back safely before making availability promises.
- **Calendar Settings IA Split (Implementation v1.36):** Keep `/calendar` operational and lightweight, move booking rules/business hours/service durations into `Settings > Calendar`, and keep Google Calendar connection + sync controls in `Settings > Applications` so provider management does not crowd the operator workspace.
- **Calendar Settings Density & Copy (Implementation v1.36):** Keep business-hour editing dense and low-friction, explain timing jargon with inline help affordances, and avoid redundant provider badges on the Google connection card so calendar preferences remain understandable for non-technical operators.
- **Calendar Interaction Performance (Implementation v1.36):** Keep `/calendar` date/view switching inside client state with cached booking windows and URL history sync; full route/server reruns are reserved for initial load and explicit data mutations, not every operator navigation click.
- **AI Scheduling Continuity & Change Boundary (Implementation v1.36):** Continue booking availability conversations from recent booking context without requiring repeated service keywords, but keep booking changes/reschedules on the human-handoff path until explicit safe mutation workflows are designed.
- **Calendar Booking Invariant Hardening (Implementation v1.36):** `booking_enabled` must block backend availability/creation, availability-rule replacement must be atomic, existing Google mirrors should still be cleaned up on update/cancel while the same provider connection is active, and AI no-slot or implied-post-confirmation change turns must emit real human handoff state instead of only conversational copy.
- **Calendar Review Guardrails (Implementation v1.36):** Minimum notice must apply to generated slots, exact-slot checks, and direct booking writes; Google disconnect must clean mirrored future events before unlinking; generic suitability wording is not enough to start scheduling; scheduling exceptions must fail safe into handoff; and `/calendar` mutation flows must invalidate cached windows before reuse.
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
- **Usage Breakdown Attribution (Implementation v1.27):** `Settings > Usage` must map embedding/query/indexing costs into visible business buckets (`AI replies` or `Content processing`) so row totals reconcile with ledger-backed credit consumption.
- **AI Latency Telemetry Separation (Implementation v1.36):** Lead-extraction and successful LLM reply durations are stored in a dedicated `organization_ai_latency_events` table instead of `organization_ai_usage` so admin dashboards can compute clean latency percentiles without coupling performance analytics to billing/token accounting.
- **Runtime Lock Enforcement (Implementation v1.17):** Shared inbound pipeline and Telegram webhook re-check billing entitlement before each token-consuming AI stage (router, RAG, fallback, extraction follow-ups) and stop processing when locked.
- **Document-Processing Lock Policy (Implementation v1.17):** Offering-profile suggestion, service-catalog candidate generation, and required-intake AI extraction are blocked while billing usage is locked.
- **Premium Usage Debit Trigger Safety (Implementation v1.13):** `handle_ai_usage_credit_debit` must cast premium-branch `credit_pool` CASE outputs to `billing_credit_pool_type` enum to avoid `42804` insert failures that would silently stop `organization_ai_usage` writes and conversation credit accumulation.
- **Notify-Only Escalation UX Safety (Implementation v1.13):** Hot-lead `notify_only` must not send customer-facing handover promise text; assistant promise messaging is reserved for operator-switch escalations (including skill-forced handovers).
- **Skill Handover Routing Simplification (Implementation v1.20):** Runtime applies the first successful top-ranked skill match directly (no extra handover-intent guard); if that matched skill has `requires_human_handover=true`, escalation must switch the conversation to operator and persist human-attention queue state.
- **Shadow Mode Runtime Guarantee (Implementation v1.24):** In `shadow` mode, inbound runtimes must never send customer-facing bot replies while still running lead extraction/scoring for each inbound customer turn.
- **Cross-Language Service Inference Safety (Implementation v1.13):** `service_type` acceptance must include profile-signal matching from customer turns so bilingual extraction output (customer TR, inferred EN) does not drop valid service intent to `Unknown`.
- **Catalog Canonical Service Persistence (Implementation v1.14):** If inferred `service_type` matches catalog aliases, persist the catalog `name` as canonical value so lead service reporting follows approved org service labels.
- **Lead Extraction Evidence Recovery (Implementation v1.52):** If raw `service_type/services` are empty but the current customer turns plus extracted summary still align with an approved catalog service, recover the canonical catalog `service_type` from that evidence instead of leaving the lead service empty.
- **Media-Backed Commercial Intent Floor (Implementation v1.58):** When a customer sends an inbound attachment and asks for commercial information about it (`bilgi`, `detay`, `fiyat`, `price`, etc.), Qualy must not leave that turn at `cold` just because the exact service text is implicit. Media-backed first-contact info requests should be promoted to at least `informational_commercial` / `warm`.
- **Required-Intake Fallback Safety (Implementation v1.38):** Inbox/Lead required-field resolver may reuse generic extracted `service/date/location/budget` values only for a narrow canonical-label allowlist; organization-specific required-field labels must rely on explicit `required_intake_collected` extraction or manual operator edits to avoid semantic leakage across domains.
- **Semantic Required-Field Resolution (Implementation v1.42):** Required-field population must remain sector-agnostic. Extraction should prefer exact configured required-field labels in `required_intake_collected`, while runtime resolution may conservatively match semantically equivalent AI-collected or manual-override keys and accept approximate/high-confidence implied customer answers when the field meaning is clear.
- **Conversation-Wide Intake Repair (Implementation v1.52):** Missing required-intake repair should scan recent customer turns for category-compatible evidence instead of binding only the latest customer message, and date-like fields must accept relative timeline answers (for example `1 ay içinde`) plus Turkish month suffix forms (`Temmuzda`).
- **Hot Route Transition Strategy (Implementation v1.43):** Keep global shell prefetch conservative, but treat the main dashboard route families (`/inbox`, `/calendar`, `/leads`, `/simulator`, `/skills`, `/knowledge`, `/settings`, `/admin`) as explicit hot routes. Warm them only on strong user intent (`hover/focus/touch/click`) and bridge slow server responses with a dashboard-level route skeleton overlay instead of reintroducing broad mount-time prefetch floods.
- **Settings Shell Transition Strategy (Implementation v1.48):** Treat `/settings/* -> /settings/*` as a persistent-shell family. Do not paint the dashboard-wide fullscreen pending overlay over settings, keep loading UI scoped to the detail pane, and hydrate billing-lock nav state on the client so the settings layout does not block on billing snapshot reads.
- **Settings Detail Streaming Strategy (Implementation v1.49):** Heavy settings pages should split fast page chrome from slow detail data. `Settings > Billing`, `Settings > Plans`, and `Settings > Organization` now stream through local `Suspense` boundaries so the route frame appears before the slowest payload resolves, and `Settings > Plans` moves `billing_region` persistence into `after()` so GET renders stay side-effect free on the critical path.
- **Settings Bundle Trimming Strategy (Implementation v1.50):** Keep the initial settings JS focused on what the operator can see immediately. Hidden organization-details sections and checkout legal-consent dialogs should load with `next/dynamic` only when their tab/modal opens, instead of bloating the first settings bundle.
- **Workspace Route Bundle Trimming Strategy (Implementation v1.53):** Apply the same bundle discipline to top-level workspace routes. `Inbox`, `Calendar`, `Leads`, `Skills`, and `Knowledge` should lazy-load their heavy route containers with `next/dynamic`, and `Inbox` must not await the first selected-thread payload on the server critical path before the route shell can paint.
- **AI QA Lab Consistency-Normalization Boundary (Implementation v1.52):** Scenario-summary consistency clears must be evaluated against normalized summary text and cross-language intake-category cues (including English `budget`). When transcript or coverage evidence disproves a did-not-ask/follow-up/missing-field claim, stale penalties should be removed; low-information heuristics should still penalize abstract filler while allowing grounded general-information offer copy.
- **Settings Warm Revisit Strategy (Implementation v1.51):** Reuse the last rendered detail-pane content for previously opened settings routes during the pending navigation phase inside the persistent settings shell. The warmed snapshot must be scoped to the same organization and locale, and should stay non-interactive until the fresh route payload replaces it.
- **Chunk Mismatch Recovery (Implementation v1.44):** Treat deploy-time `/_next/static/...` chunk 404s as a recoverable cache/manifest mismatch, not as a permanent operator-facing crash. The root client shell should trigger at most one cache-busting reload for genuine Next chunk failures and avoid retry loops for unrelated runtime exceptions.
- **Refresh + Thread-Open Critical Path (Implementation v1.45):** Default dashboard tenant resolution should load only the active organization unless a surface explicitly needs the full accessible list. Inbox thread-open must fetch latest messages and lead snapshot in parallel, reuse the known organization context when available, and keep sender-profile hydration plus mark-read persistence off the initial render path.
- **Client Cache Idempotence (Implementation v1.46):** Inbox selected-thread cache hydration and shared dropdown open-state callbacks must be idempotent. Once the selected thread or dropdown is already in the requested state, the client should avoid publishing another local state write so render-loop regressions cannot propagate into nested editors or media surfaces.
- **Shared Common-Locale Modal Contract (Implementation v1.46):** Any shared client primitive that calls `useTranslations('common')` for chrome labels must keep those keys present in both `messages/en.json` and `messages/tr.json`; missing shared keys are treated as runtime-breaking regressions, not cosmetic copy drift.
- **Inbox Header Utility Icon Treatment (Implementation v1.47):** Keep Inbox header utility actions visually lightweight. The list filter trigger and selected-thread read/unread toggle should render as plain icon controls with subtle hover/active cues, not persistent bordered pill buttons, so the header stays compact and scan-friendly.
- **UI State Synchronization Guardrail (Implementation v1.47):** Do not mirror prop-derived, open-state, or route-derived values into synchronous `useEffect` resets. Prefer derived state, keyed subtrees, stable callbacks, and async open-time resets so dashboard surfaces avoid cascading renders and lint-gate failures.
- **Dashboard Interaction Semantics (Implementation v1.47):** Navigable cards/rows must use real links or buttons, and secondary actions must remain sibling controls. Do not nest interactive controls inside Inbox attachment chips, Knowledge rows/cards, or Skill cards.
- **Prefetch Stability Guardrail (Implementation v1.47):** Manual route warmup inputs must be memoized from stable primitives so badge/count rerenders do not retrigger prefetch waves across dashboard shells.
- **Channel Webhook Lookup Indexing (Implementation v1.47):** Active-channel verification and runtime lookups over `channels.config` JSONB keys must ship with matching partial expression indexes (for example verify token, webhook secret, page/account ids) so webhook traffic does not degrade into table scans as channel volume grows.
- **MVP Reply Language Safety (Implementation v1.14):** RAG/fallback reply prompts must enforce `Turkish` for Turkish customer messages, otherwise `English`, to keep outbound response language aligned with customer input.
- **Live Assistant Intake-State Runtime (Implementation v1.16):** Required-intake follow-up decisions are sector-agnostic and stateful at runtime: short conversations use dynamic minimum intake scope, high-impact missing fields are prioritized, already collected or explicitly deferred fields are blocked from re-ask, and the same state is applied in response guards (fallback + RAG) to suppress intake pressure in non-qualification/refusal/no-progress turns.
- **Blocked Re-Ask Matching Safety (Implementation v1.21):** For refusal/no-progress protection, field re-ask blocking must accept partial-but-strong field mention matches (not only full multi-token label matches) so semantically same fields with wording drift are still blocked from repeat asks.
- **Shared Intake Field-Match Safety (Implementation v1.33):** Follow-up analysis and runtime response guards must call the same field-mention matcher so blocked re-ask behavior cannot diverge by layer, and the matcher must cover common phone/contact wording drift such as `Telefon Numarası` vs `ulaşabileceğimiz numara`.
- **External Contact Redirect Specificity (Implementation v1.33):** Chat-first redirect sanitization must only target genuine “contact us / our number / call us” phrases; generic `numara`/phone collection prompts remain valid intake questions and must pass through unchanged unless separately blocked by refusal/no-progress rules.
- **Unicode Intent Normalization Safety (Implementation v1.22):** QA Lab request-mode detection must normalize Turkish dotted-uppercase and combining-mark variants (e.g., `İ`) before cue matching so policy/procedure intent is not lost by token split artifacts.
- **Service-Context Semantic Coverage Safety (Implementation v1.23):** QA Lab intake-coverage logic must allow broad semantic fulfillment fallback for explicit service-context fields (e.g., `Talep bağlamı`) after assistant ask, while still rejecting deflection/no-detail replies.
- **Usage Month Window:** Usage monthly grouping uses calendar month in `Europe/Istanbul` to match business-facing monthly reporting expectations.
- **Font Strategy (Initial):** Use system fonts in the app shell to avoid build-time Google Fonts fetches in CI.
- **Font Update:** Adopt Plus Jakarta Sans as a self-hosted local font (`public/fonts/plus-jakarta-sans`) and remove Google Fonts CSS `@import` to avoid runtime external font fetching.
- **Sidebar UI Refinement:** Collapsed-state icon pills are centered and the expand/collapse toggle sits alongside the app name, using arrow-from-line icons for clarity.
- **Sidebar UI Refinement:** Collapsed logo alignment is centered to match the navigation icon stack.
- **Sidebar Branding:** Use `/public/logo-black.svg` for expanded sidebar header state and `/public/icon-white.svg` for collapsed sidebar header state so the slim rail keeps strong contrast on the dark surface.
- **Sidebar Branding Scale:** In collapsed mode, render `/public/icon-white.svg` at active-tab footprint size (`44px`) to keep header branding visually balanced with nav pills.
- **Collapsed Sidebar Contrast:** The slim desktop sidebar rail uses a dark navy surface with white/near-white iconography and a brighter active pill treatment, while the expanded sidebar keeps the lighter shell styling.
- **Global Brand Name:** User-facing app brand copy and tab metadata use `Qualy` (legacy naming removed from runtime UI text).
- **Tab Icon Source:** Browser tab icon metadata points to `/icon-black.svg`, and app-level icon file is `src/app/icon.svg` for consistent favicon output.
- **Tab Title Strategy:** Browser tab title follows active route using `<Page> | Qualy`; Inbox title adds `(●)` when unread conversations exist, without numeric unread count in the title.
- **Tab Title Metadata Ownership (Implementation v1.46.2):** Localized route/auth metadata is the canonical source of browser-tab titles in Next App Router. Client-side tab-title code may only decorate the active base title for dynamic Inbox unread state and must not be the sole owner of route labels.
- **Sidebar Navigation:** Group primary navigation under eyebrow labels (Workspace, AI Tools, Other) for faster scanning.
- **GTM Focus Decision (2026-03-15):** Before broad pilot expansion, prioritize activation/conversion, operator workflow, abuse prevention, and pilot KPI reporting over parity with omni-channel suite competitors.
- **Competitor Parity Decision (2026-03-15):** Common market features currently missing from Qualy include campaigns/broadcasts, website widget/live chat, integrations, dedicated mobile/PWA alerts, and richer CRM tooling; only lightweight CRM notes/tags and reporting are near-term pilot priorities, while the rest remain post-pilot unless customer evidence changes the order.
- **Sidebar Bot-Mode Loading Safety (Implementation v1.29):** Main sidebar bot-status indicator must render neutral loading state until organization bot mode is fetched to avoid transient incorrect `Active`/green display on hard refresh.
- **Social Avatar Persistence (Implementation v1.30):** Customer avatars are stored on the conversation record (`contact_avatar_url`) so Inbox surfaces stay channel-agnostic; hydrate only from supported channel APIs (Instagram/Telegram) and keep initials fallback for WhatsApp.
- **Social Avatar Fallback (Implementation v1.31):** When conversation-level avatar persistence is missing or not yet deployed on an environment, Inbox may recover social avatars from recent inbound message metadata so existing/live threads still show profile photos.
- **Profile Avatar Storage Strategy (Implementation v1.35):** `profiles.avatar_url` remains the per-user avatar source of truth. Accepted uploads are client-converted to square WebP, stored in a dedicated public storage bucket, and then persisted as the final public URL; WebP is chosen for storage/network efficiency, not database row-size reduction.
- **Profile Avatar Failure Cleanup (Implementation v1.35):** If the avatar file upload succeeds but persisting `profiles.avatar_url` fails, the server must remove the freshly uploaded storage object before re-throwing so retry/error paths do not accumulate orphan avatar files.
- **Operator Message Author Attribution (Implementation v1.35):** Manual operator-send persistence must store `messages.created_by = auth.uid()`, and Inbox outgoing user bubbles must resolve display name/avatar from that author profile so historical multi-operator threads stay correct.
- **Inbound Reply Path Reliability (Implementation v1.36):** Webhook-driven inbound flows must persist the customer turn first, select/send the best reply on the synchronous path, and defer lead extraction plus lead-score-based hot-lead escalation as post-response work so extraction latency/failures cannot block live bot replies; skill-required human handover remains synchronous.
- **Operator Outbound Delivery Durability (Implementation v1.37):** Manual operator sends must persist a pending `messages` row via `queue_operator_message` before provider dispatch, then finalize that same row to `sent` / `failed` with generic `outbound_delivery_status`, `outbound_channel`, and provider/error metadata so UI state and persistence cannot drift across WhatsApp, Instagram, Telegram, template, and media paths.
- **Inbox Media Preview Directionality (Implementation v1.41):** Media preview labels must derive from `messages.sender_type`: inbound `contact` media keeps localized `received/alındı` wording, while outbound `user/bot` media uses localized `sent/gönderildi` wording in sidebar previews and non-image media cards.
- **Instagram Shared Media Preview Persistence (Implementation v1.46):** Treat Instagram `share` / `story reply` webhook URLs as transient ingress-only data. If Qualy wants inline preview later, it must persist the preview URL at webhook time because message-detail fetches are not a reliable recovery path for those assets after the event is stored.
- **Instagram Seen Event Recency Safety (Implementation v1.39):** Instagram `seen/read` events are timeline metadata only. They should remain available for inline read indicators but must not alter conversation unread/recency ordering (`unread_count`, `last_message_at`), and date-separator labels must be computed from visible non-seen turns to avoid orphaned day chips.
- **Inbox Refresh Latency Guardrail (Implementation v1.40):** Conversation-list refresh must not block on sequential social-profile hydration. Instagram contact hydration runs in bounded parallel mode with a strict timeout budget, conversation-switch flow avoids duplicate lead refresh requests, and query paths are supported by dedicated indexes for conversation ordering, message pagination, and request-origin existence checks.
- **Kualia Bot Identity (Implementation v1.35):** Inbox bot replies use a dedicated branded dark avatar treatment so bot output remains visually distinct from operator-authored messages.
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
- **Sign Up Email Confirmation Checkpoint (Implementation v1.26):** When signup succeeds without an active auth session (email verification required), route users to `/register/check-email` and display submitted email + spam/junk guidance + quick change-email return path (`/register?email=...`) + sign-in shortcut; keep direct app redirect only when signup returns an active session.
- **Sign Up Check-Email Transition Reliability (Implementation 2026-03-31):** The register server action must return a client-consumable `redirectPath` for the no-session email-confirmation branch instead of relying on a thrown server redirect, so the `useActionState`-driven register form can always transition to `/register/check-email` after successful signup.
- **Auth Mobile Input Sizing:** Use `text-base` (`16px`) on small-screen auth inputs to avoid iOS Safari auto-zoom while preserving compact `sm:text-sm` on larger screens.
- **Auth Mobile Viewport Stability:** Use `dvh`-based auth shell height and fixed light background tokens to avoid visible black bands at top/bottom on mobile browsers.
- **Auth Prefetch Scope (Implementation v1.28):** Signed-out auth surfaces must prefetch only adjacent auth routes (`login`, `register`, `forgot-password`, `register/check-email`) and must not warm protected dashboard pages before a session exists, because those routes trigger avoidable auth/org/data reads and degrade perceived login/register and signout performance.
- **Auth Translation Payload Scope (Implementation v1.28):** Auth layouts must ship only auth-relevant translation namespaces (`auth`, `common`, `nav`, `mainSidebar`) instead of the full app catalog, so login/register/forgot/reset routes do not inherit unrelated dashboard/admin copy payload.
- **App Shell Prefetch Policy (Implementation v1.28):** Dashboard, mobile-nav, settings-shell, and legacy rail surfaces must not bulk-manually prefetch protected routes on mount; they should rely on visible `Link` prefetch so navigation does not trigger duplicate route warmups and avoidable auth/org/data reads across the app shell.
- **Post-Auth Direct Landing (Implementation v1.39):** When login/signup returns an active session, redirect straight to the localized default workspace route (`/inbox` or `/admin`) instead of bouncing through `/{locale}` and re-resolving landing context on the critical path.
- **App Shell Hydration Budget (Implementation v1.39):** Dashboard navigation must prioritize first paint over secondary chrome data. Keep unread state on the immediate path, defer sidebar billing/pending-suggestion/bot-mode hydration slightly after mount, skip mobile-only billing reads when the mobile nav is mounted but hidden on desktop, and use selective prefetch so primary workspace/settings routes stay warm while secondary shell shortcuts remain opt-out.
- **Settings Shell Badge Hydration (Implementation v1.39):** Settings route transitions must not wait for advisory `pending suggestions` counts on the server path. Resolve org/billing access first, then hydrate badge counts client-side with stale-request protection so organization switches cannot overwrite newer counts and badge refreshes do not retrigger route warmups.
- **Unread Indicator Fanout (Implementation v1.39):** Shell unread indicators should use lightweight existence checks and one shared desktop unread-state stream instead of parallel exact-count + realtime subscriptions in multiple shell components. Hidden navigation shells must not start unread IO for viewports where they are not rendered.
- **Paginated Inbox Filter Backfill (Implementation v1.40):** Active Inbox filters must not declare an empty result set from only the currently loaded client page. When filtered results are empty but more conversations can still load, the Inbox client should backfill additional pages first so filtered list state stays aligned with org-wide unread indicators.
- **Dashboard Message Scope (Implementation v1.39):** The dashboard root provider should expose only shell-critical namespaces. Route-group layouts must add their own heavier message namespaces so the dashboard shell does not ship the entire locale catalog on every route transition or refresh.
- **Inbox Preview Realtime Fallback (Implementation v1.39):** Inbox sidebar preview text must not depend solely on message-insert realtime delivery. When a conversation row update moves `last_message_at` ahead of the cached preview, the client should fetch a lightweight preview batch and refresh that row; direct thread fetches should reuse their latest message history to keep the list preview in sync without a hard reload.
- **Optimistic Dashboard Active State (Implementation v1.40):** Desktop sidebar, mobile bottom-nav, and Settings inner navigation should derive their highlighted destination from shared pending-route state, not only the committed `pathname`, so the clicked destination becomes active immediately while the App Router is still resolving the new payload.
- **Lightweight Post-Auth Route Resolution (Implementation v1.40):** Login/signup success should choose `/admin` vs `/inbox` from `profiles.is_system_admin` plus active-org-cookie presence only. Do not validate the selected organization or resolve the full active-organization context before starting the client transition.
- **Root Dashboard Loading Boundary (Implementation v1.40):** The `(dashboard)` route group must provide a root `loading.tsx` shell boundary so auth-to-app entry and uncached dashboard transitions can show immediate shared skeleton feedback before page/layout data finishes.
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
- **Self-Serve Renewal Control (Implementation v1.6+):** `Settings > Plans` exposes user-facing subscription controls for active premium subscriptions. In mock mode this remains `cancel at period end` with optional resume; in live Iyzico mode, self-serve cancellation is provider-backed, renewal stops immediately at the provider, access remains active until `current_period_end`, and the UI must not imply an in-app resume or undo CTA after cancel.
- **Downgrade Scheduling UX (Implementation v1.7):** `Settings > Plans` keeps upgrade CTA prominent on plan cards, while lower-tier changes are scheduled from plan management for period end. In live Iyzico mode, that schedule must also persist on the active subscription record as a pending plan change so users keep seeing the target package and effective date on later visits.
- **Modal-First Premium Plan Management (Implementation v1.8):** After subscription starts, premium users manage tier changes from a dedicated plan-management modal (3 tiers shown together with current/upgrade/switch actions). Cancellation is handled in a separate confirmation modal.
- **Iyzico Plan-Change Popup Guard (Implementation v1.9):** Active premium plan-change confirmation popups must reflect the real execution path. Hosted subscription/top-up flows can promise the next Iyzico payment screen, but direct premium upgrade/downgrade actions must instead show current vs target monthly pricing, effect timing, and a provider-calculated-charge notice without claiming an exact amount unless the integration can preview it reliably.
- **Top-Up Modal Readability:** In one-time top-up option rows, the right-column price should use emphasized typography and vertical centering for faster visual comparison between packs.
- **Monetization Rollout Order:** Finalize pricing strategy and trial model first, then implement checkout/payments and entitlement enforcement (avoid shipping payment flows before policy decisions are locked).
- **Trial Go-To-Market Model (Pre-Pilot):** Start with trial-only onboarding (no freemium) to reduce ongoing abuse vectors and keep support/sales qualification focused.
- **Starter Pricing Posture (Pre-Pilot):** Keep first paid plan in low-entry territory (~USD 10 equivalent, TRY-localized) and shift expansion to credit top-ups/upper tiers after conversion baseline is validated.
- **Pricing & Credit Calibration Guide (Pre-Pilot):** `docs/plans/2026-02-16-pricing-credit-strategy-guide.md` is the policy reference for trial-credit calibration (`100/120/200/250/1000` comparison), model-cost math, Lovable-like `upgrade-first` monetization structure (tier ladder + premium burst top-up), and customer-facing conversation-equivalent packaging ranges.
- **Pricing Catalog Rollout (Implementation v1.5):** `/settings/plans` now shows final package/top-up ladder with safe monthly conversation ranges; system-admin manages both TRY/USD price points from `/admin/billing`.
- **Automatic Currency Region Rule (Implementation v1.12):** Organization billing region is persisted at signup from request-region signals (`x-vercel-ip-country`/`cf-ipcountry`; fallback `Accept-Language`) into `organizations.billing_region`. `Settings > Plans` renders package currency from this persisted organization value (`TR` -> `TRY`, non-TR -> `USD`) for consistent tenant-wide pricing.
- **TR Package Naming Rule (Implementation v1.10):** Turkish package labels are standardized as `Temel` (Starter), `Gelişmiş` (Growth), and `Profesyonel` (Scale) across tenant and admin billing surfaces.
- **Trial Defaults (Locked v1):** Provision new organizations with `14 days` and `200.0 credits` by default.
- **Trial Signup Velocity Guard (Implementation v1.24):** Registration applies signup throttling before auth signup using `email + IP` buckets with a `10-minute` active window (`6` max attempts or `4` failed attempts) and a `15-minute` cooldown when exceeded; attempts are persisted through RPC guard functions for both success and failure outcomes.
- **Trial Signup CAPTCHA Gate (Implementation v1.24):** Sign Up supports optional Turnstile CAPTCHA verification when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are configured; missing/invalid challenge blocks registration.
- **One-Trial-Per-Business Fingerprint Policy (Implementation v1.25):** Trial eligibility is keyed by business fingerprint signals (`company_name`, `email_domain`, WhatsApp `business_account_id`, normalized phone). Existing fingerprint matches block additional free trials across new accounts/organizations.
- **Trial Fingerprint Enforcement Surface (Implementation v1.25):** Fingerprint checks run at signup pre-check, org billing initialization, and WhatsApp connect, ensuring both early and post-channel-connection duplicate-trial detection.
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
- **Plans Status Banner Dismissal (Implementation v1.28):** `Settings > Plans` checkout/renewal feedback banners are transient URL-state messages and must be user-dismissible without disturbing the rest of the page state.
- **Route-State Snapshot Refresh (Implementation v1.27):** Sidebar/mobile billing quick cards must also re-fetch billing snapshot on client-side route transitions so async background usage (for example Knowledge Base processing) appears without a full browser refresh.
- **Async KB Processing Refresh Event (Implementation v1.27):** When `/api/knowledge/process` completes successfully, the client must emit explicit browser refresh events so billing summary cards and KB suggestion indicators reflect post-processing credits even if realtime delivery lags.
- **Top-Up Copy Normalization (Implementation v1.4):** User-facing terminology is `Ek kredi` (TR) and `Extra credits` (EN); avoid exposing `top-up` wording in tenant/admin UI copy.
- **Usage Card Compact Mode (Implementation v1.5):** Sidebar quick card should default to compact summary (`remaining credits + membership + decreasing progress`) and reveal package vs extra-credit breakdown only on chevron expand.
- **Locale-Aware Billing Usage Card Formatting (Implementation v1.31):** Desktop sidebar and mobile usage cards must format package renewal dates and credit amounts with the active app locale (`tr`/`en`) rather than browser defaults, so Turkish UI never falls back to English month names or separators.
- **Premium Credit Consumption Priority (Implementation v1.32):** After premium activation, persistent extra-credit balance (including carried-over trial credits) must be consumed before monthly package credits so converted trial leftovers are used first.
- **Plans Total Credit Visibility (Implementation v1.32):** `Settings > Plans` must surface the same total remaining credits visible in the sidebar, alongside the separate monthly-package and extra-credit balances.
- **Plans Zero-Topup Visibility (Implementation v1.33):** `Settings > Plans` should show the combined-total and extra-credit balance cards only while premium extra credits remain. Once `topupBalance` reaches `0`, the status surface should collapse back to the monthly package card only.
- **Plans Extra-Credit Pool Total (Implementation v1.34):** The extra-credit balance card in `Settings > Plans` must keep the original trial limit visible when premium extra credits come from trial carryover. Post-premium topup usage still reconstructs later extra-credit changes (`current topup balance + already consumed topup usage`, including `mixed` debit rows via `metadata.topup_debit`), but the card must not collapse a carried-over trial balance like `153.5` to `153.5 / 153.5`; it should remain anchored to the original trial limit such as `200`.
- **Supabase Migration Version Discipline (Implementation v1.35):** Migration numeric prefixes must stay globally unique across `supabase/migrations`. If a later rollout reasserts the same database function or trigger, remove the earlier conflicting draft instead of shipping duplicate version numbers that would fail against remote `schema_migrations`.
- **Billing Snapshot Source (Implementation v1):** Tenant/admin visibility reads from `organization_billing_accounts` plus immutable `organization_credit_ledger` history; frontend derives progress/eligibility from a shared billing snapshot mapper to keep sidebar/mobile/settings/admin surfaces consistent.
- **Runtime Entitlement Gate (Implementation v1):** Before token-consuming AI paths (shared inbound pipeline, Telegram webhook AI flow, simulator response generation, inbox summary/reasoning/manual lead-refresh), runtime resolves billing entitlement and exits early when usage is locked.
- **Workspace Hard-Lock Access Rule (Implementation v1.7):** If entitlement is locked (`trial_exhausted`, `past_due`, `canceled`, `admin_locked`, or exhausted premium credits), tenant workspace routes are restricted to `Settings > Plans` and `Settings > Billing`; inbox conversation read/send actions are blocked server-side to prevent message visibility/reply bypass.
- **Workspace Hard-Lock Navigation UX (Implementation v1.8):** In locked mode, desktop/mobile main navigation and the Settings inner sidebar remain fully visible, but non-billing destinations are disabled with locked affordances. `Settings` stays the active entry and resolves to `Settings > Plans`.
- **Workspace Hard-Lock Bot Status UX (Implementation v1.10):** In locked mode, main sidebar bot status is displayed as `Off/Kapalı` regardless of stored bot mode, so users do not see a misleading `Shadow/Dinleyici` state while replies are blocked by lock policy.
- **Sidebar Bot Quick Switch UX (Implementation v1.21):** Main sidebar bot status uses a filled dropdown trigger; the opened mini panel must list `Active / Shadow / Off` with short meaning text, allow instant mode switching when tenant writes are allowed, keep a Settings shortcut for detailed configuration, and animate both open and close transitions.
- **Collapsed Sidebar Tooltip UX (Implementation v1.21):** In collapsed desktop sidebar mode, bot status, nav items, org switch, and collapse toggle must expose immediate hover tooltips for fast identification without requiring expansion.
- **Desktop Sidebar Section IA (Implementation v1.47):** In expanded desktop mode, sidebar groups (`Çalışma Alanı`, `Yapay Zeka Araçları`, `Diğer`, and `Yönetim` when present) should behave like lightweight Linear-style categories: each group has a compact header row with collapse/expand control, section state persists per browser, category blocks have more vertical separation, active nav items use a soft neutral pill, and desktop nav typography is slightly smaller while the collapsed rail still shows the full icon set.
- **Desktop Dashboard Typography Scale (Implementation v1.47):** Desktop operator surfaces should share a slightly denser text scale than the public/auth shell so Inbox, Details, Calendar, Leads, Knowledge, Settings, and Admin pages feel calmer without rewriting each component. This shared content downscale must be shell-level and desktop-only, while the desktop sidebar gets a small compensating upscale so navigation remains readable next to the tighter content area.
- **Billing Ledger Table Layout Stability (Implementation v1.9):** `Settings > Usage` credit ledger uses fixed column sizing so collapsed and expanded row modes keep identical column widths.
- **TR Payment Provider Strategy (Locked v1):** Prioritize a TR-valid recurring provider (Iyzico first, PayTR alternative); use Stripe only with a supported non-TR entity/account model.
- **Iyzico Checkout Finalization Strategy (Implementation v1):** Initial subscription and top-up purchases finalize from checkout callback token retrieval (`retrieve` APIs) and apply idempotent ledger/account updates server-side before user redirect; recurring subscription lifecycle then continues through provider webhook sync for renewal success/failure/cancellation.
- **Iyzico Lifecycle Sync Strategy (Implementation v1.29):** Recurring subscription lifecycle is now reconciled through `/api/billing/iyzico/webhook` with signature validation (`X-IYZ-SIGNATURE-V3` using merchant secret key), event idempotency based on provider order references, and local state transitions for `subscription.order.success`, `subscription.order.failure`, and `subscription.canceled`.
  - **Iyzico Renewal Consistency Guard (Implementation v1.31):** `subscription.order.success` must delegate persistence to a single DB RPC so retries cannot produce partial state (for example, period advanced without ledger grant), and premium expiry must allow a short grace window after `current_period_end` before local entitlement flips to `canceled`.
  - **Iyzico Period-End Cancellation Strategy (Implementation v1.30):** Because Iyzico exposes provider-side cancel but not a documented `cancel at period end / resume auto-renew` toggle, self-serve cancel calls the provider immediately, stores `auto_renew=false` + `cancel_at_period_end=true` metadata locally, keeps workspace access active until the stored `current_period_end`, and then treats entitlement as effectively `canceled` in both TS snapshot logic and SQL entitlement guards.
  - **Iyzico Provider Error Surface (Implementation v1.32):** Checkout callback finalization must catch provider retrieve failures and normalize Iyzico card/issuer decline codes (for example insufficient funds, expired card, invalid CVC, internet-shopping disabled, unsupported card) into explicit checkout error reasons instead of throwing a generic `request_failed` or `500`.
  - **Iyzico Sandbox Verification Baseline (Implementation v1.32):** Go-live confidence requires sandbox coverage for at least: successful initial subscription, successful top-up, successful provider-backed cancellation with access retained until `current_period_end`, and a representative decline-card matrix that validates mapped user-facing failure states.
  - **Iyzico Premium Upgrade Strategy (Implementation v1):** Existing `premium_active` subscriptions upgrade immediately through Iyzico subscription upgrade API; current-cycle entitlement becomes the target-plan entitlement (`non-stacking`), package usage is preserved, and only the delta grant is added to ledger history.
- **Iyzico Plan Reference Mapping (Implementation v1):** Internal plan ids stay fixed as `starter / growth / scale`, while merchant-specific Iyzico pricing-plan reference codes are supplied only through env vars. Sandbox or production plan swaps should never require code changes.
- **Mock Billing Safety Guard (Implementation v1):** Deployments must never fall through to mock auto-activation when live billing env vars are missing. Default provider selection is `iyzico`, and explicit `mock` mode requires `BILLING_MOCK_ENABLED=1`.
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
- **Inbox Bot Name Display Rule:** If the stored `bot_name` is still the default assigned value, Inbox operator-facing labels should continue to show the generic localized assistant label; only a user-customized bot name should replace it in header/details and similar operator UI.
- **Bot Disclaimer (Implementation v1.20):** Store org-level `bot_disclaimer_enabled` + localized `bot_disclaimer_message_tr/en` in AI settings; when enabled, append a disclaimer footer to outbound bot replies, using `\n\n> ...` for WhatsApp/Telegram and `\n\n------\n> ...` for Instagram.
- **AI Settings Grouping & Naming (Implementation v1.21):** Place `Sensitivity` under `Behavior and Logic` and standardize Settings navigation/page label as `Qualy AI`.
- **AI Settings Escalation Grouping (Implementation v1.22):** Place `Lead extraction during operator` under `Escalation` to keep operator takeover behavior with escalation controls.
- **Inbox Message Contrast:** Bot-authored inbox messages use a dark-violet bubble with light text to keep bot replies easy to scan against operator and contact messages.
- **Inbox Message-Day Separator:** Render day chips from each message timestamp (`Today`/`Yesterday`/localized full date) instead of showing a static label.
- **Simulator UI Direction:** Keep the simulator channel-agnostic with a neutral chatbot look (no WhatsApp wallpaper/green header/read ticks) while preserving the same matching/debug behavior.
- **Skill Testing Strategy (MVP):** Use Simulator as the canonical skill testing workflow; do not build a separate per-skill playground in MVP.
- **Token Usage Accounting:** All token-consuming features must record usage in `organization_ai_usage` for monthly UTC and total tallies.
- **Billing Message Metrics:** Message usage in Usage & Billing is computed from `messages.sender_type` with UTC monthly boundaries (`bot`, `user`, `contact`) and excludes `system` rows.
- **Billing Storage Metrics:** Storage usage in `Settings > Usage` combines UTF-8 text footprint (Skills + Knowledge Documents) with WhatsApp media object sizes from storage bucket paths prefixed by organization id; aggregation is media-bucket aware (`target_media_bucket_ids`) and server fallback reconciles media size from storage object listings when RPC media totals are empty.
- **Billing Storage UI Copy:** Storage section no longer shows the technical approximation footnote line; cards remain the single source of truth.
- **Billing Credit Preview Formula:** AI credit preview uses weighted token totals (`input + 4 × output`) divided by `3000` and rounded up to one decimal place.
- **Billing Message Layout:** Present AI/operator/customer message counts on separate rows inside each message usage card to improve scanability.
- **Fallback Prompt Source:** Use the UI-configured fallback prompt directly (no hardcoded system append).
- **Inbox Assistant-State Banner:** Composer banner copy reflects org `bot_mode` (`active` vs `shadow`/`off`) so runtime reply availability is explicit.
- **Skill Matching Fail-Open:** If semantic skill matching fails at runtime, continue via KB/fallback path instead of terminating the webhook flow.
- **Inbox Composer:** Show an AI-assistant-active banner with a takeover prompt while keeping manual reply enabled.
- **Inbox Details:** Use consistent contact initials between list avatars and details panel.
- **Inbox Credit Usage Visibility:** Show cumulative AI credit usage per conversation in details using DB-persisted conversation totals (`conversations.ai_usage_*`) maintained by `organization_ai_usage` insert trigger + migration backfill.
- **Inbox Avatars:** Use the shared Avatar component across list, chat, and details to keep initials/colors consistent.
- **Social Contact Avatars (Implementation v1.30):** Persist a nullable `conversations.contact_avatar_url` and render it through shared customer-identity surfaces. Inbox uses it for list/header/details/message bubbles, and Leads uses it as a compact avatar immediately before the existing platform icon. Instagram and Telegram hydrate best-effort customer photos from channel APIs; WhatsApp currently remains initials-only because webhook/customer APIs do not expose a supported avatar source.
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
- **Inbox List Header Filters:** Keep the filter entry as a single icon action aligned to the far right of the title row instead of adding another fixed filter row; the opened menu should fit narrow screens without viewport overflow, include a text-style reset action in the header, and use semantic customer-score chip colors with a stronger selected state.
- **Inbox Manual Unread Toggle:** The selected-thread header should expose a read/unread toggle. Manually marking a thread unread must bypass the normal switch-away auto-read behavior until the operator marks it read manually or later re-enters that same thread from another conversation.
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
- **Desktop Leads Row Readability:** Keep the compact avatar + platform icon + contact name cluster on one line in the desktop table; truncate long names instead of wrapping.
- **Leads Last-Activity Copy:** In `/leads`, render relative last-activity text on a single line and replace localized approximation prefixes such as `about` / `yaklaşık` with `~` to reduce scan noise.
- **Leads Row Density:** Keep `/leads` mobile cards and desktop table rows slightly denser by trimming vertical padding and line-height without changing the existing information hierarchy.
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
- **Channel Launch Gating:** Keep only the Facebook Messenger card as a `Coming Soon` placeholder in Settings > Channels; WhatsApp, Instagram, and Telegram flows remain active.
- **Channels Discovery IA:** Render Settings > Channels as a responsive business-messaging gallery with richer channel descriptions, marketing/status badge chips, subdued card tones, and a direct grid layout that uses the full settings page width while capping the gallery at 3 columns on wide desktop without re-centering the page inside a narrow shell.
- **Channels Discovery Order:** Keep visible card order fixed to `WhatsApp`, `Instagram`, `Facebook Messenger`, `Telegram`.
- **Channels Discovery IA:** Do not render an extra section heading above the channel grid when it does not add navigation value; keep the card gallery immediately visible.
- **Channels Card Density:** Keep channel card titles compact (no larger visual hierarchy than page-level section labels), place platform icons tightly in the top-right visual anchor, and avoid excessive empty space before divider/actions.
- **Channels Onboarding IA:** Move setup itself out of the gallery and into dedicated detail routes (`/settings/channels/<channel>`), using content-first full-page onboarding instead of a side-resource rail so each channel can show its own setup decisions without burying the CTA.
- **Onboarding Detail Density:** In channel onboarding detail screens, inner section headings should not exceed page-header visual hierarchy; keep explanatory paragraph text one step smaller than headings for consistent scanning.
- **Onboarding Detail Alignment:** Channel onboarding inner content should be left-aligned within the settings surface (no centered shell block), while preserving readable max content width.
- **WhatsApp Taxonomy Clarity:** Separate `existing Cloud API assets` from `current WhatsApp Business app number` in onboarding UI. These are different Meta flows and must not be presented as the same branch.
- **Channels Verification Scope (MVP):** Use live channel connection status + debug diagnostics in Settings > Channels; allow a lightweight WhatsApp-only template review utility for App Review evidence (manual list + manual test send).
- **Messenger Brand Icon:** Use `public/messenger.svg` for Facebook Messenger placeholder visuals in Channels settings.
- **Meta Channel Onboarding (MVP):** Use Meta OAuth start/callback routes with signed state validation; do not require manual token entry in channel settings UI.
- **WhatsApp Onboarding Entry (MVP):** Do not send every user directly into server-side Meta OAuth asset discovery. Start with a dedicated WhatsApp onboarding page that routes most businesses into Meta Embedded Signup, and reserve legacy OAuth only for users who already have ready Cloud API assets inside Meta.
- **Meta OAuth Redirect Robustness:** Carry a signed/safe `returnTo` channels path in OAuth flow so error/success callbacks return users to their active channel settings route.
- **Meta Channel Credential Isolation:** Allow separate Meta app credentials per channel (`META_INSTAGRAM_APP_ID/SECRET`, `META_WHATSAPP_APP_ID/SECRET`) while preserving fallback to shared `META_APP_ID/SECRET` so mixed app setups remain backward-compatible.
- **Instagram OAuth Consent Flow:** Use direct Instagram consent launch (`flow=ig_biz_login_oauth`) for Instagram channel connect instead of Facebook dialog URL, while keeping callback/state signing and popup return behavior unchanged.
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
- **WhatsApp MVP Channel Strategy:** Implemented via Meta Cloud API with OAuth-based channel setup (auto-resolved `phone_number_id` + `business_account_id`), inbound text + media (`image`/`document`) handling, webhook signature verification, and reactive replies only (no proactive/template-first messaging in MVP).
- **WhatsApp Existing-Number Onboarding (MVP):** Optimize for businesses that already use WhatsApp Business App on their current number. Do not assume prior `business.facebook.com` usage; onboarding must support users who need to create or connect a Meta business portfolio during setup, and existing-number cases must use Embedded Signup / coexistence-style onboarding rather than generic new-number registration.
- **WhatsApp Embedded Signup Primary Path (MVP):** Guided connect should use Meta Embedded Signup as the default self-serve path for `new number` onboarding, because ordinary SMBs usually do not have pre-created WABA assets available for asset discovery.
- **WhatsApp Existing-Number Config Separation (MVP):** Do not silently reuse the generic new-number Meta Embedded Signup config for `existing number` onboarding. Current-number onboarding requires a dedicated Meta Embedded Signup / coexistence-ready configuration; if that config is missing, the UI must block the path with deterministic guidance instead of dropping users into the generic new-number setup flow.
- **WhatsApp Embedded Signup Post-Auth Provisioning (Implementation v1.33 / v1.48):** After Embedded Signup returns `auth code + waba_id + phone_number_id`, the server must exchange the code and then branch by signup mode. `new` Embedded Signup should call `/{phone_number_id}/register` for Cloud API use before `/{waba_id}/subscribed_apps`; `existing` / coexistence Embedded Signup must skip the new-number registration step and continue with the shared subscription/setup flow instead. When app URL + verify token are available, the WABA subscription should override the callback URL to the app’s `/api/webhooks/whatsapp` endpoint.
- **WhatsApp Embedded Signup PIN Management (Implementation v1.33 / v1.48):** Embedded Signup completion derives and persists a deterministic 6-digit two-step verification PIN only for `new` Cloud API number registration. Existing-number / coexistence onboarding must not generate or persist a new-number PIN during completion.
- **WhatsApp Existing-Number Launch Contract (Implementation v1.49):** Existing-number / coexistence Embedded Signup launch must pass Meta's `extras.featureType = "whatsapp_business_app_onboarding"` from every client launcher. Providing only the dedicated existing-number `config_id` is insufficient because Meta can otherwise render the generic new-number Business Platform flow instead of the Business app onboarding screen.
- **WhatsApp Embedded Signup Timeout Recovery (Implementation v1.49.1):** Treat the returned auth code as sufficient to continue completion even when the client misses Meta's final `WA_EMBEDDED_SIGNUP / FINISH` event. After a short post-auth grace window for the browser event, the UI must fall through to server completion instead of waiting for the full embedded-signup listener timeout. If `waba_id` or `phone_number_id` is unavailable on the client, the server must discover the granted WhatsApp business account and phone number from the exchanged token (including existing debug-token/discovery fallbacks) and still upsert the local channel so Settings and Inbox do not remain disconnected after a long-running Business app onboarding flow.
- **WhatsApp Webhook Readiness Contract (Implementation v1.34):** WhatsApp channel records may exist before the webhook is fully verified. Persist webhook provisioning metadata (`pending` / `verified` / `error`, callback URI, requested-at timestamp, verified-at timestamp) in channel config, and let the UI/reporting surfaces treat WhatsApp as fully connected only after webhook verification succeeds.
- **WhatsApp BSP Migration Entry (Implementation v1.34):** The onboarding CTA for `another BSP migration` must route into the existing-number Embedded Signup flow. Generic Meta OAuth asset discovery remains only a fallback for already-provisioned Cloud API assets inside Meta, not for migration/coexistence onboarding.
- **WhatsApp Guided Wizard IA (Implementation v1.27):** The dedicated WhatsApp onboarding page should open with three clear choices (`new API account`, `existing API account`, `WhatsApp Business app number migration`), run a phone-number eligibility check before launching Meta for new-account setup, require an explicit `Meta Business Manager access` confirmation screen before the final `Connect with Facebook` launch step, split `existing API account` into `Meta assets already in Meta` vs `another BSP migration` before launch, and make the `new API account` card explicitly mention that numbers currently tied to WhatsApp Personal also start from that path.
- **WhatsApp Support CTA:** The onboarding support banner should provide a direct human-contact CTA (`Ekiple konuşun` / `Talk to the team`) that opens the team WhatsApp chat (`https://wa.me/905074699692`) instead of a mail draft or static helper text only.
- **WhatsApp Disconnect Contract (Implementation v1.50):** `Disconnect` should remove only Qualy's local WhatsApp channel record. It must not require provider-side phone deregistration or ask the operator to disconnect their WhatsApp Business app / WABA setup first, and the confirm copy should say that local-only scope explicitly.
- **WhatsApp Disconnect Error Surface (Implementation v1.50):** Disconnect failures are now purely local channel-removal failures. Server actions should return a localized Qualy-side error if deletion fails, without mentioning provider-side coexistence or Cloud API deregistration steps.
- **WhatsApp Wizard Step Contrast:** Step pills must keep step numbers legible in all states, including active (no white-on-white number rendering).
- **WhatsApp Migration Guide Link (Temporary):** The migration help anchor text remains visible for IA continuity, but the link target is disabled/placeholder until the final documentation URL is approved.
- **WhatsApp Legacy Asset Connect Fallback (MVP):** Keep the current server OAuth candidate-discovery flow only as an explicit fallback for users who already completed Meta Cloud API setup and only need the app to discover an existing `phone_number_id` + `business_account_id`.
- **WhatsApp Coexistence Prep (MVP):** Existing-number onboarding should screen for current Meta prerequisites before attempting connect, such as active WhatsApp Business app usage on that number, current app version on the primary device, QR-capable assisted setup availability, and any required page/business asset linkage.
- **WhatsApp Inbound Media Persistence (Implementation v1.25):** Download inbound `image`/`document` assets from Graph API during webhook processing, persist to dedicated storage bucket (`whatsapp-media`), store media metadata on `messages.metadata.whatsapp_media`, and skip automatic AI reply for media-only inbound events without caption.
- **Inbox Inline Image Asset Fallback (Implementation v1.46.2):** When persisted inbound media clearly resolves to an image asset (for example `image/*` MIME type or image-like stored URL/filename), Inbox should render it as an inline image bubble even if the provider-level media type was stored as `document` or `unknown`; keep the explicit file-card fallback only for non-image assets.
- **WhatsApp Outbound Media from Inbox (Implementation v1.26):** Inbox composer supports outbound `image` + `document` attachments with pre-send preview/remove UX, attachment cap (`max 10`), signed upload targets to `whatsapp-media`, ordered media send via WhatsApp Cloud API, and queue-first delivery metadata (`outbound_delivery_status`, `outbound_channel`, `whatsapp_outbound_attachment_id`) so placeholder bubbles and failure states survive provider/persistence drift.
- **Instagram Inbox Images (Implementation v1.32):** Inbox should normalize inbound Instagram image attachments into `messages.metadata.instagram_media` so shared media rendering, previews, and image-group logic can display them. Outbound Inbox attachment flow reuses signed Supabase uploads, validates Instagram as image-only, persists queue-first delivery metadata (`outbound_delivery_status`, `outbound_channel`, `instagram_outbound_attachment_id`), and sends composer text as a separate follow-up message after the image batch.
- **Instagram Shared Preview URLs (Implementation v1.46):** Instagram webhook handling should persist previewable shared-media URLs from `attachments[].payload.url` and story-reply URLs from `reply_to.story.url` into `messages.metadata.instagram_media` even when the event is not a native `image` attachment. Inbox should attempt inline preview when the URL looks like a directly renderable asset and otherwise keep the explicit `Open Instagram` fallback for non-previewable share/reel/post content.
- **Instagram Unsupported Attachment Debug Snapshot (Implementation v1.46.1):** When an inbound Instagram attachment/story placeholder still has no previewable asset URL, persist a limited webhook snapshot (`mid`, `is_unsupported`, `attachments`, `reply_to`) into `messages.metadata.instagram_message_debug` so support can diagnose what Meta delivered without storing the entire webhook body.
- **Instagram Deleted-Message Suppression (Implementation v1.46.8):** Instagram `message_deleted` handling should stay low-signal by design. If the first or only customer DM is later deleted, Inbox should not keep a visible conversation/thread at all. If the conversation already has meaningful history, the matching turn may be rewritten into deleted state without bumping unread/recency like a new inbound message. Inbox list fallback should also hide older deleted-only Instagram rows when their sole preview message is that deleted event, and those stale rows must not affect queue counts or Inbox/browser unread indicators. When an established Instagram conversation still resolves only to a numeric scoped id, operator-facing surfaces should continue to use a localized generic contact label with the raw IG id kept only as secondary context.
- **Clipboard Paste UX (Inbox):** Pasting images into the reply textarea attaches clipboard images directly to the pending attachment strip and enforces the same global max-attachment cap by taking only the first available slots.
- **Composer Attachment Layout:** Pending outbound attachments render in a dedicated strip outside the text input area (not inside input field) to keep template/send actions visually clean.
- **Lead Extraction Input Scope:** Lead extraction context must ignore WhatsApp media-placeholder messages and use text turns only (`contact/user/bot` text content) for scoring and summary decisions.
- **Lead Extraction Media-Text Preservation (Implementation v1.46.3):** Lead extraction must still use meaningful text/caption content sent with inbound media-backed turns. Ignore the asset itself and pure placeholder rows (`[WhatsApp image]`, `[Instagram image]`, attachment labels), but preserve real `content` text or media `caption` metadata for scoring, summary, and required-field extraction.
- **Lead Score Merge Calibration (Implementation v1.46.5):** Persisted lead `score/status` must be recalibrated from merged extraction evidence instead of trusting the latest raw LLM score in isolation. Required-intake fields, intent signals, and recovered service clues from prior turns remain valid evidence, so acknowledgement-only follow-ups cannot collapse an already-qualified lead back to `cold/0`; explicit opt-out/cancel summaries still force `cold`.
- **Semantic Commercial Intent Classification (Implementation v1.46.6):** Lead extraction must classify buying intent through a sector-agnostic semantic `intent_stage` contract (`none`, `informational_commercial`, `qualification`, `booking_ready`) instead of using static language-specific pricing keywords as the primary behavior. Scoring may map these normalized stages deterministically, but classification itself stays LLM-first so first-message commercial inquiries generalize across sectors and languages.
- **WhatsApp Template Scope (MVP):** Keep template messaging out of automated runtime scope. If the 24-hour free-form window is closed, inbox free-form outbound remains blocked until new inbound message; template send is limited to explicit manual operator actions (Channels utility and Inbox expired-window modal).
- **Instagram MVP Channel Strategy:** Implemented via Meta Instagram Messaging API with Instagram Business Login channel setup (auto-resolved `instagram_business_account_id`, `instagram_user_id`, app-scoped profile id, username, and optional linked `page_id` merge when Meta exposes it), inbound text + image handling, webhook signature verification, and reactive replies only (first turn must come from customer inbound message).
- **Instagram Webhook Readiness Contract (Implementation v1.35):** Instagram channel records may exist before the callback is fully verified. Persist webhook provisioning metadata (`pending` / `verified` / `error`, subscription requested-at timestamp, subscribed field list, verified-at timestamp, error detail) in channel config, treat UI/debug connection state as pending until verification succeeds, and record verification directly from `/api/webhooks/instagram` GET validation or the first valid inbound POST so operators can distinguish `connected` from `Inbox ready`.
- **Instagram Webhook Subscription Provisioning (Implementation v1.36):** After Instagram Login resolves the connected professional account, the server must call `POST https://graph.instagram.com/{instagram_account_id}/subscribed_apps?subscribed_fields=...` with the documented messaging fields before the channel is marked active. Skipping this step creates a false-positive connection that stays `pending` forever and never receives live DMs.
- **Instagram Delivery Identity Contract (Implementation v1.36):** Webhook ingest/reconciliation must accept Meta delivery ids across `page_id`, `instagram_business_account_id`, `instagram_user_id`, and `instagram_app_scoped_id`. Connect-time profile resolution remains the primary identity source for Instagram Login, while optional linked Page metadata is merged only when available so page-addressed events still resolve without forcing the whole channel onto the Facebook Login/Page-token model.
- **Type Safety (Build):** Align KB router history role types and guard strict array indexing to keep TypeScript builds green.
- **Skills UI Simplification:** Use a single skills list (no Core/Custom split), keep search above the list, and keep the add CTA visible in the header.
- **Skills Embedding Source:** Generate skill embeddings from both skill title and trigger examples; regenerate on title/trigger changes.
- **Skill Quick Actions (WhatsApp MVP):** Allow skill-level quick actions (`trigger_skill` or `open_url`) without editor hard-cap; render first 3 as WhatsApp reply buttons, execute deterministically on inbound `button_reply`, and keep URL behavior as bot-sent link text (no template URL CTA flow in MVP).
- **Skill Action Failure Handling:** If WhatsApp interactive button send fails, automatically fall back to plain text send; if inbound skill-action target is invalid/disabled, return a deterministic unavailable notice instead of falling through to semantic matching.
- **Skill Action Transport Guard (Implementation v1.24):** Route-level interactive `button_reply` handling must pass deterministic `inboundActionSelection` metadata into shared inbound pipeline, and WhatsApp reply-button transport must defensively sanitize payload buttons (trim/drop invalid entries, cap count/title) before API request.
- **Skills Icon Consistency:** Reuse the sidebar Skills icon in the Skills empty-state panel for visual consistency.
- **Skills Read-Path Budget (Implementation v1.46.4):** Normal Skills navigation must stay a pure read. The list should query existing rows first, seed localized default guardrail skills only when the workspace is empty, and skip embedding-maintenance scans on the request path.
- **Knowledge Collection Count Path (Implementation v1.46.4):** Knowledge folder counts should use an aggregate database path instead of scanning raw `knowledge_documents` rows during page load.
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
- **Inbox Bot Message Presentation (Implementation v1.24):** Hide trailing disclaimer footer text in Inbox bubble rendering for both the standard quote and Instagram separator variants (while keeping outbound payload intact); show `skill_title` attribution in footer only for skill-matched bot replies.
- **Handover Locale Repair:** When legacy/default values create EN text in both localized fields, normalize to TR default for `hot_lead_handover_message_tr` and EN default for `hot_lead_handover_message_en`.
- **Prompt Locale Repair:** When stored prompt is a known default family (EN/TR), including legacy long EN default variants and legacy strict fallback text, normalize to the active UI locale default prompt in settings.
- **Lead Extraction Parsing:** Strip code fences and extract the first JSON object before parsing to prevent empty lead updates.
- **Lead Scoring Transparency:** Weight decisive booking intent higher (+3), classify buying intent through semantic `intent_stage` outputs instead of static keyword-first routing, and expose on-demand score reasoning grounded in extracted inputs.
- **Lead Score UX:** Reasoning copy respects the active UI locale and uses localized status labels.
- **Required-Info Display Parity:** Lead list required-field rows/cards must reuse the Inbox required-intake resolver so `required_intake_collected` and fallback values stay consistent across both views.
- **Service Catalog (Hybrid):** Auto-propose services from Skills/KB and add them directly to the active service list when Service List AI mode is enabled.
- **Service Candidate Generation (AI):** When Service List AI mode is enabled, extract one or more candidate services from Skill/Knowledge content and auto-apply them without manual review queue.
- **Multi-Service Extraction:** Lead extraction can capture one or many services in `services[]`; all accepted values are canonicalized to the approved service catalog names when aliases/language variants match.
- **Service List UI (MVP):** Organization Settings includes an editable service-chip list (manual add/remove), per-org AI service-generation toggle, and AI-origin tags (no approve/reject actions).
- **Offering Profile (Catalog Optional):** Maintain an editable service scope summary used when a catalog is absent or incomplete; AI suggestions are generated from Skills/KB in org language using a hybrid format (intro + up to 5 bullets), start pending, can propose updates to existing approved suggestions, and only approved suggestions are used for extraction.
- **Offering Profile Updates:** Conflicting content produces update suggestions that revise the targeted approved suggestion on approval.
- **Offering Profile Context:** Suggestion generation includes the manual summary plus approved/rejected suggestion history for better alignment.
- **Offering Profile Formatting:** Suggestions must include a short intro plus 3-5 labeled bullets; if output is too sparse/terse, retry generation with richer detail expansion, and persist only outputs that still pass detail validation after repair.
- **Non-Business Handling:** Skip lead scoring for personal/non-business conversations (status remains `cold`).
- **Insufficient-Info Handling:** Business-context conversations without enough qualification signal remain `cold` (low-score normalization).
- **Offering Profile Location:** Manage the Offering Profile under Organization Settings (not AI Settings) to align with org-level scope.
- **Organization AI Control:** Use independent section-level AI toggles for Offering Profile and Required Fields UX modes.
- **AI Suggestions Header:** Keep a single pending indicator label in the accordion header and avoid duplicate right-side count chips.
- **Manual Profile Note:** Keep a persistent custom textarea in Approved suggestions for manual scope notes; store it separately in `offering_profiles` and do not convert it into suggestion cards.
- **Required Fields Sync:** On Skill/KB updates, ask AI for only missing required fields by sending existing fields in prompt context; normalize/dedupe before persisting so manual and AI chips do not duplicate.
- **Required Fields Parsing:** Accept fenced/noisy JSON responses when extracting required fields so KB/Skill-triggered chip generation remains resilient.
- **Required Fields Follow-Up:** For KB/fallback response generation, include required fields, recent customer messages, and the last 3 assistant replies in prompt context so LLM can naturally ask one concise follow-up question when needed and avoid repetitive openings.
- **Live Required-Intake Semantic Repair (Implementation v1.46.4):** Live follow-up and response-guard logic must use a shared sector-agnostic analyzer so contextual same-turn answers can immediately block re-asks, while lead extraction runs a conservative exact-label repair step and a constrained missing-field repair prompt to persist remaining high-confidence required-intake values from conversation context.
- **Webhook RAG Output Cap:** Shared inbound webhook RAG generation path (`src/lib/channels/inbound-ai-pipeline.ts`) must set explicit `max_tokens` to keep output size/cost bounded across Meta channels.
- **Structured Output Mode:** For JSON-producing LLM tasks (lead extraction, required-intake follow-up, offering profile suggestion/repair, required-field proposal), enforce `response_format: json_object` to reduce parse drift and retry churn.
- **Prompt Budget Guardrails:** Truncate oversized knowledge document content before sending profile/intake suggestion context to LLM tasks.
- **LLM Output Caps:** Apply explicit `max_tokens` limits on router, fallback, RAG, summary, lead reasoning, and extraction calls to keep cost and latency bounded.
- **Conversation Continuity:** Use recent multi-turn conversation history in final KB/RAG/fallback generation and apply repeated-greeting suppression when assistant already greeted recently.
- **Inbox Summary Affordance:** Use a filled sparkles AI icon with purple→orange glow plus an inline chevron beside the summary label so open/close state remains explicit in the same control.
- **Settings Layout:** Keep consistent settings column widths and remove duplicate right-column labels so inputs align with section titles.
- **Terminology (TR):** Replace "Lead" with "Kişi" in Turkish UI copy for clarity.
- **Launch Copy Positioning (Implementation v1.34):** For launch and marketing assets, position Qualy around one inbox, conversation clarity, person extraction, operator control, and visible credit usage; avoid English `lead`/`qualification` terminology and avoid team-based primary framing in Turkish copy.
- **Quality Gate Discipline:** Keep lint free of errors (warnings tracked separately), avoid explicit `any` in core product modules, and require green `test` + `build` before closing iterations.
- **Phase 9 QA Strategy (Implemented):** Phase 9 now runs Vitest-based core/unit + WhatsApp webhook integration coverage, Playwright admin smoke E2E, a dedicated settings navigation persistence/warmed-revisit E2E, a reproducible message-handling throughput baseline (`autocannon`), and a concurrent-user webhook stress scenario via `npm run test:unit:core`, `npm run test:integration:whatsapp`, `npm run test:e2e:admin`, `npm run test:e2e:settings`, `npm run test:load:messages`, and `npm run test:load:users`.
- **AI QA Lab Strategy (Implemented v1.4):** Manual admin-triggered, simulator-only, two-model (`Generator` + `Judge`) QA loop with non-hardcoded scenario generation, 150+ line noisy KB fixtures, full-text evidence logging, findings-first reports, and critical-fail release gate. Current implementation includes queue-first run launch with automatic background worker execution, lifecycle persistence (`queued/running/completed/failed/budget_stopped`), full artifact-chain visibility in run details, Judge-to-pipeline action-set reporting, generator retry diagnostics, increased Quick preset token budget (`100k`), and QA-local responder execution that is tenant-independent (`synthetic context`, `no skill layer`, `generated KB + fallback only`).
- **AI QA Generator Retry Decision (Implemented v1.3):** Generator stage retries failed attempts up to `3` times with explicit retry feedback and stores per-attempt diagnostics (`finish_reason`, usage, output snippets, validation error) in `report.error.details` for failed runs.
- **Next.js Interceptor Convention:** Use `src/proxy.ts` (not `src/middleware.ts`) for locale interception on Next.js 16+.
- **Next.js Dev Stability:** Avoid exporting route page components with Turbopack-sensitive names such as `Home` or `CalendarPage` under Next.js 16.1.6; use neutral component names to prevent the dev-only `performance.measure(...): '<route>' cannot have a negative time stamp` overlay crash.
- **Instagram Contact Avatar Field:** Use Instagram user `profile_pic` for contact-profile lookups and normalize it into the app’s shared `profile_picture_url` shape for downstream consumers.
- **Placeholder Source Transparency:** Keep non-MVP Knowledge source options visible in New Content menu but mark inactive options (including PDF upload) with a `Coming Soon` badge.
- **Inbox Query Resilience:** When nested relational conversation reads fail, fall back to flat per-table conversation/message/lead/assignee reads so Inbox does not incorrectly show an empty state.
- **Landing Legal Delivery:** Keep legal documents as versioned markdown source (`legal/*.md`), render `/legal`, `/terms`, `/privacy` from those files, and generate `public/legal_versions.json` during build for external consumption.
- **Static Hosting Fallback:** For Netlify-hosted SPA landing routes, include `public/_redirects` catch-all (`/* /index.html 200`) so direct visits to `/legal`, `/terms`, and `/privacy` do not return 404.
- **Footer Navigation Strategy (Landing):** Keep footer focused on Product and Legal columns only; Product items should deep-link to homepage sections with smooth-scroll behavior (`/#features`, `/#pricing`, `/#how-it-works`).
- **Testimonials Anchor Strategy (Landing):** Footer product scoring item should point to Success Stories via `/#testimonials` and use testimonials-oriented copy in TR/EN.
- **Meta Data Deletion Compliance (Landing):** For Facebook/Meta App Review, publish a public `Data Deletion Instructions URL` page with explicit deletion steps, scope, SLA, and support channel; initial deletion scope is contact-level records, while full organization deletion remains out of MVP self-service scope.
- **In-App Self-Service Deletion Scope (MVP):** `Settings > Organization` allows admins/owners to delete organization contact-level records after account-password confirmation in a modal; deletion removes conversations, cascaded messages/leads, and conversation-linked AI usage metadata rows.

| Decision      | Choice                                  | Rationale                                                                                                                               |
| ------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend      | **Next.js (App Router)**                | Best DX for React, pairs well with Supabase                                                                                             |
| Backend       | **Supabase Edge Functions**             | Serverless, TypeScript, integrated with DB                                                                                              |
| Database      | **Supabase (PostgreSQL + pgvector)**    | Multi-tenant RLS, vector search built-in                                                                                                |
| Auth          | **Supabase Auth (Email/Password)**      | Simple for MVP, can add OAuth later                                                                                                     |
| WhatsApp      | **Meta Cloud API**                      | Free tier (1000 conv/mo), direct integration                                                                                            |
| AI/LLM        | **OpenAI GPT-4o-mini**                  | Cost-effective, good Turkish support                                                                                                    |
| Embeddings    | **OpenAI + Supabase pgvector**          | All-in-one, no extra services                                                                                                           |
| Realtime      | **Supabase Realtime**                   | Live inbox updates (Postgres changes)                                                                                                   |
| Hosting       | **Netlify**                             | Matches current deployment platform and runtime environment                                                                             |
| Load Testing  | **Two-layer webhook checks**            | Keep `autocannon` for raw throughput baseline and a concurrent-user scenario runner for realistic multi-turn latency/error measurement. |
| i18n          | **TR + EN from day one**                | Avoid retrofit pain                                                                                                                     |
| Onboarding    | **Embedded Signup first (MVP)**         | Guided self-serve WhatsApp setup for real business numbers, with concierge fallback for blocked pilot cases                             |
| Inbox Updates | **Atomic send RPC + realtime fallback** | Prevents unassigned state and keeps bot/user messages visible                                                                           |
| Dev Workflow  | **Always provide commit message**       | Ensures consistent handoff across iterations                                                                                            |
| Dev Workflow  | Add subagent-driven-development skill   | Standardizes subagent-based execution of implementation plans                                                                           |
