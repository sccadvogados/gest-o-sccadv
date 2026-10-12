CREATE TABLE IF NOT EXISTS public.procuracao_exemplos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objeto text NOT NULL,
  tipo_cliente text NOT NULL CHECK (tipo_cliente IN ('PF', 'PJ')),
  uf_domicilio text,
  poderes_especificos text,
  destino text,
  situacao text NOT NULL CHECK (situacao IN ('ok', 'alerta', 'bloqueado')),
  observacao text,
  origem text NOT NULL CHECK (origem IN ('inicial', 'aprovado')),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

ALTER TABLE public.procuracao_exemplos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS procuracao_exemplos_ativo_select ON public.procuracao_exemplos;
CREATE POLICY procuracao_exemplos_ativo_select
ON public.procuracao_exemplos
FOR SELECT
TO authenticated
USING (public.is_ativo());

DROP POLICY IF EXISTS procuracao_exemplos_ativo_insert ON public.procuracao_exemplos;
CREATE POLICY procuracao_exemplos_ativo_insert
ON public.procuracao_exemplos
FOR INSERT
TO authenticated
WITH CHECK (public.is_ativo());

DROP POLICY IF EXISTS procuracao_exemplos_admin_update ON public.procuracao_exemplos;
CREATE POLICY procuracao_exemplos_admin_update
ON public.procuracao_exemplos
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS procuracao_exemplos_admin_delete ON public.procuracao_exemplos;
CREATE POLICY procuracao_exemplos_admin_delete
ON public.procuracao_exemplos
FOR DELETE
TO authenticated
USING (public.is_admin());

INSERT INTO public.procuracao_exemplos
  (objeto, tipo_cliente, uf_domicilio, poderes_especificos, destino, situacao, observacao, origem)
VALUES
  ('ao ajuizamento de ação de obrigação de fazer c/c indenização por danos morais em desfavor de Bradesco Saúde', 'PF', 'DF', ', especialmente para propor ação de obrigação de fazer c/c indenização por danos morais em face de Bradesco Saúde', 'o Tribunal de Justiça do Distrito Federal e dos Territórios', 'ok', 'tribunal inferido pelo domicílio.', 'inicial'),
  ('ao ajuizamento de ação de obrigação de fazer com pedido de tutela de urgência em face da operadora de plano de saúde AMIL', 'PF', 'DF', ', especialmente para propor ação de obrigação de fazer com pedido de tutela de urgência em face de AMIL', 'o Tribunal de Justiça do Distrito Federal e dos Territórios', 'ok', 'tribunal inferido pelo domicílio.', 'inicial'),
  ('à proposição de ação de obrigação de fazer c/c danos morais e pedido liminar perante o Tribunal de Justiça do Distrito Federal e dos Territórios', 'PF', 'DF', ', especialmente para propor ação de obrigação de fazer c/c indenização por danos morais, com pedido liminar', 'o Tribunal de Justiça do Distrito Federal e dos Territórios', 'alerta', 'parte contrária não identificada.', 'inicial'),
  ('à execução do contrato de honorários advocatícios firmado com advogado, bem como ao ajuizamento de ação de obrigação de fazer com pedido de tutela de urgência em face da operadora de plano de saúde MEDSENIOR', 'PF', 'RJ', ', especialmente para promover a execução do contrato de honorários advocatícios e propor ação de obrigação de fazer com pedido de tutela de urgência em face de MedSênior', 'o Tribunal de Justiça do Estado do Rio de Janeiro e o Tribunal de Justiça do Distrito Federal e dos Territórios', 'alerta', 'duas finalidades; TJRJ pelo domicílio do cliente.', 'inicial'),
  ('à proposição de ação judicial em face da Amil Assistência Médica Internacional S.A., por cobrança de multa por rescisão contratual', 'PJ', 'DF', ', especialmente para propor ação judicial em face de Amil Assistência Médica Internacional S.A. relativa à cobrança de multa por rescisão contratual', 'o Tribunal de Justiça do Distrito Federal e dos Territórios', 'ok', 'tipo de ação não informado; redação neutra; tribunal pela sede.', 'inicial'),
  ('à proposição de ação judicial em face da Porto Seguro Saúde, por cobrança de multa por rescisão contratual', 'PJ', 'DF', ', especialmente para propor ação judicial em face de Porto Seguro Saúde relativa à cobrança de multa por rescisão contratual', 'o Tribunal de Justiça do Distrito Federal e dos Territórios', 'ok', 'redação neutra; tribunal pela sede.', 'inicial'),
  ('à proposição de ação judicial perante o Tribunal de Justiça do Distrito Federal e dos Territórios', 'PF', 'DF', NULL, NULL, 'bloqueado', 'objeto sem assunto e sem parte contrária.', 'inicial');