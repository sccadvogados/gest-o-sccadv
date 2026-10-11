alter table public.eventos drop constraint if exists eventos_tipo_check;
alter table public.eventos add constraint eventos_tipo_check check (tipo in ('prazo', 'audiencia', 'reuniao', 'compromisso', 'julgamento', 'acompanhamento'));
