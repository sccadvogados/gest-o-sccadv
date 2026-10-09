create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, email, papel, ativo)
  values (
    new.id,
    split_part(coalesce(new.email, new.id::text), '@', 1),
    coalesce(new.email, new.id::text),
    'usuario',
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

insert into public.perfis (id, nome, email, papel, ativo)
select
  u.id,
  split_part(coalesce(u.email, u.id::text), '@', 1),
  coalesce(u.email, u.id::text),
  'usuario',
  true
from auth.users u
on conflict (id) do update set
  nome = excluded.nome,
  email = excluded.email,
  papel = 'usuario',
  ativo = true;

update public.perfis
set papel = 'admin', ativo = true
where email in (
  'tcraveiro@sccadvocacia.com.br',
  'rcorradi@sccadvocacia.com.br'
);

select nome, email, papel, ativo
from public.perfis
order by email;