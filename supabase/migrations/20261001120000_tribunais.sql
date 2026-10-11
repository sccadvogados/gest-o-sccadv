CREATE TABLE IF NOT EXISTS public.tribunais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sigla text NOT NULL UNIQUE,
  nome_oficial text NOT NULL,
  uf text,
  segmento_cnj text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true
);

ALTER TABLE public.tribunais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tribunais_ativo_select ON public.tribunais;
CREATE POLICY tribunais_ativo_select
ON public.tribunais
FOR SELECT
TO authenticated
USING (public.is_ativo());

DROP POLICY IF EXISTS tribunais_admin_insert ON public.tribunais;
CREATE POLICY tribunais_admin_insert
ON public.tribunais
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS tribunais_admin_update ON public.tribunais;
CREATE POLICY tribunais_admin_update
ON public.tribunais
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS tribunais_admin_delete ON public.tribunais;
CREATE POLICY tribunais_admin_delete
ON public.tribunais
FOR DELETE
TO authenticated
USING (public.is_admin());

INSERT INTO public.tribunais (sigla, nome_oficial, uf, segmento_cnj)
VALUES
  ('TJAC', 'o Tribunal de Justiça do Estado do Acre', 'AC', '8.01'),
  ('TJAL', 'o Tribunal de Justiça do Estado de Alagoas', 'AL', '8.02'),
  ('TJAP', 'o Tribunal de Justiça do Estado do Amapá', 'AP', '8.03'),
  ('TJAM', 'o Tribunal de Justiça do Estado do Amazonas', 'AM', '8.04'),
  ('TJBA', 'o Tribunal de Justiça do Estado da Bahia', 'BA', '8.05'),
  ('TJCE', 'o Tribunal de Justiça do Estado do Ceará', 'CE', '8.06'),
  ('TJDFT', 'o Tribunal de Justiça do Distrito Federal e dos Territórios', 'DF', '8.07'),
  ('TJES', 'o Tribunal de Justiça do Estado do Espírito Santo', 'ES', '8.08'),
  ('TJGO', 'o Tribunal de Justiça do Estado de Goiás', 'GO', '8.09'),
  ('TJMA', 'o Tribunal de Justiça do Estado do Maranhão', 'MA', '8.10'),
  ('TJMT', 'o Tribunal de Justiça do Estado de Mato Grosso', 'MT', '8.11'),
  ('TJMS', 'o Tribunal de Justiça do Estado de Mato Grosso do Sul', 'MS', '8.12'),
  ('TJMG', 'o Tribunal de Justiça do Estado de Minas Gerais', 'MG', '8.13'),
  ('TJPA', 'o Tribunal de Justiça do Estado do Pará', 'PA', '8.14'),
  ('TJPB', 'o Tribunal de Justiça do Estado da Paraíba', 'PB', '8.15'),
  ('TJPR', 'o Tribunal de Justiça do Estado do Paraná', 'PR', '8.16'),
  ('TJPE', 'o Tribunal de Justiça do Estado de Pernambuco', 'PE', '8.17'),
  ('TJPI', 'o Tribunal de Justiça do Estado do Piauí', 'PI', '8.18'),
  ('TJRJ', 'o Tribunal de Justiça do Estado do Rio de Janeiro', 'RJ', '8.19'),
  ('TJRN', 'o Tribunal de Justiça do Estado do Rio Grande do Norte', 'RN', '8.20'),
  ('TJRS', 'o Tribunal de Justiça do Estado do Rio Grande do Sul', 'RS', '8.21'),
  ('TJRO', 'o Tribunal de Justiça do Estado de Rondônia', 'RO', '8.22'),
  ('TJRR', 'o Tribunal de Justiça do Estado de Roraima', 'RR', '8.23'),
  ('TJSC', 'o Tribunal de Justiça do Estado de Santa Catarina', 'SC', '8.24'),
  ('TJSE', 'o Tribunal de Justiça do Estado de Sergipe', 'SE', '8.25'),
  ('TJSP', 'o Tribunal de Justiça do Estado de São Paulo', 'SP', '8.26'),
  ('TJTO', 'o Tribunal de Justiça do Estado do Tocantins', 'TO', '8.27'),
  ('TRF1', 'o Tribunal Regional Federal da 1ª Região', NULL, '4.01'),
  ('TRF2', 'o Tribunal Regional Federal da 2ª Região', NULL, '4.02'),
  ('TRF3', 'o Tribunal Regional Federal da 3ª Região', NULL, '4.03'),
  ('TRF4', 'o Tribunal Regional Federal da 4ª Região', NULL, '4.04'),
  ('TRF5', 'o Tribunal Regional Federal da 5ª Região', NULL, '4.05'),
  ('TRF6', 'o Tribunal Regional Federal da 6ª Região', NULL, '4.06')
ON CONFLICT (sigla) DO UPDATE SET
  nome_oficial = EXCLUDED.nome_oficial,
  uf = EXCLUDED.uf,
  segmento_cnj = EXCLUDED.segmento_cnj,
  ativo = true;
