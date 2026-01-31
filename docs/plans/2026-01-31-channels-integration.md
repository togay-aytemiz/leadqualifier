# Channels & Integrations Implementation Plan

## Goal
Allow users to connect external messaging channels (Telegram, WhatsApp) to their organization via a "Settings > Channels" page.

## 1. Database Schema
New table `channels` to store integration credentials securely.

### `channels` table
- `id`: UUID
- `organization_id`: UUID (FK)
- `type`: Enum ('telegram', 'whatsapp')
- `name`: Text (e.g. "Support Bot", "Sales Line")
- `config`: JSONB (Stores tokens, phone numbers, webhooks secrets)
    - Telegram: `{ "bot_token": "...", "username": "..." }`
    - WhatsApp: `{ "phone_number_id": "...", "access_token": "..." }`
- `status`: Enum ('active', 'disconnected', 'error')
- `created_at`: Timestamptz

**Security Note**: For production, tokens should be encrypted (Supabase Vault or PGSodium), but for this MVP we will store them in `config` with strict RLS (Org Admins only).

## 2. UI Implementation
Route: `src/app/[locale]/(dashboard)/settings/channels/page.tsx`

### Components
- `ChannelCard`: Displays status of a channel (Connected/Disconnected).
- `ConnectTelegramModal`: Form to input Bot Token.
    - Instructions: "Talk to @BotFather, create bot, paste token here."
- `ConnectWhatsAppModal`: (Placeholder for now).

## 3. Server Actions
- `connectChannel(orgId, type, config)`
    - Validates token (e.g. calls `getMe` on Telegram API to verify).
    - Inserts into DB.
- `disconnectChannel(channelId)`
- `getChannels(orgId)`

## 4. Webhook Handling (Future)
- We will need an API route `api/webhooks/telegram` to receive messages.
- This phase focuses only on *saving* the credentials.

## Step-by-Step
1.  **Migration**: Create `channels` table.
2.  **UI**: Create `/settings/channels` page.
3.  **Action**: Implement `connectChannel` with Telegram token validation.
