CREATE TABLE IF NOT EXISTS public.captadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  documento text NOT NULL UNIQUE
);

ALTER TABLE public.captadores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'captadores'
      AND policyname = 'captadores_ativo_select'
  ) THEN
    CREATE POLICY captadores_ativo_select
      ON public.captadores
      FOR SELECT
      TO authenticated
      USING (public.is_ativo());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'captadores'
      AND policyname = 'captadores_ativo_insert'
  ) THEN
    CREATE POLICY captadores_ativo_insert
      ON public.captadores
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_ativo());
  END IF;
END
$$;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS captador_id uuid REFERENCES public.captadores(id);

NOTIFY pgrst, 'reload schema';
