create table if not exists public.cliente_representantes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clients(id) on delete cascade,
  nome text not null,
  nacionalidade text,
  estado_civil text,
  profissao text,
  cpf text,
  qualidade text not null check (qualidade in ('representante legal', 'sócio')),
  ordem integer not null default 0
);

alter table public.cliente_representantes enable row level security;

create policy "Representantes podem ser lidos por usuários ativos"
  on public.cliente_representantes for select
  using (public.is_ativo());

create policy "Representantes podem ser inseridos por usuários ativos"
  on public.cliente_representantes for insert
  with check (public.is_ativo());

create policy "Representantes podem ser alterados por administradores"
  on public.cliente_representantes for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "Representantes podem ser excluídos por administradores"
  on public.cliente_representantes for delete
  using (public.is_admin());