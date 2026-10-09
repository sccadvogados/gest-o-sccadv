alter table public.eventos
  add column if not exists dia_inteiro boolean not null default false,
  add column if not exists google_event_id text,
  add column if not exists created_by uuid references auth.users(id) default auth.uid(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.eventos drop constraint if exists eventos_status_check;
alter table public.eventos add constraint eventos_status_check check (status in ('pendente', 'cumprido', 'cancelado'));

create or replace function public.set_eventos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists eventos_set_updated_at on public.eventos;
create trigger eventos_set_updated_at
before update on public.eventos
for each row execute function public.set_eventos_updated_at();
