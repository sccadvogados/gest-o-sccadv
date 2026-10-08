DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evento_tipo') THEN
    CREATE TYPE public.evento_tipo AS ENUM ('prazo', 'audiencia', 'reuniao', 'compromisso');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evento_responsavel') THEN
    CREATE TYPE public.evento_responsavel AS ENUM ('TAC', 'RCMT', 'ASS', 'Escritório');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'evento_status') THEN
    CREATE TYPE public.evento_status AS ENUM ('pendente', 'cumprido', 'cancelado');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.evento_tipo NOT NULL,
  titulo text NOT NULL,
  descricao text,
  cliente_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  contrato_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  numero_processo text,
  orgao_vara text,
  data_inicio timestamptz NOT NULL,
  data_fim timestamptz,
  dia_inteiro boolean NOT NULL DEFAULT false,
  local_ou_link text,
  responsavel public.evento_responsavel NOT NULL,
  status public.evento_status NOT NULL DEFAULT 'pendente',
  prazo_fatal date,
  prazo_interno date,
  google_event_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eventos_numero_processo_cnj CHECK (
    numero_processo IS NULL OR numero_processo ~ '^[0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4}$'
  )
);

ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eventos_all_authenticated" ON public.eventos
FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS eventos_data_inicio_idx ON public.eventos (data_inicio);
CREATE INDEX IF NOT EXISTS eventos_cliente_idx ON public.eventos (cliente_id);
CREATE INDEX IF NOT EXISTS eventos_status_idx ON public.eventos (status);

CREATE TRIGGER eventos_updated_at
BEFORE UPDATE ON public.eventos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();