# Lead Extraction & Qualification — Design

## Overview
We will implement lead extraction as a conversation-level snapshot that updates on every new customer message. The system extracts service intent, timing, location, budget signals, and risk/intent cues, then produces a 0-10 score and Hot/Warm/Cold status. Lead extraction is grounded in the org's **Offering Profile** (service scope summary) and optionally an approved **Service Catalog** derived from Skills/KB with admin confirmation to avoid false positives. Non-business conversations are detected and excluded from lead scoring.

## Approaches Considered
1. **Manual service catalog only**: Highest control, but heavy admin overhead.
2. **Fully automatic from Skills/KB**: Lowest overhead, higher risk of incorrect services.
3. **Hybrid (Chosen)**: Auto-propose services from Skills/KB and require admin approval; use an Offering Profile when a catalog is absent or incomplete.

## Architecture
- **Offering Profile**: Admin-visible, editable service scope summary (`offering_profile`). Used when catalog is absent or incomplete.
- **Service catalog (optional)**: Approved services per org (`service_catalog`). Only these can be assigned as `service_type`.
- **Service candidates**: Proposed services derived from Skills/KB (`service_candidates`). Admin approves or rejects if catalog is enabled.
- **Lead snapshot**: One lead record per conversation with extracted fields and score (`leads`).
- **Non-business classifier**: A lightweight classification step that flags personal/non-business chats; flagged conversations skip scoring.
- **Async extraction**: Lead extraction runs in an async worker/edge function to avoid delaying message responses.

## Components
- **Profile updater**: Runs when a Skill or KB document is created/updated. It summarizes the new document and proposes a delta update to the Offering Profile.
- **Candidate extractor (optional)**: If catalog is enabled, it proposes new service names and compares against existing catalog entries. Only differences are surfaced to admins.
- **Admin review UI**: In settings, shows pending profile updates and (if enabled) service candidates with approve/reject actions and a short explanation. A link from settings guides admins to the review screen.
- **Lead extraction worker**: Consumes conversation context + approved catalog to produce a lead snapshot.
- **Lead list UI**: Displays score, status, service type, intent level, and last activity.

## Data Flow
1. **Skill/KB updated** -> profile updater runs -> pending profile change stored.
2. **Admin approves** -> Offering Profile updated.
3. **Catalog enabled?** If yes, candidate extractor runs -> new candidates are stored as `pending`.
4. **Admin approves** -> approved items are added to `service_catalog`.
5. **Customer message arrives** -> async lead extraction starts with last N messages + prior snapshot + catalog/profile.
6. **Non-business check** -> if true, skip scoring and set `lead_status=ignored` with a short note.
7. **Extraction** -> fill fields, compute score, update summary, and classify status.
8. **Usage logging** -> record tokens under `lead_extraction` usage category.

## Scoring & Status
- **Service-Fit (0-4)**: Based on catalog match and clarity.
- **Intent (0-6)**: Date clarity, budget signals, decisiveness, urgency.
- **Total (0-10)**.
- **Out-of-scope** (no catalog match): cap score at 3 (Cold).
- **Status**: Hot 8-10, Warm 5-7, Cold 0-4.

## Error Handling
- If no catalog match, set `service_type=null` and include a short "service unclear" note in summary. Use Offering Profile for fit/intent inference instead.
- If the classifier is uncertain, default to business to avoid missing real leads.
- On extraction errors, keep the last known lead snapshot and log the failure.

## i18n
- Admin UI strings for candidate review and lead fields must use `messages/en.json` and `messages/tr.json`.

## Testing
- Unit: profile delta generation, candidate diffing, score calculation, non-business skip logic.
- Integration: Skill/KB update -> profile proposal -> admin approval -> lead extraction (with and without catalog enabled).
- Manual: confirm lead list reflects score/status updates after new messages.
