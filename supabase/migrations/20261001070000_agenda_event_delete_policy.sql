alter table public.eventos enable row level security;

create policy "Authenticated users can delete eventos"
on public.eventos
for delete
to authenticated
using (true);
