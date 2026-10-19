import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, ChevronRight, CornerUpLeft, ExternalLink, Folder, FolderPlus, MoreHorizontal, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { MoverDialog, NomeDialog } from "@/components/ArquivosDialogs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { abrirArquivo, alterarItem, criarPastaCliente, enviarParaPasta, listarPasta, novaPasta } from "@/lib/arquivos.functions";

type Item = { id: string; nome: string; mime: string; pasta: boolean; tamanho: number | null; modificado: string | null; link: string | null };

const LIMITE = 20 * 1024 * 1024;
const TRIBUNAIS: Record<string, string> = { "8.07": "TJDFT", "8.09": "TJGO", "8.17": "TJPE", "8.13": "TJMG", "8.26": "TJSP", "5.01": "TRT-1", "5.10": "TRT-10", "4.01": "TRF-1" };

/** Pasta de contrato "NNN-AAAA_processo" vira etiqueta "Contrato NNN/AAAA · Tribunal". */
function etiquetaContrato(nome: string) {
  const m = /^(\d{3})-(\d{4})(?:_(\S+))?/.exec(nome);
  if (!m) return null;
  const tribunal = m[3] ? /\.\d{4}\.(\d\.\d{2})\./.exec(m[3])?.[1] : undefined;
  return `Contrato ${m[1]}/${m[2]}${tribunal && TRIBUNAIS[tribunal] ? ` · ${TRIBUNAIS[tribunal]}` : ""}`;
}

function icone(item: Item) {
  if (item.pasta) return { texto: "", classe: "bg-[#FBF1EA] text-[#B07A4F]" };
  if (item.mime === "application/pdf") return { texto: "PDF", classe: "bg-[#FBE9E7] text-[#B42318]" };
  if (item.mime.startsWith("image/")) return { texto: "IMG", classe: "bg-[#E7F2EA] text-[#256b3a]" };
  if (item.mime.includes("word") || item.mime.includes("document")) return { texto: "DOC", classe: "bg-[#E7EEF6] text-[#1F4F8A]" };
  if (item.mime.includes("sheet") || item.mime.includes("excel")) return { texto: "XLS", classe: "bg-[#E7F2EA] text-[#256b3a]" };
  return { texto: "ARQ", classe: "bg-[#F3F1EC] text-[#6B7280]" };
}
const tamanho = (b: number | null) => (b == null ? "—" : b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const data = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : "—");
const linkPasta = (id: string) => `https://drive.google.com/drive/folders/${id}`;
const temPrevia = (item: Item) => item.mime === "application/pdf" || item.mime.startsWith("image/") || item.mime.startsWith("application/vnd.google-apps.");

function lerBase64(arquivo: File) {
  return new Promise<string>((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(",")[1] ?? "");
    leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

export function ArquivosCliente({ clienteId }: { clienteId: string }) {
  const queryClient = useQueryClient();
  const listar = useServerFn(listarPasta);
  const criarRaiz = useServerFn(criarPastaCliente);
  const criar = useServerFn(novaPasta);
  const enviar = useServerFn(enviarParaPasta);
  const alterar = useServerFn(alterarItem);
  const abrir = useServerFn(abrirArquivo);
  const entrada = useRef<HTMLInputElement>(null);

  const [pasta, setPasta] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<Item | null>(null);
  const [previa, setPrevia] = useState<{ url: string; mime: string } | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [dialogo, setDialogo] = useState<null | { tipo: "nova" } | { tipo: "renomear" | "mover"; item: Item }>(null);

  const chave = ["arquivos", clienteId, pasta];
  const { data: resposta, isLoading, isError, error } = useQuery({ queryKey: chave, queryFn: () => listar({ data: { cliente_id: clienteId, pasta_id: pasta } }) });
  const recarregar = () => queryClient.invalidateQueries({ queryKey: ["arquivos", clienteId] });
  const caminho = resposta?.caminho ?? [];
  const atual = caminho[caminho.length - 1];
  const termo = busca.trim().toLowerCase();
  const itens = ((resposta?.itens ?? []) as Item[]).filter((item) => !termo || item.nome.toLowerCase().includes(termo));

  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa.url); }, [previa]);
  function fecharPrevia() {
    setSelecionado(null);
    setPrevia(null);
  }
  function entrar(id: string | null) {
    fecharPrevia();
    setBusca("");
    setPasta(id);
  }

  async function obterBlob(item: Item) {
    const arquivo = await abrir({ data: { cliente_id: clienteId, item_id: item.id } });
    const bytes = Uint8Array.from(atob(arquivo.base64), (c) => c.charCodeAt(0));
    return { blob: new Blob([bytes], { type: arquivo.mime }), nome: arquivo.nome, mime: arquivo.mime };
  }
  async function mostrar(item: Item) {
    setSelecionado(item);
    setPrevia(null);
    if (!temPrevia(item)) return;
    setCarregandoPrevia(true);
    try {
      const { blob, mime } = await obterBlob(item);
      setPrevia({ url: URL.createObjectURL(blob), mime });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o arquivo.");
    } finally {
      setCarregandoPrevia(false);
    }
  }
  async function baixar(item: Item) {
    try {
      const { blob, nome } = await obterBlob(item);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nome;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível baixar o arquivo.");
    }
  }

  async function enviarArquivos(lista: FileList | File[]) {
    if (!atual) return;
    for (const arquivo of Array.from(lista)) {
      if (arquivo.size > LIMITE) {
        toast.error(`"${arquivo.name}" passa de 20 MB. Envie pelo Drive.`);
        continue;
      }
      setEnviando(arquivo.name);
      try {
        const base64 = await lerBase64(arquivo);
        await enviar({ data: { cliente_id: clienteId, pasta_id: atual.id, nome: arquivo.name, mime: arquivo.type, base64 } });
        toast.success(`"${arquivo.name}" enviado.`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Não foi possível enviar "${arquivo.name}".`);
      }
    }
    setEnviando(null);
    recarregar();
  }

  const operar = useMutation({
    mutationFn: async (acao: { tipo: "nova"; nome: string } | { tipo: "renomear"; item: Item; nome: string } | { tipo: "mover"; item: Item; destino: string } | { tipo: "lixeira"; item: Item }) => {
      if (acao.tipo === "nova") return criar({ data: { cliente_id: clienteId, pasta_id: atual?.id ?? "", nome: acao.nome } });
      if (acao.tipo === "renomear") return alterar({ data: { cliente_id: clienteId, item_id: acao.item.id, nome: acao.nome } });
      if (acao.tipo === "mover") return alterar({ data: { cliente_id: clienteId, item_id: acao.item.id, destino_id: acao.destino } });
      return alterar({ data: { cliente_id: clienteId, item_id: acao.item.id, lixeira: true } });
    },
    onSuccess: (_, acao) => {
      toast.success({ nova: "Pasta criada.", renomear: "Nome alterado.", mover: "Item movido.", lixeira: "Item enviado para a lixeira do Drive." }[acao.tipo]);
      setDialogo(null);
      if (acao.tipo !== "nova" && selecionado?.id === acao.item.id) fecharPrevia();
      recarregar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível concluir."),
  });

  const pastaRaiz = useMutation({
    mutationFn: () => criarRaiz({ data: { cliente_id: clienteId } }),
    onSuccess: () => {
      toast.success("Pasta do cliente criada no Arquivo Digital.");
      recarregar();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível criar a pasta."),
  });
