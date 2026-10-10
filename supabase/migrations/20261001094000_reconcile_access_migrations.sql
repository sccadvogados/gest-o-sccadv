-- Consolida as migrações de acesso para evitar gatilhos e políticas conflitantes.

-- Mantém apenas o gatilho que cria perfis em public.perfis.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- Permite que usuários autenticados consultem o próprio perfil e que
-- administradores consultem os perfis necessários ao gerenciamento de acesso.
drop policy if exists "Usuários podem ler o próprio perfil" on public.perfis;
drop policy if exists perfis_select_self_or_admin on public.perfis;

create policy perfis_select_self_or_admin
on public.perfis
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
);

-- A atualização de perfis continua restrita a administradores.
drop policy if exists "Admins podem alterar perfis" on public.perfis;
drop policy if exists perfis_update_admin on public.perfis;

create policy perfis_update_admin
on public.perfis
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Garante as permissões explícitas usadas pelas funções e pela aplicação.
grant select, update on public.perfis to authenticated;
grant execute on function public.is_ativo() to authenticated;
grant execute on function public.is_admin() to authenticated;
