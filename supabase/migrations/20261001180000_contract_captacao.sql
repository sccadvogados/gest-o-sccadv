alter table public.contracts add column if not exists captacao text;
alter table public.contracts add column if not exists captacao_percentual numeric(5,2);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contracts_captacao_check') then
    alter table public.contracts add constraint contracts_captacao_check
      check (captacao in ('Tráfego Pago','Indicação','Parceria','Prospecção Ativa','Cliente Recorrente'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contracts_captacao_percentual_check') then
    alter table public.contracts add constraint contracts_captacao_percentual_check
      check (captacao_percentual is null or (captacao_percentual > 0 and captacao_percentual <= 100));
  end if;
end $$;
notify pgrst, 'reload schema';
