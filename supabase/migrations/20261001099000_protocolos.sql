alter table public.eventos drop constraint if exists eventos_tipo_check;
alter table public.eventos add constraint eventos_tipo_check check (tipo in ('prazo', 'protocolo', 'audiencia', 'reuniao', 'compromisso', 'julgamento', 'acompanhamento'));

update public.eventos
set tipo = 'protocolo',
    titulo = ltrim(substr(titulo, length('[PROTOCOLO]') + 1))
where tipo = 'prazo'
  and titulo like '[PROTOCOLO]%';
