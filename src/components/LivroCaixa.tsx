import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CurrencyInput } from "@/components/CurrencyInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, todayISO } from "@/lib/format";

// Tabela nova (lancamentos) ainda não está nos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

const CATEGORIAS_ENTRADA = [
  "(R) Pró-labore",
  "(R) Honorários de Êxito",
  "(R) Honorários de Sucumbência",
  "(R) Diligência",
  "(R) Outras Receitas",
] as const;
const CATEGORIAS_SAIDA = [
  "(D) Distribuição de Honorários",
  "(D) Captação/Parceria",
  "(D) Serviços",
  "(D) Emissão de Nota Fiscal",
  "(D) Impostos",
  "(D) Outras Despesas",
] as const;
const SOCIOS = ["TAC", "RCMT", "ASS"] as const;
const CORES_SOCIO: Record<string, string> = { TAC: "#0F2340", RCMT: "#C08A5E", ASS: "#7D8BA0" };
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type Lancamento = {
  id: string;
  data: string;
  descricao: string;
  tipo: "entrada" | "saida";
  categoria: string;
  valor: number;
  cliente_id: string | null;
  contrato_id: string | null;
  parcela_id: string | null;
  socio: string | null;
  observacao: string | null;
  revisar: boolean;
  origem: "manual" | "parcela" | "importacao" | "saldo_inicial";
  created_at: string;
  clients: { id: string; name: string } | null;
  contracts: { numero: number | null; ano: number | null } | null;
};

type Form = {
  id?: string;
  data: string;
  tipo: "entrada" | "saida";
  categoria: string;
  descricao: string;
  valor: number;
  socio: string;
  cliente_id: string;
  observacao: string;
  revisar: boolean;
};

const FORM_VAZIO: Form = {
  data: todayISO(),
  tipo: "saida",
  categoria: "(D) Serviços",
  descricao: "",
  valor: 0,
  socio: "",
  cliente_id: "",
  observacao: "",
  revisar: false,
};

function assinado(item: Lancamento) {
  return item.tipo === "entrada" ? Number(item.valor) : -Number(item.valor);
}

function numeroContrato(contrato: Lancamento["contracts"]) {
  return contrato?.numero != null && contrato.ano != null ? `${String(contrato.numero).padStart(3, "0")}/${contrato.ano}` : "";
}

export function LivroCaixa() {
  const queryClient = useQueryClient();
  const hoje = todayISO();
  const anoAtual = Number(hoje.slice(0, 4));
  const [periodo, setPeriodo] = useState(hoje.slice(0, 7)); // "AAAA-MM" ou "AAAA"
  const [tipo, setTipo] = useState("todos");
  const [categoria, setCategoria] = useState("todas");
  const [socio, setSocio] = useState("todos");
  const [form, setForm] = useState<Form | null>(null);

  const { data: lancamentos, isLoading } = useQuery({
    queryKey: ["lancamentos"],
    queryFn: async () => {
      const { data, error } = await db
        .from("lancamentos")
        .select("*, clients(id, name), contracts(numero, ano)")
        .order("data")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Lancamento[];
    },
  });

  const { data: clientes } = useQuery({
    queryKey: ["clients-lista-caixa"],
    enabled: form !== null,
    queryFn: async () => {
      const { data, error } = await db.from("clients").select("id, name").eq("rascunho", false).order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  // Período: mês ("2026-08") ou ano inteiro ("2026").
  const inicio = periodo.length === 4 ? `${periodo}-01-01` : `${periodo}-01`;
  const fim = periodo.length === 4 ? `${periodo}-12-31` : `${periodo}-31`;
  const todos = lancamentos ?? [];
  const saldoInicial = todos
    .filter((item) => item.data < inicio || (item.origem === "saldo_inicial" && item.data <= fim))
    .reduce((soma, item) => soma + assinado(item), 0);
  const doPeriodo = todos.filter((item) => item.origem !== "saldo_inicial" && item.data >= inicio && item.data <= fim);
  const entradas = doPeriodo.filter((item) => item.tipo === "entrada").reduce((soma, item) => soma + Number(item.valor), 0);
  const saidas = doPeriodo.filter((item) => item.tipo === "saida").reduce((soma, item) => soma + Number(item.valor), 0);
  const saldoFinal = saldoInicial + entradas - saidas;

  // Saldo corrido é sempre calculado sobre o período inteiro; os filtros só escondem linhas.
  let corrente = saldoInicial;
  const linhas = doPeriodo.map((item) => {
    corrente += assinado(item);
    return { item, saldo: corrente };
  });
  const visiveis = linhas.filter(({ item }) =>
    (tipo === "todos" || item.tipo === tipo) &&
    (categoria === "todas" || item.categoria === categoria) &&
    (socio === "todos" || item.socio === socio),
  );
  const filtrado = tipo !== "todos" || categoria !== "todas" || socio !== "todos";

  const porSocio = SOCIOS.map((sigla) => ({
    sigla,
    valor: doPeriodo
      .filter((item) => item.tipo === "saida" && item.categoria === "(D) Distribuição de Honorários" && item.socio === sigla)
      .reduce((soma, item) => soma + Number(item.valor), 0),
  }));
  const porCategoria = [...new Set(doPeriodo.map((item) => item.categoria))]
    .map((nome) => ({
      nome,
      valor: doPeriodo.filter((item) => item.categoria === nome).reduce((soma, item) => soma + Number(item.valor), 0),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const paraRevisar = todos.filter((item) => item.revisar).length;

  const salvar = useMutation({
    mutationFn: async (dados: Form) => {
      if (!dados.data) throw new Error("Informe a data.");
      if (dados.data < "2026-01-01") throw new Error("O caixa começa em 01/01/2026.");
      if (!dados.descricao.trim()) throw new Error("Informe a descrição.");
      if (!(dados.valor > 0)) throw new Error("Informe um valor maior que zero.");
      if (dados.categoria === "(D) Distribuição de Honorários" && !dados.socio) throw new Error("Escolha o sócio da distribuição.");
      const registro = {
        data: dados.data,
        tipo: dados.tipo,
        categoria: dados.categoria,
        descricao: dados.descricao.trim(),
        valor: dados.valor,
        socio: dados.categoria === "(D) Distribuição de Honorários" ? dados.socio : null,
        cliente_id: dados.cliente_id || null,
        observacao: dados.observacao.trim() || null,
        revisar: dados.revisar,
        updated_at: new Date().toISOString(),
      };
      const { error } = dados.id
        ? await db.from("lancamentos").update(registro).eq("id", dados.id)
        : await db.from("lancamentos").insert({ ...registro, origem: "manual" });
      if (error) throw error;
    },
    onSuccess: (_, dados) => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast.success(dados.id ? "Lançamento atualizado." : "Lançamento incluído.");
      setForm(null);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível salvar o lançamento."),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("lancamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast.success("Lançamento excluído.");
    },
    onError: () => toast.error("Não foi possível excluir o lançamento."),
  });

  function editar(item: Lancamento) {
    setForm({
      id: item.id,
      data: item.data,
      tipo: item.tipo,
      categoria: item.categoria,
      descricao: item.descricao,
      valor: Number(item.valor),
      socio: item.socio ?? "",
      cliente_id: item.cliente_id ?? "",
      observacao: item.observacao ?? "",
      revisar: item.revisar,
    });
  }

  const categoriasForm = form?.tipo === "entrada" ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;
  const nomePeriodo = periodo.length === 4 ? `Ano de ${periodo}` : `${MESES[Number(periodo.slice(5, 7)) - 1]}/${periodo.slice(0, 4)}`;
