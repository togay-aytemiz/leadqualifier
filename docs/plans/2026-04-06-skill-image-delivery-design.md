# Skill Image Delivery (Single Image) — Design

Date: 2026-04-06

## Summary
Add optional single-image support to Skills so a matched skill can send two sequential outbound messages: first the existing `response_text`, then one image. The first release should work across supported channels with the same product contract, keep human handover behavior intact, and let operators preview the exact sequence inside Simulator.

## Validated Product Decisions
- Scope: one optional image per skill in v1.
- Input method: operator uploads the file inside the app.
- Delivery order: text first, image second, as two separate outbound messages.
- Channels: support the same behavior on WhatsApp, Instagram, Telegram, and Simulator; unsupported channels should fail safe without blocking the text reply.
- Failure policy: if the image send fails, the text reply remains delivered; log the failure and surface an operator-visible warning.
- Handover policy: if `requires_human_handover=true`, send the skill text, attempt the image, then continue the existing escalation/handover flow.

## Media Contract
- Maximum upload size: `5 MB` original file size.
- Stored format: `WebP`.
- Normalization: convert on upload before persistence, not lazily at send time.
- Resize rule: shrink only when needed; do not upscale smaller images.
- Suggested default target: long edge `1600px`.
- Quality target: `92`.
- Quality floor: never go below `90`.
- Metadata: strip EXIF and keep only the fields needed for delivery/debug.

## Recommended Architecture
- Keep the first release simple by storing one image metadata payload directly on the `skills` record instead of creating a separate asset table.
- Reuse the existing Supabase Storage pattern already used for profile avatars and outbound Inbox media.
- Use a dedicated bucket/path for skill assets so lifecycle and cleanup remain isolated from operator-sent conversation attachments.
- Persist lightweight skill image metadata such as:
  - `image_storage_path`
  - `image_public_url`
  - `image_mime_type`
  - `image_width`
  - `image_height`
  - `image_size_bytes`
  - `image_original_filename`
  - `image_updated_at`

This keeps the v1 write/read path straightforward while leaving room to migrate later to a separate asset table if multi-image or localized assets become necessary.

## Upload Flow
1. Operator selects an image in the Skills editor.
2. Client validates original file size (`<= 5 MB`).
3. Client normalizes the image to `WebP` with the agreed resize/quality rules.
4. Server returns a signed upload target for the normalized asset.
5. Client uploads the generated `WebP`.
6. Skill save persists the skill fields plus image metadata.
7. Replacing an image removes the old object after the new asset is persisted successfully.
8. Deleting a skill should also clean up its stored image asset.

The client-side conversion path is preferred for v1 because it guarantees the persisted object is already in the final outbound format and avoids introducing a separate image-processing backend pipeline for this feature alone.

## Runtime Behavior
- When a skill matches, the runtime sends `response_text` first using the existing skill reply path.
- If the skill has an image, the runtime then sends a second outbound image message using the stored public URL.
- The image step must be adapter-driven per channel:
  - WhatsApp: reuse `sendImage`.
  - Instagram: reuse `sendImage`.
  - Telegram: add outbound image support to the client.
  - Simulator: render a text bubble followed by an image bubble.
- If the second step fails:
  - do not roll back the text reply
  - persist/send failure metadata for the image step
  - log the error with org/channel/conversation/skill identifiers
  - expose an operator-visible warning in the relevant UI surface

## Handover Sequence
`requires_human_handover` remains part of the contract.

Recommended order:
1. Send skill text.
2. Attempt skill image if configured.
3. Apply the existing escalation decision.
4. If escalation switches the conversation to operator, do so regardless of image-send success or failure.

This keeps the skill response intact, preserves current escalation semantics, and avoids treating media delivery as a prerequisite for human takeover.

## UI and Simulator
- Add a single-image upload area to the Skills editor.
- Show preview, replace, and remove controls.
- Display short helper copy that explains:
  - one image per skill
  - max `5 MB`
  - image is converted to `WebP`
  - customer receives text first, then image
- Keep all visible strings in `messages/en.json` and `messages/tr.json`.
- Simulator should show the exact sequence for validation:
  - bot text bubble
  - bot image bubble
  - handover behavior if the skill requires it

## Error Handling
- Reject oversized uploads before upload preparation.
- Reject unsupported or unreadable files during normalization with localized form feedback.
- If upload succeeds but skill persistence fails, remove the newly uploaded object.
- If image delivery fails at runtime, preserve the text reply and handover behavior.
- Unsupported outbound-image channels should fail safe and report `unsupported_channel` rather than blocking the skill response.

## Testing Plan
- Skill image upload validation:
  - rejects original files over `5 MB`
  - enforces `WebP` output contract
  - respects resize rule without upscaling
- Skill persistence:
  - create/update stores image metadata correctly
  - replace cleans up previous asset
  - delete cleans up asset
- Runtime:
  - matched skill sends text before image
  - image failure does not suppress the text reply
  - `requires_human_handover=true` still escalates after the media attempt
  - unsupported-channel media path fails safe
- Simulator:
  - renders text bubble then image bubble
  - preserves handover-visible state after the skill response
- Verification:
  - `npm run build`

## Implementation Surfaces
- `supabase/migrations/*`: add skill image metadata columns and storage policies if needed
- `src/types/database.ts`: extend `Skill`
- `src/lib/skills/actions.ts`: persist image metadata and cleanup behavior
- `src/components/skills/*`: upload UX and preview
- `src/lib/whatsapp/client.ts`: reuse existing image send path
- `src/lib/instagram/client.ts`: reuse existing image send path
- `src/lib/telegram/client.ts`: add outbound image send support
- `src/lib/channels/inbound-ai-pipeline.ts`: add sequential text-then-image skill delivery
- `src/app/api/webhooks/telegram/route.ts`: align direct Telegram skill path if it remains separate
- `src/app/[locale]/(dashboard)/simulator/*`: mirror the runtime sequence in UI

## Exit Criteria
- Operators can attach, replace, preview, and remove one skill image.
- Stored assets are normalized to `WebP` and respect the agreed constraints.
- Supported channels send text first and image second for matched skills.
- Image-send failures do not block text replies or handover.
- Simulator reflects the same sequence and handover behavior.
