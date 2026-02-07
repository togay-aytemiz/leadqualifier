-- Human escalation policy fields (org-level + skill-level)

ALTER TABLE public.organization_ai_settings
ADD COLUMN IF NOT EXISTS hot_lead_score_threshold INT NOT NULL DEFAULT 7
CHECK (hot_lead_score_threshold >= 0 AND hot_lead_score_threshold <= 10),
ADD COLUMN IF NOT EXISTS hot_lead_action TEXT NOT NULL DEFAULT 'notify_only'
CHECK (hot_lead_action IN ('notify_only', 'switch_to_operator')),
ADD COLUMN IF NOT EXISTS hot_lead_handover_message_tr TEXT NOT NULL DEFAULT 'Ekibi bilgilendirdim. Şu anda bir müşteriyle ilgileniyor olabilirler, size en kısa sürede dönüş yapacaklar.',
ADD COLUMN IF NOT EXISTS hot_lead_handover_message_en TEXT NOT NULL DEFAULT 'I''ve notified the team. Since they might be with a client, they''ll get back to you as soon as possible.';

ALTER TABLE public.skills
ADD COLUMN IF NOT EXISTS requires_human_handover BOOLEAN NOT NULL DEFAULT FALSE;
