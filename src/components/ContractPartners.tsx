import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, FileDown, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CurrencyInput } from "@/components/CurrencyInput";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { gerarSubstabelecimento } from "@/lib/substabelecimento.functions";

// Tabelas novas (parceiros, contrato_parceiros) ainda não estão nos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"] as const;

type Parceiro = { id: string; nome: string; oab_numero: string; oab_uf: string };
type ContratoParceiro = { id: string; valor: number; exito_percentual: number; parceiros: Parceiro | null };

function percentual(value: number) {
  return String(value).replace(".", ",");
}

function apenasDigitos(value: string) {
  return value.replace(/\D/g, "");
}

function baixarArquivo(fileName: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ContractPartners({
  contract,
}: {
  contract: { id: string; total_value: number; success_fee_percent: number; modality: string };
}) {
  const queryClient = useQueryClient();
  const gerarSubstabelecimentoFn = useServerFn(gerarSubstabelecimento);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<ContratoParceiro | null>(null);
  const [nome, setNome] = useState("");
  const [oabNumero, setOabNumero] = useState("");
  const [oabUf, setOabUf] = useState("DF");
  const [valor, setValor] = useState(0);
  const [exito, setExito] = useState("");

  const totalContrato = Number(contract.total_value) || 0;
  const exitoContrato = Number(contract.success_fee_percent) || 0;

  const { data: vinculos } = useQuery({
    queryKey: ["contract-partners", contract.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("contrato_parceiros")
        .select("id, valor, exito_percentual, parceiros(id, nome, oab_numero, oab_uf)")
        .eq("contrato_id", contract.id)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ContratoParceiro[];
    },
  });

  const { data: cadastrados } = useQuery({
    queryKey: ["parceiros"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.from("parceiros").select("id, nome, oab_numero, oab_uf").order("nome");
      if (error) throw error;
      return (data ?? []) as Parceiro[];
    },
  });

  const valorParceiros = (vinculos ?? []).reduce((soma, item) => soma + Number(item.valor || 0), 0);
  const exitoParceiros = (vinculos ?? []).reduce((soma, item) => soma + Number(item.exito_percentual || 0), 0);
  const valorDisponivel = Math.max(0, Math.round((totalContrato - valorParceiros) * 100) / 100);
  const exitoDisponivel = Math.max(0, Math.round((exitoContrato - exitoParceiros) * 100) / 100);

  // Na edição, o limite inclui o que este parceiro já tem.
  const valorMaximo = Math.round((valorDisponivel + Number(editando?.valor ?? 0)) * 100) / 100;
  const exitoMaximo = Math.round((exitoDisponivel + Number(editando?.exito_percentual ?? 0)) * 100) / 100;

  function abrir(item?: ContratoParceiro) {
    setEditando(item ?? null);
    setNome(item?.parceiros?.nome ?? "");
    setOabNumero(item?.parceiros?.oab_numero ?? "");
    setOabUf(item?.parceiros?.oab_uf ?? "DF");
    setValor(item ? Number(item.valor) || 0 : valorDisponivel);
    setExito(item ? percentual(Number(item.exito_percentual) || 0) : "0");
    setOpen(true);
  }

  // Preenche o nome a partir da OAB (e a OAB a partir do nome) usando o cadastro de parceiros.
  function buscarPorOab(numero: string, uf: string) {
    const encontrado = (cadastrados ?? []).find((p) => apenasDigitos(p.oab_numero) === apenasDigitos(numero) && p.oab_uf === uf);
    if (encontrado) setNome(encontrado.nome);
  }

  function buscarPorNome(valorNome: string) {
    const encontrado = (cadastrados ?? []).find((p) => p.nome.toLowerCase() === valorNome.trim().toLowerCase());
    if (encontrado) {
      setOabNumero(encontrado.oab_numero);
      setOabUf(encontrado.oab_uf);
    }
  }

  async function baixarSubstabelecimento(vinculoId: string) {
    setBaixando(vinculoId);
    try {
      const arquivo = await gerarSubstabelecimentoFn({ data: { vinculo_id: vinculoId } });
      baixarArquivo(arquivo.file_name, arquivo.base64);
      toast.success("Substabelecimento baixado. Complete o processo e o órgão (em amarelo) no Word.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o substabelecimento.");
    } finally {
      setBaixando(null);
    }
  }

  const salvar = useMutation({
    mutationFn: async () => {
      const nomeLimpo = nome.trim().replace(/\s+/g, " ");
      const numero = apenasDigitos(oabNumero);
      const exitoNumero = Number(exito.replace(",", ".")) || 0;
      if (!nomeLimpo) throw new Error("Informe o nome do advogado.");
      if (!numero) throw new Error("Informe o número da OAB.");
      if (valor < 0 || valor > valorMaximo + 0.005) {
        throw new Error(`O valor da parceria não pode passar de ${formatCurrency(valorMaximo)}.`);
      }
      if (exitoNumero < 0 || exitoNumero > exitoMaximo + 0.005) {
        throw new Error(`O êxito da parceria não pode passar de ${percentual(exitoMaximo)}%.`);
      }

      const { data: parceiro, error: parceiroError } = await db
        .from("parceiros")
        .upsert({ nome: nomeLimpo, oab_numero: numero, oab_uf: oabUf }, { onConflict: "oab_uf,oab_numero" })
        .select("id")
        .single();
      if (parceiroError) throw parceiroError;

      if (editando) {
        const { error: updateError } = await db
          .from("contrato_parceiros")
          .update({ parceiro_id: parceiro.id, valor, exito_percentual: exitoNumero })
          .eq("id", editando.id);
        if (updateError) {
          if (String(updateError.code) === "23505") throw new Error("Este parceiro já está neste contrato.");
          throw updateError;
        }
        return null;
      }

      const { data: vinculo, error } = await db
        .from("contrato_parceiros")
        .insert({
          contrato_id: contract.id,
          parceiro_id: parceiro.id,
          valor,
          exito_percentual: exitoNumero,
        })
        .select("id")
        .single();
      if (error) {
        if (String(error.code) === "23505") throw new Error("Este parceiro já está neste contrato.");
        throw error;
      }
      return vinculo.id as string;
    },
    onSuccess: (vinculoId) => {
      queryClient.invalidateQueries({ queryKey: ["contract-partners", contract.id] });
      queryClient.invalidateQueries({ queryKey: ["parceiros"] });
      toast.success(vinculoId ? "Parceiro adicionado." : "Parceiro atualizado.");
      setOpen(false);
      if (vinculoId) void baixarSubstabelecimento(vinculoId);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível adicionar o parceiro."),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("contrato_parceiros").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-partners", contract.id] });
      toast.success("Parceiro removido do contrato.");
    },
    onError: () => toast.error("Não foi possível remover o parceiro."),
  });

  const temParceiros = (vinculos ?? []).length > 0;

  return (
    <div className="border-b border-border px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[#0F2340]">Parceiros</p>
        <Button type="button" variant="outline" size="sm" onClick={() => abrir()}>
          <Plus className="size-4" />
          Adicionar Parceiro
        </Button>
      </div>

      {temParceiros ? (
        <div className="mt-2 space-y-1">
          {(vinculos ?? []).map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {item.parceiros?.nome ?? "Parceiro"}
                <span className="text-muted-foreground">{` · OAB/${item.parceiros?.oab_uf ?? ""} ${item.parceiros?.oab_numero ?? ""}`}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">
                  {`${formatCurrency(Number(item.valor) || 0)} + ${percentual(Number(item.exito_percentual) || 0)}% do êxito`}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Editar Parceiro"
                  title="Editar Parceiro"
                  onClick={() => abrir(item)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Baixar Substabelecimento"
                  title="Baixar Substabelecimento"
                  disabled={baixando === item.id}
                  onClick={() => void baixarSubstabelecimento(item.id)}
                >
                  <FileDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remover parceiro"
                  title="Remover parceiro"
                  disabled={remover.isPending}
                  onClick={() => remover.mutate(item.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </span>
            </div>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">
            {`Líquido do Escritório: ${formatCurrency(totalContrato - valorParceiros)}${exitoContrato > 0 ? ` + ${percentual(Math.round((exitoContrato - exitoParceiros) * 100) / 100)}% de êxito` : ""}`}
          </p>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Parceiro" : "Adicionar Parceiro"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`parceiro-nome-${contract.id}`}>Nome do Advogado</Label>
              <Input
                id={`parceiro-nome-${contract.id}`}
                list={`parceiros-lista-${contract.id}`}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onBlur={() => buscarPorNome(nome)}
              />
              <datalist id={`parceiros-lista-${contract.id}`}>
                {(cadastrados ?? []).map((p) => <option key={p.id} value={p.nome}>{`OAB/${p.oab_uf} ${p.oab_numero}`}</option>)}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`parceiro-oab-${contract.id}`}>Número da OAB</Label>
              <Input
                id={`parceiro-oab-${contract.id}`}
                inputMode="numeric"
                value={oabNumero}
                onChange={(e) => setOabNumero(e.target.value)}
                onBlur={() => buscarPorOab(oabNumero, oabUf)}
              />
              <a
                href="https://cna.oab.org.br/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-accent underline-offset-4 hover:underline"
              >
                <ExternalLink className="size-3" />
                Conferir no CNA da OAB
              </a>
            </div>
            <div className="space-y-2">
              <Label>UF</Label>
              <Select value={oabUf} onValueChange={(uf) => { setOabUf(uf); buscarPorOab(oabNumero, uf); }}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`parceiro-valor-${contract.id}`}>Valor da Parceria</Label>
              <CurrencyInput id={`parceiro-valor-${contract.id}`} value={valor} onChange={(v) => setValor(Math.min(v, valorMaximo))} />
              <p className="text-xs text-muted-foreground">{`Máximo: ${formatCurrency(valorMaximo)}`}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`parceiro-exito-${contract.id}`}>% do Êxito da Parceria</Label>
              <Input
                id={`parceiro-exito-${contract.id}`}
                inputMode="decimal"
                placeholder="0"
                value={exito}
                onChange={(e) => setExito(e.target.value)}
                disabled={exitoMaximo <= 0}
                className="w-28"
              />
              <p className="text-xs text-muted-foreground">{`Máximo: ${percentual(exitoMaximo)}%`}</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : editando ? "Salvar Alterações" : "Adicionar e Gerar Substabelecimento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

