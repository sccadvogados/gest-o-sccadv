-- Permissões do bucket privado de modelos.
-- A leitura é permitida somente a usuários ativos.
drop policy if exists modelos_storage_select on storage.objects;
create policy modelos_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'modelos'
  and public.is_ativo()
);

-- O envio de arquivos novos é permitido somente a administradores.
drop policy if exists modelos_storage_insert on storage.objects;
create policy modelos_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'modelos'
  and public.is_admin()
);

-- A substituição de arquivos existentes é permitida somente a administradores.
drop policy if exists modelos_storage_update on storage.objects;
create policy modelos_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'modelos'
  and public.is_admin()
)
with check (
  bucket_id = 'modelos'
  and public.is_admin()
);

-- A exclusão de arquivos é permitida somente a administradores.
drop policy if exists modelos_storage_delete on storage.objects;
create policy modelos_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'modelos'
  and public.is_admin()
);