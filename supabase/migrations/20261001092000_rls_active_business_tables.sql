-- Substitui as políticas RLS das tabelas por regras que exigem usuário ativo.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('contracts', 'installments', 'eventos')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

create policy contracts_ativo_select
on public.contracts
for select
to authenticated
using (public.is_ativo());

create policy contracts_ativo_insert
on public.contracts
for insert
to authenticated
with check (public.is_ativo());

create policy contracts_ativo_update
on public.contracts
for update
to authenticated
using (public.is_ativo())
with check (public.is_ativo());

create policy contracts_ativo_delete
on public.contracts
for delete
to authenticated
using (public.is_ativo());

create policy installments_ativo_select
on public.installments
for select
to authenticated
using (public.is_ativo());

create policy installments_ativo_insert
on public.installments
for insert
to authenticated
with check (public.is_ativo());

create policy installments_ativo_update
on public.installments
for update
to authenticated
using (public.is_ativo())
with check (public.is_ativo());

create policy installments_ativo_delete
on public.installments
for delete
to authenticated
using (public.is_ativo());

create policy eventos_ativo_select
on public.eventos
for select
to authenticated
using (public.is_ativo());

create policy eventos_ativo_insert
on public.eventos
for insert
to authenticated
with check (public.is_ativo());

create policy eventos_ativo_update
on public.eventos
for update
to authenticated
using (public.is_ativo())
with check (public.is_ativo());

create policy eventos_ativo_delete
on public.eventos
for delete
to authenticated
using (public.is_ativo());
