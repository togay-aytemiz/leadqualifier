# Inbox & Conversation Management Implementation Plan

## Goal
Create a centralized "Inbox" page (`/dashboard/inbox`) to manage conversations from multiple channels (WhatsApp, Telegram, Simulator). This will serve as the agent/human-in-the-loop interface.

## Reference Design
Based on the provided HTML/Visuals:
- **3-Pane Layout**:
    1.  **Conversation List**: Filterable list of active conversations.
    2.  **Chat Interface**: Message history, reply box, internal notes.
    3.  **Details Panel**: User info, attributes, past tickets/tags.

## 1. Database Schema
We need backend storage for these conversations.

### `conversations` table
- `id`: UUID
- `organization_id`: UUID (FK)
- `contact_name`: Text (e.g. "Alexandra Anholt")
- `contact_phone`: Text
- `platform`: Enum ('whatsapp', 'telegram', 'simulator')
- `status`: Enum ('open', 'closed', 'snoozed')
- `assignee_id`: UUID (FK to profiles, nullable)
- `last_message_at`: Timestamptz
- `unread_count`: Integer
- `tags`: Text[]

### `messages` table
- `id`: UUID
- `conversation_id`: UUID (FK)
- `sender_type`: Enum ('user', 'contact', 'system', 'bot')
- `content`: Text
- `metadata`: JSONB (for debug info, confidence scores, etc.)
- `created_at`: Timestamptz

## 2. Server Actions
- `getConversations(orgId, filter)`
- `getMessages(conversationId)`
- `sendMessage(conversationId, content)` (This will trigger the bot/matching logic if in auto mode)

## 3. UI Implementation
Route: `src/app/[locale]/(dashboard)/inbox/page.tsx`

### Components
- `InboxLayout`: Manages the 3-pane responsive grid.
- `ConversationList`:
    - Search bar.
    - Filters (Open, Closed, Assigned to me).
    - List items with avatar, name, last message preview, time.
- `ChatWindow`:
    - Header (Contact info).
    - Message list (Bubbles with distinct styles for User vs Bot vs Agent).
    - Input area (Textarea, attachments, canned responses/skills?).
- `DetailsPanel`:
    - Contact attributes.
    - Tags.
    - "AI Copilot" summary (future).

## Step-by-Step
1.  **Schema**: Create migration for `conversations` and `messages`.
2.  **Mock Data**: Seed script to create meaningful demo data (like in the reference).
3.  **UI Shell**: Implement the high-fidelity Tailwind layout from the reference.
4.  **Wiring**: Connect UI to Supabase real-time (optional for now) or simple fetching.
