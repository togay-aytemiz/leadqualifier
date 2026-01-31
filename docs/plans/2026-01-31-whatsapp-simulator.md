# WhatsApp Simulator Implementation Plan

## Goal
Create a chat interface that mimics WhatsApp to test the **Skill System** and **Knowledge Base** (future) logic in a realistic conversational environment, without connecting to the actual WhatsApp API.

## Features
1.  **WhatsApp-like UI**: Green/White message bubbles, "read" ticks, timestamp.
2.  **Org-Specific Context**: Ability to select which organization context to chat in.
3.  **Real-time Interaction**:
    *   User sends message.
    *   System simulates "typing..." delay.
    *   System responds using the **Skill System** (embedding matching).
4.  **Debug Mode**: Option to see "Behind the Scenes" (which skill matched, confidence score) alongside the chat.

## Technical Architecture

### 1. Routes
- `/dashboard/simulator`: Main simulator page.
- `/chat/[org_id]`: Standalone full-page chat (optional, for "public link" testing).

### 2. Components
- `ChatSimulator`: Main container.
- `MessageBubble`: Individual message component (User vs. System).
- `ChatInput`: Text input with send button.
- `DebugPanel`: Sidebar showing matching details.

### 3. Server Actions
- `simulateMessage(message: string, orgId: string)`:
    *   Inputs: User message, Organization ID.
    *   Logic:
        1.  Generate embedding for message.
        2.  Call `match_skills` RPC.
        3.  Select best match based on threshold.
        4.  Return response text + debug info (matched skill ID, similarity, etc.).

### 4. State Management
- Local React state ( `useState` ) for the chat history list.
- No database persistence for *simulation* chats (unless we want to log them as "test leads").

## Step-by-Step Plan
1.  **Server Action**: Create `simulateChat` action in `src/lib/chat/actions.ts`.
2.  **UI Component**: Build `ChatWindow` with WhatsApp styling.
3.  **Page**: Create `src/app/[locale]/(dashboard)/simulator/page.tsx`.
4.  **Integration**: Connect UI to Server Action.
