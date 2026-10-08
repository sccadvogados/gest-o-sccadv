alter table public.eventos add column if not exists prazo_fatal date;
alter table public.eventos add column if not exists prazo_interno date;
alter table public.eventos add column if not exists data_fim timestamptz;
alter table public.eventos add column if not exists local_link text;

create index if not exists eventos_prazo_fatal_idx on public.eventos (prazo_fatal);
