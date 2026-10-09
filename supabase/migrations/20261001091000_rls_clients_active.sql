-- Substitui as políticas atuais das tabelas por regras que exigem usuário ativo.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('clients', 'client_documents')
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

create policy clients_ativo_all
on public.clients
for all
to authenticated
using (public.is_ativo())
with check (public.is_ativo());

create policy client_documents_ativo_all
on public.client_documents
for all
to authenticated
using (public.is_ativo())
with check (public.is_ativo());
