alter table conversations
    add column if not exists private_note text,
    add column if not exists private_note_updated_at timestamptz,
    add column if not exists private_note_updated_by uuid;
