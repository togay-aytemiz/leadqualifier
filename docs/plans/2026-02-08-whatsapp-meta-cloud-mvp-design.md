# WhatsApp Meta Cloud API Integration (MVP) — Design

Date: 2026-02-08

## Summary
Implement first-party WhatsApp integration using Meta Cloud API, reusing the existing Telegram channel architecture as the baseline. The MVP should support one WhatsApp number per organization, receive inbound text messages via webhook, run the existing AI reply pipeline (Skill -> KB/RAG -> fallback), and send text replies back on the same conversation. Channel setup is manual from Settings > Channels to maximize speed and reduce OAuth/signup complexity in the first release.

## Validated Product Decisions
- Provider: Meta Cloud API (no Twilio/360dialog for MVP).
- Channel setup: Manual credentials entry in Channels UI.
- Message type scope: Text only for inbound/outbound automation in MVP.
- Outbound scope: Reactive only (reply to inbound messages). No proactive/template-initiated messaging in MVP.
- Fallback for unsupported inbound content: Store event metadata and optionally return a short unsupported-content notice (no media processing in MVP).

## Goals
- Reuse current multi-tenant channel/inbox architecture with minimal branching.
- Keep WhatsApp runtime behavior aligned with Telegram for AI routing and operator takeover rules.
- Keep setup and operations simple for SMB admins.
- Deliver safely with webhook verification, signature validation, idempotency, and observability.

## Non-goals
- Embedded Signup (Meta OAuth flow).
- Template management and conversation initiation UX.
- Media understanding (image/audio/document/location).
- Multi-number routing per organization.

## Architecture
- `src/lib/whatsapp/client.ts`: Meta Graph API wrapper (`sendText`, `healthCheck`, optional `getPhoneNumber`).
- `src/lib/channels/actions.ts`: `connectWhatsAppChannel` + optional debug action.
- `src/components/channels/ConnectWhatsAppModal.tsx`: Manual connection modal.
- `src/app/api/webhooks/whatsapp/route.ts`: `GET` verification + `POST` inbound processing.
- `src/lib/inbox/actions.ts`: Outbound branch for `conversation.platform === 'whatsapp'`.

The webhook should reuse existing core logic where possible:
- Conversation lookup/create (`platform='whatsapp'`, `contact_phone=wa_id`)
- Message persistence in `messages`
- AI flow (`matchSkillsSafely`, KB route, fallback, escalation checks)
- Operator lock and bot mode guards from shared utilities

## Channel Config Schema (in `channels.config`)
- `phone_number_id` (required)
- `business_account_id` (required)
- `permanent_access_token` (required)
- `app_secret` (required; webhook signature validation)
- `verify_token` (required; webhook challenge flow)
- `display_phone_number` (optional)
- `webhook_verified_at` (optional)

## Webhook Contract
### GET `/api/webhooks/whatsapp`
- Validate `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`.
- Match `verify_token` to the stored WhatsApp channel.
- Return `hub.challenge` on success, `403` on mismatch.

### POST `/api/webhooks/whatsapp`
- Read raw request body.
- Validate `x-hub-signature-256` using HMAC-SHA256 with `app_secret`.
- Parse Meta payload and extract text message events.
- Ignore non-text or non-message events safely with `200`.
- Enforce idempotency using inbound `wamid` (no duplicate AI replies).
- Process message through existing AI routing and send text reply through Graph API.

## Security, Reliability, and Operations
- Signature mismatch => reject request (`401`) and stop processing.
- Token/secret values are server-only and never returned to client logs.
- Redact sensitive config fields in debug output.
- Keep fail-open behavior in AI routing (if skill match fails, continue KB/fallback path).
- Persist inbound messages before AI processing to preserve auditability.
- For outbound Meta errors, keep structured server logs with org/channel/conversation identifiers.

## Testing Plan
- Unit tests:
  - Webhook signature verification helper.
  - WhatsApp payload parser (text-only extraction).
  - Idempotency guard for duplicate `wamid`.
  - WhatsApp client request/response/error normalization.
- Integration tests:
  - End-to-end webhook flow creates conversation + stores inbound + stores outbound.
  - Operator-locked conversation suppresses auto-reply.
  - Bot mode shadow/off suppresses reply while preserving lead extraction rules.
- Regression:
  - Existing Telegram webhook behavior remains unchanged.
  - Inbox manual send works for both Telegram and WhatsApp branches.
- Build verification: `npm run build`.

## Rollout and Exit Criteria
- Channel can be connected from Settings and passes webhook verification.
- Incoming WhatsApp text creates/updates inbox conversation reliably.
- AI response is delivered via Meta and persisted in `messages`.
- Duplicate inbound events do not create duplicate replies.
- No regression in Telegram channel and existing inbox workflows.
