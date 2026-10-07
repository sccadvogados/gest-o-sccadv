create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  papel text not null check (papel in ('admin', 'usuario')),
  ativo boolean not null default false
);

alter table public.perfis enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfis
    where id = auth.uid()
      and papel = 'admin'
      and ativo = true
  );
$$;

create policy "Usuários podem ler o próprio perfil"
on public.perfis
for select
to authenticated
using (id = auth.uid());

create policy "Admins podem alterar perfis"
on public.perfis
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
