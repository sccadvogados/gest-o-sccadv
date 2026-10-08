insert into public.perfis (id, nome, email, papel, ativo)
select id, 'TCRaveiro', 'tcraveiro@sccadvocacia.com.br', 'admin', true
from auth.users
where email = 'tcraveiro@sccadvocacia.com.br'
on conflict (id) do update set
  nome = excluded.nome,
  email = excluded.email,
  papel = excluded.papel,
  ativo = excluded.ativo;

insert into public.perfis (id, nome, email, papel, ativo)
select id, 'RCorradi', 'rcorradi@sccadvocacia.com.br', 'usuario', true
from auth.users
where email = 'rcorradi@sccadvocacia.com.br'
on conflict (id) do update set
  nome = excluded.nome,
  email = excluded.email,
  papel = excluded.papel,
  ativo = excluded.ativo;