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

  if (resposta?.semPasta) {
    return (
      <div className="panel mt-4 rounded-xl border border-[#E6D6C4] border-t-[3px] border-t-[#D4A782] bg-white p-6 text-sm">
        <p className="text-muted-foreground">Este cliente ainda não tem pasta no Arquivo Digital.</p>
        <Button className="mt-3" onClick={() => pastaRaiz.mutate()} disabled={pastaRaiz.isPending}>
          <FolderPlus className="size-4" /> Criar Pasta do Cliente
        </Button>
      </div>
    );
  }

  return (
    <section
      className={`panel mt-4 overflow-hidden rounded-xl border border-t-[3px] border-t-[#D4A782] bg-white ${arrastando ? "border-[#B07A4F] ring-2 ring-[#D4A782]/40" : "border-[#E6D6C4]"}`}
      onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => { e.preventDefault(); setArrastando(false); if (e.dataTransfer.files.length) void enviarArquivos(e.dataTransfer.files); }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex basis-full items-center gap-1 overflow-x-auto whitespace-nowrap pb-0.5 text-[13px]">
          <button type="button" className="text-muted-foreground hover:text-[#0F2340] hover:underline" onClick={() => entrar(null)}>Arquivo Digital</button>
          {caminho.map((parte, i) => (
            <span key={parte.id} className="flex items-center gap-1">
              <ChevronRight className="size-3.5 text-[#C9BFAE]" />
              {i === caminho.length - 1 ? (
                <b className="text-[#0F2340]">{parte.nome}</b>
              ) : (
                <button type="button" className="text-muted-foreground hover:text-[#0F2340] hover:underline" onClick={() => entrar(i === 0 && parte.nome !== "Arquivo Morto" ? null : parte.id)}>{parte.nome}</button>
              )}
            </span>
          ))}
        </div>
        <Input className="ml-auto h-9 w-52 bg-white" placeholder="Buscar nesta pasta" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Button variant="outline" onClick={() => setDialogo({ tipo: "nova" })} disabled={!atual}><FolderPlus className="size-4" /> Nova Pasta</Button>
        <Button onClick={() => entrada.current?.click()} disabled={!atual || Boolean(enviando)}><Upload className="size-4" /> {enviando ? "Enviando…" : "Enviar Arquivos"}</Button>
        <input ref={entrada} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void enviarArquivos(e.target.files); e.target.value = ""; }} />
        {atual ? <a href={linkPasta(atual.id)} target="_blank" rel="noreferrer" className="px-1 text-[13px] text-[#B07A4F] underline underline-offset-4 hover:text-[#0F2340]">Abrir no Drive ↗</a> : null}
      </div>

      <div className={`grid ${selecionado ? "lg:grid-cols-[1fr_380px]" : ""}`}>
        <div className="min-w-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Nome</TableHead><TableHead className="hidden sm:table-cell">Modificado</TableHead><TableHead className="hidden sm:table-cell">Tamanho</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Carregando pastas do Drive…</TableCell></TableRow> : null}
              {isError ? <TableRow><TableCell colSpan={4} className="py-6 text-center text-[#B42318]">{error instanceof Error ? error.message : "Não foi possível abrir a pasta."}</TableCell></TableRow> : null}
              {pasta !== null && caminho.length > 0 ? (
                <TableRow className="cursor-pointer hover:bg-[#FBF7F1]" onClick={() => entrar(caminho.length < 2 || (caminho.length === 2 && caminho[0]?.nome !== "Arquivo Morto") ? null : caminho[caminho.length - 2]?.id ?? null)}>
                  <TableCell colSpan={4} className="text-muted-foreground"><span className="inline-flex items-center gap-2"><CornerUpLeft className="size-4" /> Voltar para a pasta anterior</span></TableCell>
                </TableRow>
              ) : null}
              {!isLoading && !isError && itens.length === 0 && !resposta?.morto ? <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">{termo ? "Nada encontrado nesta pasta." : "Pasta vazia. Arraste arquivos para cá."}</TableCell></TableRow> : null}
              {itens.map((item) => {
                const ic = icone(item);
                const etiqueta = item.pasta ? etiquetaContrato(item.nome) : null;
                return (
                  <TableRow key={item.id} className={`cursor-pointer ${selecionado?.id === item.id ? "bg-[#F4EDE4]" : "hover:bg-[#FBF7F1]"}`} onClick={() => (item.pasta ? entrar(item.id) : void mostrar(item))}>
                    <TableCell>
                      <span className="flex items-center gap-2.5 font-medium text-[#0F2340]">
                        <span className={`grid size-7 shrink-0 place-items-center rounded-md text-[10px] font-bold ${ic.classe}`}>{item.pasta ? <Folder className="size-4" /> : ic.texto}</span>
                        <span className="min-w-0 break-words">{item.nome}</span>
                        {etiqueta ? <span className="whitespace-nowrap rounded-full bg-[#F3F1EC] px-2 py-0.5 text-[11px] font-normal text-muted-foreground">{etiqueta}</span> : null}
                      </span>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{data(item.modificado)}</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{item.pasta ? "—" : tamanho(item.tamanho)}</TableCell>
                    <TableCell className="w-10 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Ações"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => (item.pasta ? entrar(item.id) : void mostrar(item))}>Abrir</DropdownMenuItem>
                          {!item.pasta ? <DropdownMenuItem onClick={() => void baixar(item)}>Baixar</DropdownMenuItem> : null}
                          <DropdownMenuItem onClick={() => setDialogo({ tipo: "renomear", item })}>Renomear</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDialogo({ tipo: "mover", item })}>Mover para…</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(item.link ?? linkPasta(item.id), "_blank", "noreferrer")}>Abrir no Drive ↗</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-[#B42318]" onClick={() => { if (window.confirm(`Mover "${item.nome}" para a lixeira do Drive?`)) operar.mutate({ tipo: "lixeira", item }); }}>Mover para a Lixeira</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {resposta?.morto ? (
                <TableRow className="cursor-pointer hover:bg-[#FBF7F1]" onClick={() => entrar(resposta.morto)}>
                  <TableCell colSpan={4}>
                    <span className="flex items-center gap-2.5 text-muted-foreground">
                      <span className="grid size-7 place-items-center rounded-md bg-[#F3F1EC]"><Archive className="size-4" /></span>
                      Arquivo Morto <span className="text-xs">(contratos arquivados)</span>
                    </span>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <p className="m-4 rounded-lg border border-dashed border-[#DCCBB8] bg-[#FBF7F1] px-3 py-3 text-center text-[13px] text-muted-foreground">
            {enviando ? `Enviando "${enviando}"…` : "Arraste arquivos para cá para enviar a esta pasta (até 20 MB cada)"}
          </p>
        </div>

        {selecionado ? (
          <aside className="flex flex-col border-t border-border bg-[#FCFBF8] lg:border-l lg:border-t-0">
            <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
              <b className="break-words text-sm text-[#0F2340]">{selecionado.nome}</b>
              <button type="button" aria-label="Fechar" onClick={fecharPrevia} className="text-muted-foreground hover:text-[#0F2340]"><X className="size-4" /></button>
            </div>
            <div className="m-4 grid min-h-80 place-items-center overflow-hidden rounded-md border border-border bg-white">
              {carregandoPrevia ? <p className="text-sm text-muted-foreground">Abrindo…</p> : null}
              {previa && previa.mime.startsWith("image/") ? <img src={previa.url} alt={selecionado.nome} className="max-h-[480px] w-full object-contain" /> : null}
              {previa && previa.mime === "application/pdf" ? <iframe title={selecionado.nome} src={previa.url} className="h-[480px] w-full" /> : null}
              {!carregandoPrevia && !previa ? <p className="px-6 text-center text-sm text-muted-foreground">{temPrevia(selecionado) ? "Prévia indisponível." : "Prévia não disponível para este tipo de arquivo. Baixe ou abra no Drive para editar."}</p> : null}
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-y-1.5 px-4 text-xs">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Pasta</span><span>{atual?.nome}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tamanho</span><span>{tamanho(selecionado.tamanho)}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Modificado</span><span>{data(selecionado.modificado)}</span>
            </div>
            <div className="flex flex-wrap gap-2 p-4">
              <Button onClick={() => void baixar(selecionado)}>Baixar</Button>
              <Button variant="outline" onClick={() => window.open(selecionado.link ?? linkPasta(selecionado.id), "_blank", "noreferrer")}><ExternalLink className="size-4" /> Abrir no Drive</Button>
              <Button variant="outline" onClick={() => setDialogo({ tipo: "renomear", item: selecionado })}>Renomear</Button>
            </div>
          </aside>
        ) : null}
      </div>

      <NomeDialog
        aberto={dialogo?.tipo === "nova"}
        titulo="Nova Pasta"
        rotuloBotao="Criar Pasta"
        inicial=""
        sugestoes
        ocupado={operar.isPending}
        onFechar={() => setDialogo(null)}
        onConfirmar={(nome) => operar.mutate({ tipo: "nova", nome })}
      />
      <NomeDialog
        aberto={dialogo?.tipo === "renomear"}
        titulo="Renomear"
        rotuloBotao="Salvar"
        inicial={dialogo && dialogo.tipo === "renomear" ? dialogo.item.nome : ""}
        ocupado={operar.isPending}
        onFechar={() => setDialogo(null)}
        onConfirmar={(nome) => dialogo && dialogo.tipo === "renomear" && operar.mutate({ tipo: "renomear", item: dialogo.item, nome })}
      />
      <MoverDialog
        aberto={dialogo?.tipo === "mover"}
        clienteId={clienteId}
        nomeItem={dialogo && dialogo.tipo === "mover" ? dialogo.item.nome : ""}
        ocupado={operar.isPending}
        onFechar={() => setDialogo(null)}
        onConfirmar={(destino) => dialogo && dialogo.tipo === "mover" && operar.mutate({ tipo: "mover", item: dialogo.item, destino })}
      />
    </section>
  );
}

