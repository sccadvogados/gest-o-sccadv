alter table public.contracts add column if not exists numero integer;
alter table public.contracts add column if not exists ano integer;

-- Backfill: numeração sequencial dentro do ano de criação de cada contrato.
with ordered as (
  select id,
         row_number() over (partition by extract(year from created_at)::int order by created_at, id) as rn,
         extract(year from created_at)::int as yr
  from public.contracts
)
update public.contracts c
set numero = o.rn,
    ano = o.yr
from ordered o
where c.id = o.id
  and (c.numero is null or c.ano is null);

create unique index if not exists contracts_ano_numero_unique
  on public.contracts (ano, numero)
  where numero is not null;

-- Atribui número/ano automaticamente na criação, quando não informados.
create or replace function public.assign_contract_numero()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.ano is null then
    new.ano := extract(year from now())::int;
  end if;
  if new.numero is null then
    select coalesce(max(numero), 0) + 1 into new.numero
    from public.contracts
    where ano = new.ano;
  end if;
  return new;
end;
$$;

drop trigger if exists contracts_assign_numero on public.contracts;
create trigger contracts_assign_numero
before insert on public.contracts
for each row
when (new.numero is null or new.ano is null)
execute function public.assign_contract_numero();

-- Próximo número previsto no formato 'NNN/AAAA' (visão de rascunho).
create or replace function public.proximo_numero_contrato()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case when public.is_ativo() then
    lpad((coalesce(max(numero), 0) + 1)::text, 3, '0') || '/' || extract(year from now())::int::text
  end
  from public.contracts
  where ano = extract(year from now())::int;
$$;

notify pgrst, 'reload schema';