alter table public.eventos
  add column if not exists google_event_id_fatal text,
  add column if not exists google_event_id_interno text;
