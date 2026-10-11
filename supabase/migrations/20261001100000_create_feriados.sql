create table if not exists public.feriados (
  data date primary key,
  descricao text not null,
  abrangencia text not null check (abrangencia in ('nacional', 'DF', 'outro'))
);

alter table public.feriados enable row level security;

create policy feriados_ativo_select
on public.feriados
for select
to authenticated
using (public.is_ativo());

create policy feriados_admin_insert
on public.feriados
for insert
to authenticated
with check (public.is_admin());

create policy feriados_admin_update
on public.feriados
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy feriados_admin_delete
on public.feriados
for delete
to authenticated
using (public.is_admin());

insert into public.feriados (data, descricao, abrangencia) values
  ('2026-01-01', 'Confraternização Universal', 'nacional'),
  ('2026-02-16', 'Carnaval - segunda-feira', 'nacional'),
  ('2026-02-17', 'Carnaval - terça-feira', 'nacional'),
  ('2026-04-03', 'Sexta-feira Santa', 'nacional'),
  ('2026-04-21', 'Tiradentes', 'nacional'),
  ('2026-05-01', 'Dia Mundial do Trabalho', 'nacional'),
  ('2026-06-04', 'Corpus Christi', 'nacional'),
  ('2026-09-07', 'Independência do Brasil', 'nacional'),
  ('2026-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  ('2026-11-02', 'Finados', 'nacional'),
  ('2026-11-15', 'Proclamação da República', 'nacional'),
  ('2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  ('2026-12-25', 'Natal', 'nacional'),
  ('2027-01-01', 'Confraternização Universal', 'nacional'),
  ('2027-02-08', 'Carnaval - segunda-feira', 'nacional'),
  ('2027-02-09', 'Carnaval - terça-feira', 'nacional'),
  ('2027-03-26', 'Sexta-feira Santa', 'nacional'),
  ('2027-04-21', 'Tiradentes', 'nacional'),
  ('2027-05-01', 'Dia Mundial do Trabalho', 'nacional'),
  ('2027-05-27', 'Corpus Christi', 'nacional'),
  ('2027-09-07', 'Independência do Brasil', 'nacional'),
  ('2027-10-12', 'Nossa Senhora Aparecida', 'nacional'),
  ('2027-11-02', 'Finados', 'nacional'),
  ('2027-11-15', 'Proclamação da República', 'nacional'),
  ('2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  ('2027-12-25', 'Natal', 'nacional')
 on conflict (data) do nothing;
