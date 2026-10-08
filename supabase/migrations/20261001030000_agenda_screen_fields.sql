create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('prazo', 'audiencia', 'reuniao', 'compromisso')),
  titulo text not null,
  descricao text,
  cliente_id uuid references public.clients(id) on delete set null,
  contrato_id uuid references public.contracts(id) on delete set null,
  numero_processo text,
  orgao_vara text,
  data_inicio timestamptz not null,
  responsavel text,
  status text not null default 'pendente' check (status in ('pendente', 'cumprido')),
  created_at timestamptz not null default now()
);

alter table public.eventos add column if not exists responsavel text;
alter table public.eventos add column if not exists status text not null default 'pendente';
alter table public.eventos enable row level security;

create policy "eventos_authenticated_select" on public.eventos for select to authenticated using (true);
create policy "eventos_authenticated_insert" on public.eventos for insert to authenticated with check (true);
create policy "eventos_authenticated_update" on public.eventos for update to authenticated using (true) with check (true);

create index if not exists eventos_data_inicio_idx on public.eventos (data_inicio);
create index if not exists eventos_status_idx on public.eventos (status);
