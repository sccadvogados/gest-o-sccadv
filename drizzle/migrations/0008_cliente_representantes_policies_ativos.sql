drop policy if exists "Representantes podem ser alterados por administradores" on public.cliente_representantes;
drop policy if exists "Representantes podem ser excluídos por administradores" on public.cliente_representantes;

create policy "Representantes podem ser alterados por usuários ativos"
  on public.cliente_representantes for update
  using (public.is_ativo())
  with check (public.is_ativo());

create policy "Representantes podem ser excluídos por usuários ativos"
  on public.cliente_representantes for delete
  using (public.is_ativo());