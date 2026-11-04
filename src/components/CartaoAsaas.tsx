import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/** Ficha do cliente: cobrança no cartão pelo Asaas (link para o WhatsApp).
 * Link e baixa automática rodam no Supabase (Edge Functions asaas-link e asaas-webhook). */
export function CartaoAsaas({ clientId, contractId, linkUrl }: { clientId: string; contractId: string; linkUrl: string | null | undefined }) {
  const queryClient = useQueryClient();
  const atualizar = () => {
    void queryClient.invalidateQueries({ queryKey: ["contracts", clientId] });
    void queryClient.invalidateQueries({ queryKey: ["installments"] });
  };
  const copiar = (url: string) =>
    void navigator.clipboard.writeText(url).then(
      () => toast.success("Link copiado.", { description: "Cole no WhatsApp do cliente." }),
      () => toast.error("Não foi possível copiar."),
    );

  const gerar = useMutation({
    // Edge Function do Supabase (asaas-link): a chave do Asaas fica só no Supabase
    mutationFn: async () => {
            const { data, error } = await supabase.functions.invoke<{ url?: string; erro?: string }>("asaas-link", { body: { contractId } });
      if (error || !data?.url) {
        // Mostra o motivo devolvido pela função (ex.: recusa do Asaas)
        const contexto = (error as { context?: Response } | null)?.context;
        const detalhe = contexto ? await contexto.clone().json().then((corpo: { erro?: string }) => corpo.erro).catch(() => `Erro ${contexto.status}`) : undefined;
        throw new Error(data?.erro ?? detalhe ?? "Não foi possível gerar o link no Asaas.");
      }
      return { url: data.url };
    },
    onSuccess: ({ url }) => {
      atualizar();
      copiar(url);
    },
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Não foi possível gerar o link."),
  });

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {linkUrl ? (
        <Button size="sm" variant="outline" onClick={() => copiar(linkUrl)}>
          <Copy className="size-4" />Copiar para o WhatsApp
        </Button>
      ) : (
        <Button size="sm" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
          <Link2 className="size-4" />{gerar.isPending ? "Gerando…" : "Gerar Link de Pagamento"}
        </Button>
      )}
    </div>
  );
}
