create table if not exists public.clientes_vistos (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cliente_id uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, cliente_id)
);

alter table public.clientes_vistos enable row level security;

create policy clientes_vistos_select_own
on public.clientes_vistos
for select
to authenticated
using (user_id = auth.uid());

create policy clientes_vistos_insert_own
on public.clientes_vistos
for insert
to authenticated
with check (user_id = auth.uid());
