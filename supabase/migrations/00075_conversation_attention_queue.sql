-- Track explicit human-attention queue state on conversations.

ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS human_attention_required BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS human_attention_reason TEXT NULL,
ADD COLUMN IF NOT EXISTS human_attention_requested_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS human_attention_resolved_at TIMESTAMPTZ NULL;

ALTER TABLE public.conversations
DROP CONSTRAINT IF EXISTS conversations_human_attention_reason_check;

ALTER TABLE public.conversations
ADD CONSTRAINT conversations_human_attention_reason_check
CHECK (human_attention_reason IS NULL OR human_attention_reason IN ('skill_handover', 'hot_lead'));

CREATE INDEX IF NOT EXISTS conversations_org_attention_idx
ON public.conversations (organization_id, human_attention_required, last_message_at DESC);

CREATE INDEX IF NOT EXISTS conversations_org_unassigned_operator_idx
ON public.conversations (organization_id, active_agent, assignee_id, last_message_at DESC);

UPDATE public.conversations
SET
    human_attention_required = TRUE,
    human_attention_requested_at = COALESCE(human_attention_requested_at, updated_at, NOW()),
    human_attention_resolved_at = NULL
WHERE active_agent = 'operator'
  AND assignee_id IS NULL
  AND human_attention_required = FALSE;
