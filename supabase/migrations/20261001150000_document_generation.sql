ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE;
