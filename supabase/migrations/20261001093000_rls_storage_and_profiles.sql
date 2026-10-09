-- Restringe o bucket client-documents a usuários ativos.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') like '%client-documents%'
        or coalesce(with_check, '') like '%client-documents%'
      )
  loop
    execute format(
      'drop policy if exists %I on storage.objects',
      policy_record.policyname
    );
  end loop;
end
$$;

create policy client_documents_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'client-documents'
  and public.is_ativo()
);

create policy client_documents_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'client-documents'
  and public.is_ativo()
);

create policy client_documents_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'client-documents'
  and public.is_ativo()
)
with check (
  bucket_id = 'client-documents'
  and public.is_ativo()
);

create policy client_documents_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'client-documents'
  and public.is_ativo()
);

-- Permite ler o próprio perfil ou qualquer perfil para administradores.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'SELECT'
  loop
    execute format(
      'drop policy if exists %I on public.profiles',
      policy_record.policyname
    );
  end loop;
end
$$;

create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
);
