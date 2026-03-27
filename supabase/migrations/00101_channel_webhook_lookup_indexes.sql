create index if not exists channels_whatsapp_active_verify_token_idx
on public.channels ((config->>'verify_token'))
where type = 'whatsapp'
  and status = 'active'
  and config ? 'verify_token';

create index if not exists channels_whatsapp_active_phone_number_id_idx
on public.channels ((config->>'phone_number_id'))
where type = 'whatsapp'
  and status = 'active'
  and config ? 'phone_number_id';

create index if not exists channels_telegram_active_webhook_secret_idx
on public.channels ((config->>'webhook_secret'))
where type = 'telegram'
  and status = 'active'
  and config ? 'webhook_secret';
