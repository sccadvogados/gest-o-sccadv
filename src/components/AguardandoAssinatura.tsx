import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, FileSignature } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, todayISO } from "@/lib/format";

// Colunas novas (etapa, aguardando_desde) ainda não estão nos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (tabela: string) => any };

type Aguardando = {
  id: string;
  name: string;
  aguardando_desde: string | null;
  created_at: string;
  contracts: Array<{ numero: number | null; ano: number | null; rascunho: boolean | null }> | null;
};

/** Dias corridos desde a criação da pasta do cliente até hoje (horário de Brasília). */
function diasDesde(iso: string) {
  const inicio = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const ms = new Date(`${todayISO()}T12:00:00Z`).getTime() - new Date(`${inicio}T12:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Início: quem ainda não assinou o contrato. Só vira cliente (aba Clientes e Financeiro) depois de "Assinado". */
export function AguardandoAssinatura() {
  const queryClient = useQueryClient();

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ["aguardando-assinatura"],
    queryFn: async () => {
      const { data, error } = await db
        .from("clients")
        .select("id, name, aguardando_desde, created_at, contracts(numero, ano, rascunho)")
        .eq("etapa", "aguardando")
        .eq("rascunho", false)
        .order("aguardando_desde", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Aguardando[];
    },
  });

  const mudar = useMutation({
    mutationFn: async ({ id, etapa }: { id: string; etapa: "cliente" | "nao_fechou" }) => {
      const { error } = await db
        .from("clients")
        .update(etapa === "cliente" ? { etapa, assinado_em: new Date().toISOString() } : { etapa })
        .eq("id", id);
      if (error) throw error;
      if (etapa === "nao_fechou") {
        const { error: erroParcelas } = await db.from("installments").update({ status: "Cancelado" }).eq("client_id", id).neq("status", "Pago");
        if (erroParcelas) throw erroParcelas;
      }
    },
    onSuccess: (_, { etapa }) => {
      for (const chave of [["aguardando-assinatura"], ["clients"], ["installments"], ["inicio-parcelas"], ["contract-counts"]]) {
        void queryClient.invalidateQueries({ queryKey: chave });
      }
      toast.success(etapa === "cliente" ? "Contrato assinado: agora é cliente." : "Registrado como não fechado.");
    },
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Não foi possível atualizar."),
  });

  if (isLoading || lista.length === 0) return null;

  return (
    <section className="panel overflow-hidden rounded-xl border border-[#F0D58A] border-t-[3px] border-t-[#E0B43C] bg-[#FFFCF3]">
      <div className="flex items-center gap-2 p-5 pb-3">
        <FileSignature className="size-4 text-[#8A5A00]" />
        <h2 className="text-base font-semibold text-[#0F2340]">{`Aguardando Assinatura (${lista.length})`}</h2>
      </div>
      <ul className="divide-y divide-[#F3E6C2] px-5 pb-3">
        {lista.map((item) => {
          const desde = item.aguardando_desde ?? item.created_at;
          const dias = diasDesde(desde);
          const contrato = (item.contracts ?? []).find((c) => !c.rascunho && c.numero != null);
          return (
            <li key={item.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <Link to="/clientes/$clientId" params={{ clientId: item.id }} className="font-semibold text-[#0F2340] underline-offset-4 hover:underline">
                  {item.name}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${dias > 3 ? "bg-[#FBE9E7] text-[#B42318]" : "bg-[#FFF4DB] text-[#8A5A00]"}`}
                  >
                    {dias === 0 ? "Aguardando desde hoje" : `Aguardando há ${dias} dia${dias > 1 ? "s" : ""}`}
                  </span>
                  <span>{`Pasta criada em ${formatDate(desde)}`}</span>
                  {contrato ? <span>{`· Contrato ${String(contrato.numero).padStart(3, "0")}/${contrato.ano}`}</span> : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 md:flex md:shrink-0">
                <Button size="sm" disabled={mudar.isPending} onClick={() => mudar.mutate({ id: item.id, etapa: "cliente" })}>
                  <Check className="size-4" /> Assinado
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={mudar.isPending}
                  onClick={() => {
                    if (window.confirm(`${item.name} não assinou? As parcelas em aberto serão canceladas (nada é apagado).`)) mudar.mutate({ id: item.id, etapa: "nao_fechou" });
                  }}
                >
                  Não Assinou
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
