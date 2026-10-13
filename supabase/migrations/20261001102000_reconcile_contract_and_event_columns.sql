alter table public.contracts add column if not exists numero integer;
alter table public.contracts add column if not exists ano integer;

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

alter table public.eventos add column if not exists parte_contraria text;

notify pgrst, 'reload schema';
