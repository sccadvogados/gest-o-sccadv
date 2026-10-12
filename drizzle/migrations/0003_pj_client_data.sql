alter table public.clients
  add column if not exists pj_descricao text not null default 'pessoa jurídica de direito privado';