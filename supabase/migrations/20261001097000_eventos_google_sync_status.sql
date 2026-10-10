alter table public.eventos
  add column if not exists google_sync_status text not null default 'pendente',
  add column if not exists google_sync_error text,
  add column if not exists google_sync_updated_at timestamptz;
