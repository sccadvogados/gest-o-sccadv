ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS objeto text,
  ADD COLUMN IF NOT EXISTS gratuidade boolean NOT NULL DEFAULT false;
