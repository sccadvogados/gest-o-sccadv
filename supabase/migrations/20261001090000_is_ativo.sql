create or replace function public.is_ativo()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfis
    where id = auth.uid()
      and ativo = true
  );
$$;
