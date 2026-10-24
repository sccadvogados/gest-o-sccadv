ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS etapa text NOT NULL DEFAULT 'cliente',
  ADD COLUMN IF NOT EXISTS aguardando_desde date,
  ADD COLUMN IF NOT EXISTS assinado_em timestamptz;
