ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS modality text NOT NULL DEFAULT 'parcelado',
  ADD COLUMN IF NOT EXISTS signature_date date;

ALTER TABLE public.contracts
  DROP CONSTRAINT IF EXISTS contracts_modality_check;

ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_modality_check
  CHECK (modality IN ('parcelado', 'mensal', 'exito'));