alter table public.eventos
  drop column if exists prazo_fatal,
  drop column if exists prazo_interno,
  drop column if exists google_event_id_fatal,
  drop column if exists google_event_id_interno;
