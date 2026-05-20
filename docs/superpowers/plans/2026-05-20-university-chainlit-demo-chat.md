# University Demo Chat Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let university stakeholders test Qualy from a public `app.askqualy.com` demo chat URL while every tester gets a private chat session and every conversation is persisted into the operator Inbox as a read-only `demo_chat` channel.

**Architecture:** Qualy owns routing, persistence, AI behavior, and the public entry URL. The public URL resolves a demo slug to an organization through a server-side demo channel mapping; the browser never receives an organization id. Chainlit can still be used as the ready-made chat UI, but it must call Qualy's demo channel API, which runs the same inbound AI pipeline shape used by WhatsApp/Instagram/Telegram and returns the bot reply to the tester while saving both sides in `conversations` and `messages`.

**Tech Stack:** Next.js App Router route handlers, Supabase/Postgres migration + RLS/service-role access, TypeScript, Vitest, existing `processInboundAiPipeline`, Chainlit or embedded ready chat surface, `app.askqualy.com` public route, next-intl.

---

## Confirmed Requirements

- Public tester URL lives under `app.askqualy.com`, for example `https://app.askqualy.com/demo/yiu-aday-asistani`.
- The URL uses a public slug, not an organization id.
- Server-side mapping decides which organization the demo belongs to.
- Multiple university officials can use the same link at the same time.
- Each browser/session gets its own conversation; testers must not see each other's messages.
- All demo conversations must appear in the operator Inbox.
- Operator can read demo conversations and AI replies.
- Operator outbound/manual reply is disabled for `demo_chat` conversations for now.
- Demo channel should have its own platform identity in Inbox, not pretend to be WhatsApp, Instagram, Telegram, or the internal Simulator.
- AI replies must still come from Qualy's existing skills/KB/RAG/guardrail pipeline.

## Scope Check

This plan builds a demo channel, not a full customer support channel. It does not add operator-to-demo-user replies, live human takeover, public signup, analytics dashboards, or a new no-code flow builder. It stores demo conversations so the operator can audit what testers asked and how the AI answered.

## File Structure

- Create `supabase/migrations/00122_demo_chat_channel.sql`: demo channel table, platform check update, indexes, and RLS/service-role constraints.
- Create `supabase/migrations/00122_demo_chat_channel.test.ts`: migration source guard for `demo_chat` platform and mapping table.
- Modify `src/types/database.ts`: add `demo_chat` to `ConversationPlatform`; add demo channel types if local DB types are maintained manually.
- Modify `src/lib/channels/inbound-ai-pipeline.ts`: allow `platform/source: 'demo_chat'`, build demo-specific metadata, and skip real provider send while still persisting bot messages.
- Create `src/lib/demo-chat/channel.ts`: resolve public demo slug to organization/channel config and normalize session identity.
- Create `src/lib/demo-chat/channel.test.ts`: resolver and session identity tests.
- Create `src/app/api/demo/[slug]/chat/route.ts`: public POST endpoint used by the demo UI.
- Create `src/app/api/demo/[slug]/chat/route.test.ts`: endpoint tests for slug resolution, per-session separation, persistence through pipeline, and returned bot reply.
- Create `src/app/[locale]/demo/[slug]/page.tsx`: `app.askqualy.com/{locale}/demo/{slug}` public shell if we embed/launch the ready UI from Qualy.
- Create or adapt `integrations/chainlit-university-demo/app.py`: ready chat UI that passes `slug`, `sessionId`, and message to Qualy and never receives organization ids.
- Modify `src/lib/channels/platform-icons.ts`: return a `demo_chat` icon.
- Add `public/demo-chat.svg` or use an existing neutral message icon asset.
- Modify `src/components/inbox/*` and `src/lib/inbox/actions.ts`: disable/manual-block outbound sends for `demo_chat`.
- Modify `messages/en.json` and `messages/tr.json`: demo chat labels and disabled-send copy.
- Modify `docs/ROADMAP.md`, `docs/PRD.md`, and `docs/RELEASE.md` after implementation.

## URL and Mapping Model

The public URL is:

```txt
https://app.askqualy.com/tr/demo/yiu-aday-asistani
```

The route resolves `yiu-aday-asistani` through a database-backed mapping:

```txt
demo_chat_channels.slug -> demo_chat_channels.organization_id
```

The tester never sees this:

```txt
organization_id=org_xxx
```

The endpoint receives only:

```json
{
  "sessionId": "browser-generated-or-server-issued-session-id",
  "message": "Diş hekimliği programı hakkında bilgi verir misiniz?"
}
```

Qualy turns that into:

```txt
platform: demo_chat
contact_phone/contact_id: demo:<channel_id>:<session_id>
contact_name: Demo ziyaretçi
metadata.demo_chat_slug: yiu-aday-asistani
metadata.demo_chat_session_id: <session_id>
```

## User Inputs Needed Before Execution

- Demo slug: recommended `yiu-aday-asistani`.
- Demo organization id or confirmation that the implementer should fetch it from the admin database.
- Public display name: for example `Yüksek İhtisas Üniversitesi Aday Öğrenci Asistanı`.
- Whether to show a university logo on the public page.
- Whether to protect the link with a simple shared password. Recommended: yes for the first external test.
- 15-20 realistic university test questions for acceptance testing.

## Task 1: Add Demo Channel Migration Tests

**Files:**
- Create: `supabase/migrations/00122_demo_chat_channel.test.ts`
- Later create: `supabase/migrations/00122_demo_chat_channel.sql`

- [ ] **Step 1: Write the failing migration source test**

Create `supabase/migrations/00122_demo_chat_channel.test.ts`:

```ts
import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync('supabase/migrations/00122_demo_chat_channel.sql', 'utf8')

describe('demo chat channel migration', () => {
  it('adds demo_chat to conversation platform constraints', () => {
    expect(migration).toContain("'demo_chat'")
    expect(migration).toMatch(/platform.*demo_chat/s)
  })

  it('creates a slug mapping table scoped to organizations', () => {
    expect(migration).toContain('create table if not exists public.demo_chat_channels')
    expect(migration).toContain('organization_id uuid not null references public.organizations')
    expect(migration).toContain('slug text not null unique')
    expect(migration).toContain('enabled boolean not null default true')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run supabase/migrations/00122_demo_chat_channel.test.ts
```

Expected: FAIL because `00122_demo_chat_channel.sql` does not exist.

## Task 2: Add Demo Channel Migration

**Files:**
- Create: `supabase/migrations/00122_demo_chat_channel.sql`
- Test: `supabase/migrations/00122_demo_chat_channel.test.ts`

- [ ] **Step 1: Create migration**

Create `supabase/migrations/00122_demo_chat_channel.sql`:

```sql
create table if not exists public.demo_chat_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null unique,
  display_name text not null,
  logo_url text,
  enabled boolean not null default true,
  shared_secret_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_chat_channels_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{2,80}$')
);

create index if not exists idx_demo_chat_channels_organization_id
  on public.demo_chat_channels(organization_id);

drop policy if exists "Service role can manage demo chat channels" on public.demo_chat_channels;
alter table public.demo_chat_channels enable row level security;

create policy "Service role can manage demo chat channels"
on public.demo_chat_channels
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

alter table public.conversations
  drop constraint if exists conversations_platform_check;

alter table public.conversations
  add constraint conversations_platform_check
  check (platform in ('whatsapp', 'telegram', 'instagram', 'simulator', 'demo_chat'));
```

- [ ] **Step 2: Run migration test**

Run:

```bash
npm test -- --run supabase/migrations/00122_demo_chat_channel.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit migration slice**

Run:

```bash
git add supabase/migrations/00122_demo_chat_channel.sql supabase/migrations/00122_demo_chat_channel.test.ts
git commit -m "feat(phase-gtm): add demo chat channel storage"
```

## Task 3: Add Demo Channel Resolver

**Files:**
- Create: `src/lib/demo-chat/channel.ts`
- Create: `src/lib/demo-chat/channel.test.ts`

- [ ] **Step 1: Write resolver test**

Create `src/lib/demo-chat/channel.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { resolveDemoChatChannel, buildDemoChatContactId } from '@/lib/demo-chat/channel'

function createSupabaseMock(row: Record<string, unknown> | null) {
  const maybeSingle = vi.fn(async () => ({ data: row, error: null }))
  const eqEnabled = vi.fn(() => ({ maybeSingle }))
  const eqSlug = vi.fn(() => ({ eq: eqEnabled }))
  const select = vi.fn(() => ({ eq: eqSlug }))

  return {
    from: vi.fn((table: string) => {
      expect(table).toBe('demo_chat_channels')
      return { select }
    })
  }
}

describe('resolveDemoChatChannel', () => {
  it('resolves enabled public slugs without exposing organization ids to the browser', async () => {
    const supabase = createSupabaseMock({
      id: 'channel-1',
      organization_id: 'org-1',
      slug: 'yiu-aday-asistani',
      display_name: 'YIU Aday Asistanı',
      logo_url: null,
      enabled: true
    })

    await expect(resolveDemoChatChannel({
      supabase: supabase as never,
      slug: 'yiu-aday-asistani'
    })).resolves.toEqual({
      id: 'channel-1',
      organizationId: 'org-1',
      slug: 'yiu-aday-asistani',
      displayName: 'YIU Aday Asistanı',
      logoUrl: null
    })
  })

  it('returns null for missing slugs', async () => {
    const supabase = createSupabaseMock(null)

    await expect(resolveDemoChatChannel({
      supabase: supabase as never,
      slug: 'missing-demo'
    })).resolves.toBeNull()
  })
})

describe('buildDemoChatContactId', () => {
  it('keeps each tester session isolated under the same demo slug', () => {
    expect(buildDemoChatContactId('channel-1', 'session-a')).toBe('demo:channel-1:session-a')
    expect(buildDemoChatContactId('channel-1', 'session-b')).toBe('demo:channel-1:session-b')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- --run src/lib/demo-chat/channel.test.ts
```

Expected: FAIL because resolver module does not exist.

- [ ] **Step 3: Implement resolver**

Create `src/lib/demo-chat/channel.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface DemoChatChannel {
  id: string
  organizationId: string
  slug: string
  displayName: string
  logoUrl: string | null
}

function normalizeSlug(slug: string) {
  return slug.trim().toLowerCase()
}

function normalizeSessionId(sessionId: string) {
  return sessionId.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96)
}

export function buildDemoChatContactId(channelId: string, sessionId: string) {
  return `demo:${channelId}:${normalizeSessionId(sessionId)}`
}

export async function resolveDemoChatChannel(args: {
  supabase: SupabaseClient
  slug: string
}): Promise<DemoChatChannel | null> {
  const slug = normalizeSlug(args.slug)
  if (!slug) return null

  const { data, error } = await args.supabase
    .from('demo_chat_channels')
    .select('id, organization_id, slug, display_name, logo_url, enabled')
    .eq('slug', slug)
    .eq('enabled', true)
    .maybeSingle()

  if (error || !data) return null

  return {
    id: String(data.id),
    organizationId: String(data.organization_id),
    slug: String(data.slug),
    displayName: String(data.display_name),
    logoUrl: typeof data.logo_url === 'string' ? data.logo_url : null
  }
}
```

- [ ] **Step 4: Run resolver test**

Run:

```bash
npm test -- --run src/lib/demo-chat/channel.test.ts
```

Expected: PASS.

## Task 4: Add Demo Chat API That Persists Through Inbox Pipeline

**Files:**
- Create: `src/app/api/demo/[slug]/chat/route.ts`
- Create: `src/app/api/demo/[slug]/chat/route.test.ts`
- Modify: `src/lib/channels/inbound-ai-pipeline.ts`

- [ ] **Step 1: Write route test**

Create `src/app/api/demo/[slug]/chat/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  createClientMock,
  resolveDemoChatChannelMock,
  processInboundAiPipelineMock,
  buildDemoChatContactIdMock
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  resolveDemoChatChannelMock: vi.fn(),
  processInboundAiPipelineMock: vi.fn(),
  buildDemoChatContactIdMock: vi.fn()
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock
}))

vi.mock('@/lib/demo-chat/channel', () => ({
  resolveDemoChatChannel: resolveDemoChatChannelMock,
  buildDemoChatContactId: buildDemoChatContactIdMock
}))

vi.mock('@/lib/channels/inbound-ai-pipeline', () => ({
  processInboundAiPipeline: processInboundAiPipelineMock
}))

import { POST } from '@/app/api/demo/[slug]/chat/route'

function createRequest(body: unknown) {
  return new NextRequest('http://localhost/api/demo/yiu-aday-asistani/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

describe('demo chat API route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
    createClientMock.mockReturnValue({ from: vi.fn() })
    resolveDemoChatChannelMock.mockResolvedValue({
      id: 'demo-channel-1',
      organizationId: 'org-1',
      slug: 'yiu-aday-asistani',
      displayName: 'YIU Aday Asistanı',
      logoUrl: null
    })
    buildDemoChatContactIdMock.mockReturnValue('demo:demo-channel-1:session-1')
  })

  it('returns 404 for disabled or missing demo slug', async () => {
    resolveDemoChatChannelMock.mockResolvedValueOnce(null)

    const res = await POST(createRequest({
      sessionId: 'session-1',
      message: 'Merhaba'
    }), { params: Promise.resolve({ slug: 'missing-demo' }) })

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Demo not found' })
    expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
  })

  it('persists each session as a separate demo_chat conversation and returns the AI reply', async () => {
    let capturedReply = ''
    processInboundAiPipelineMock.mockImplementation(async (input) => {
      await input.sendOutbound({ type: 'text', text: 'Merhaba, nasıl yardımcı olabilirim?' })
    })

    const res = await POST(createRequest({
      sessionId: 'session-1',
      message: 'Merhaba'
    }), { params: Promise.resolve({ slug: 'yiu-aday-asistani' }) })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      response: 'Merhaba, nasıl yardımcı olabilirim?',
      skillImage: null
    })
    expect(buildDemoChatContactIdMock).toHaveBeenCalledWith('demo-channel-1', 'session-1')
    expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      platform: 'demo_chat',
      source: 'demo_chat',
      contactId: 'demo:demo-channel-1:session-1',
      contactName: 'Demo ziyaretçi',
      text: 'Merhaba',
      inboundMessageIdMetadataKey: 'demo_chat_message_id',
      logPrefix: 'Demo Chat'
    }))
  })
})
```

- [ ] **Step 2: Run route test to verify it fails**

Run:

```bash
npm test -- --run 'src/app/api/demo/[slug]/chat/route.test.ts'
```

Expected: FAIL because route does not exist and pipeline types do not yet accept `demo_chat`.

- [ ] **Step 3: Extend inbound pipeline types**

Modify `src/lib/channels/inbound-ai-pipeline.ts`:

```ts
export interface InboundAiPipelineInput {
    supabase: SupabaseClient
    organizationId: string
    platform: 'whatsapp' | 'telegram' | 'instagram' | 'demo_chat'
    source: 'whatsapp' | 'telegram' | 'instagram' | 'demo_chat'
    contactId: string
    contactName: string | null
    contactAvatarUrl?: string | null
    text: string
    inboundMessageId: string
    inboundMessageIdMetadataKey: string
    inboundMessageMetadata: Record<string, unknown>
    inboundActionSelection?: {
        kind: 'skill_action'
        sourceSkillId: string
        actionId: string
        buttonTitle: string | null
    }
    skipAutomation?: boolean
    sendOutbound: (content: OutboundMessageInput) => Promise<OutboundSendResult | void>
    logPrefix: string
}
```

Update helper functions in the same file so `demo_chat` falls through to text-only behavior and does not build WhatsApp metadata. For `buildSkillImageMetadata`, add a final demo branch before the WhatsApp return:

```ts
    if (platform === 'demo_chat') {
        return {
            demo_chat_message_type: 'image',
            demo_chat_media_type: 'image',
            demo_chat_media_mime_type: image.mimeType ?? 'image/webp',
            demo_chat_media_filename: image.fileName ?? null,
            demo_chat_outbound_status: status,
            demo_chat_is_media_placeholder: true,
            demo_chat_media: baseMedia
        }
    }
```

For `buildOutboundProviderMetadata`, return metadata unchanged for `demo_chat`:

```ts
    if (platform === 'demo_chat') {
        return metadata
    }
```

- [ ] **Step 4: Implement route**

Create `src/app/api/demo/[slug]/chat/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import { processInboundAiPipeline } from '@/lib/channels/inbound-ai-pipeline'
import { buildDemoChatContactId, resolveDemoChatChannel } from '@/lib/demo-chat/channel'
import type { OutboundMessageInput } from '@/lib/channels/outbound-message'

export const runtime = 'nodejs'

const MAX_MESSAGE_CHARS = 2000

type RouteContext = {
  params: Promise<{ slug: string }>
}

type DemoChatBody = {
  sessionId?: unknown
  message?: unknown
}

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase service-role configuration')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

function readTextReply(content: OutboundMessageInput) {
  if (typeof content === 'string') return content
  if (content.type === 'text') return content.text
  return ''
}

export async function POST(req: NextRequest, context: RouteContext) {
  let body: DemoChatBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: 'Message is too long' }, { status: 400 })
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  if (!sessionId) {
    return NextResponse.json({ error: 'Session is required' }, { status: 400 })
  }

  const { slug } = await context.params
  const supabase = createServiceClient()
  const channel = await resolveDemoChatChannel({ supabase, slug })
  if (!channel) {
    return NextResponse.json({ error: 'Demo not found' }, { status: 404 })
  }

  let replyText = ''
  let skillImage: { imageUrl: string; mimeType?: string | null; fileName?: string | null } | null = null
  const inboundMessageId = uuidv4()

  await processInboundAiPipeline({
    supabase,
    organizationId: channel.organizationId,
    platform: 'demo_chat',
    source: 'demo_chat',
    contactId: buildDemoChatContactId(channel.id, sessionId),
    contactName: 'Demo ziyaretçi',
    text: message,
    inboundMessageId,
    inboundMessageIdMetadataKey: 'demo_chat_message_id',
    inboundMessageMetadata: {
      demo_chat_message_id: inboundMessageId,
      demo_chat_channel_id: channel.id,
      demo_chat_slug: channel.slug,
      demo_chat_session_id: sessionId
    },
    sendOutbound: async (content) => {
      const text = readTextReply(content)
      if (text) replyText = text
      if (typeof content === 'object' && content.type === 'image') {
        skillImage = {
          imageUrl: content.imageUrl,
          mimeType: content.mimeType,
          fileName: content.fileName
        }
      }
      return undefined
    },
    logPrefix: 'Demo Chat'
  })

  return NextResponse.json({
    response: replyText,
    skillImage
  })
}
```

- [ ] **Step 5: Run route test**

Run:

```bash
npm test -- --run 'src/app/api/demo/[slug]/chat/route.test.ts'
```

Expected: PASS.

## Task 5: Add Public Demo Entry Under app.askqualy.com

**Files:**
- Create: `src/app/[locale]/demo/[slug]/page.tsx`
- Create: `src/app/[locale]/demo/[slug]/page.test.tsx` or source guard test if local render setup is heavy.
- Create/modify: `integrations/chainlit-university-demo/app.py` if Chainlit is embedded or reverse-proxied.

- [ ] **Step 1: Decide deployment shape**

Use this default unless the hosting stack blocks it:

```txt
Browser URL: https://app.askqualy.com/tr/demo/yiu-aday-asistani
Qualy Next page: renders the public demo shell
Ready UI: Chainlit embedded inside the page or proxied behind the same domain
API calls: POST /api/demo/yiu-aday-asistani/chat
```

If Chainlit cannot be cleanly hosted behind `app.askqualy.com`, use a minimal first-party chat shell only for the message list/input while keeping the rest of the architecture unchanged. The important product contract is persistence into `demo_chat`, not the UI vendor.

- [ ] **Step 2: Ensure session isolation**

The public page or Chainlit app must create and persist a browser-local session id:

```ts
const storageKey = `qualy-demo-chat-session:${slug}`
const existing = window.localStorage.getItem(storageKey)
const sessionId = existing || crypto.randomUUID()
window.localStorage.setItem(storageKey, sessionId)
```

Every message POST includes this `sessionId`. Different officials on different browsers get different conversations. One official refreshing the page keeps their own thread.

## Task 6: Update Inbox Platform Identity and Disable Operator Outbound

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/lib/channels/platform-icons.ts`
- Modify: `src/lib/channels/platform-icons.test.ts`
- Modify: `src/lib/inbox/actions.ts`
- Modify: `src/lib/inbox/actions.test.ts`
- Modify: `src/components/inbox/InboxContainer.tsx`
- Modify: `src/components/inbox/ConversationList.tsx`
- Modify: `src/components/leads/LeadsTable.tsx`
- Modify: `messages/en.json`
- Modify: `messages/tr.json`

- [ ] **Step 1: Add platform type and icon**

Change:

```ts
export type ConversationPlatform = 'whatsapp' | 'telegram' | 'instagram' | 'simulator' | 'demo_chat'
```

Add icon behavior:

```ts
export function getConversationPlatformIconSrc(platform: ConversationPlatform): string | null {
    if (platform === 'simulator') return null
    if (platform === 'demo_chat') return '/demo-chat.svg'
    return getChannelPlatformIconSrc(platform)
}
```

- [ ] **Step 2: Block operator outbound server-side**

In `src/lib/inbox/actions.ts`, before provider-specific send logic in `sendMessage`, add:

```ts
  if (conversation.platform === 'demo_chat') {
    throw new Error('Operator replies are disabled for demo chat conversations')
  }
```

Add a test proving `queue_operator_message` is not called for `demo_chat`.

- [ ] **Step 3: Disable send UI client-side**

In Inbox selected-conversation UI, derive:

```ts
const isDemoChatConversation = selectedConversation?.platform === 'demo_chat'
const isOutboundDisabled = isDemoChatConversation
```

Pass disabled state to the composer and show localized copy:

```txt
EN: Replies are disabled for demo chat. Testers only receive AI replies.
TR: Demo Chat konuşmalarında operatör yanıtı kapalı. Test kullanıcıları yalnızca AI yanıtlarını alır.
```

## Task 7: Verification

**Files:**
- All touched files.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test -- --run supabase/migrations/00122_demo_chat_channel.test.ts src/lib/demo-chat/channel.test.ts 'src/app/api/demo/[slug]/chat/route.test.ts' src/lib/channels/platform-icons.test.ts src/lib/inbox/actions.test.ts src/i18n/messages.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Manual smoke**

Create a `demo_chat_channels` row:

```sql
insert into public.demo_chat_channels (organization_id, slug, display_name)
values ('<demo-org-id>', 'yiu-aday-asistani', 'Yüksek İhtisas Üniversitesi Aday Öğrenci Asistanı');
```

Open:

```txt
https://app.askqualy.com/tr/demo/yiu-aday-asistani
```

Verify:

- Official A sends a message and receives an AI answer.
- Official B in another browser sends a message and sees only their own thread.
- Operator Inbox shows two separate `demo_chat` conversations.
- Each conversation contains contact messages and bot replies.
- Operator composer is disabled for these conversations.
- WhatsApp/Instagram/Telegram conversations remain replyable.

## Task 8: Product Docs and Release Notes

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/PRD.md`
- Modify: `docs/RELEASE.md`

- [ ] **Step 1: Update roadmap**

Add:

```md
> **Update Note (2026-05-20):** University demo chat now uses a first-party `app.askqualy.com` public slug mapped server-side to a Qualy organization. Each tester session becomes a separate `demo_chat` Inbox conversation, AI replies are persisted for operator review, and manual operator replies are disabled on the demo channel for the first pilot.
```

- [ ] **Step 2: Update PRD Tech Decisions**

Add:

```md
- **Demo Chat Channel (Implementation 2026-05-20):** Public university demo links use a slug under `app.askqualy.com` instead of exposing organization ids. The slug maps server-side to a demo organization/channel, each tester session persists as a separate `demo_chat` conversation in Inbox, and operator outbound replies are disabled until a later human-takeover iteration.
```

- [ ] **Step 3: Update release notes**

Under `[Unreleased] -> Added`, add:

```md
- Added a first-party university demo chat channel that persists tester conversations into Inbox while keeping each tester session private and disabling operator replies for demo chat.
```

## Self-Review

- Spec coverage: The revised plan covers `app.askqualy.com`, slug-to-organization mapping, multiple private tester sessions, Inbox persistence, demo platform identity, and disabled operator outbound.
- Placeholder scan: Values that must come from the user are listed explicitly. The only branch is the UI hosting shape because Chainlit under the existing app domain depends on deploy/proxy capabilities.
- Type consistency: `demo_chat` is added to database constraints, TypeScript platform types, inbound pipeline input, icon rendering, Inbox send guards, and tests.
