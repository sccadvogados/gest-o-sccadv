import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlus, Newspaper } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

import { AtivarAvisos } from "@/components/AtivarAvisos";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, todayISO } from "@/lib/format";
import { resumirPublicacoes } from "@/lib/publicacoes.functions";

/**
 * Publicações do dia no DJEN (Diário de Justiça Eletrônico Nacional – CNJ) em nome do
 * RAPHAEL DE MATTOS TEODORO (OAB/DF 70.293), só dos tribunais acompanhados e só de clientes cadastrados.
 * A consulta é feita pelo navegador (a API do CNJ só responde para acessos do Brasil).
 * Cliente novo entra sozinho: a ligação é pelo nome das partes x cadastro de clientes.
 */
const OAB = { numero: "70293", uf: "DF" };
const TRIBUNAIS = ["TJDFT", "TJGO", "TJPE", "TRT1", "TJMG", "TRF1", "TJSP"];
const API = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const CACHE_ATOS = "scc-publicacoes-atos";

type Comunicacao = {
  id: number;
  hash: string | null;
  data_disponibilizacao: string;
  siglaTribunal: string;
  tipoComunicacao: string | null;
  tipoDocumento: string | null;
  nomeOrgao: string | null;
  nomeClasse: string | null;
  texto: string | null;
  numeroprocessocommascara: string | null;
  link: string | null;
  destinatarios: Array<{ nome: string; polo: string }> | null;
};

type Publicacao = Comunicacao & { cliente: { id: string; name: string } };

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mesmoNome(parte: string, cliente: string) {
  if (!parte || !cliente) return false;
  if (parte === cliente) return true;
  // Variações como "EMPRESA X LTDA" x "EMPRESA X LTDA EPP": aceita quando um começa com o outro e o nome é longo o bastante.
  const menor = parte.length < cliente.length ? parte : cliente;
  const maior = menor === parte ? cliente : parte;
  return menor.length >= 12 && maior.startsWith(menor);
}

function limparTeor(texto: string | null) {
  if (!texto) return "";
  return texto.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/[ \t]+/g, " ").trim();
}

function lerCache(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_ATOS) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function gravarCache(novos: Record<string, string>) {
  try {
    const atual = lerCache();
    const chaves = Object.keys(atual);
    // Guarda no máximo 500 resumos (os mais recentes).
    const base = chaves.length > 500 ? Object.fromEntries(chaves.slice(-400).map((k) => [k, atual[k]])) : atual;
    localStorage.setItem(CACHE_ATOS, JSON.stringify({ ...base, ...novos }));
  } catch {
    // sem armazenamento local: só não guarda
  }
}

async function buscarComunicacoes(data: string): Promise<Comunicacao[]> {
  const itens: Comunicacao[] = [];
  for (let pagina = 1; pagina <= 20; pagina += 1) {
    const params = new URLSearchParams({
      numeroOab: OAB.numero,
      ufOab: OAB.uf,
      dataDisponibilizacaoInicio: data,
      dataDisponibilizacaoFim: data,
      itensPorPagina: "100",
      pagina: String(pagina),
    });
    const resposta = await fetch(`${API}?${params}`);
    if (!resposta.ok) throw new Error(`DJEN respondeu ${resposta.status}`);
    const json = (await resposta.json()) as { count?: number; items?: Comunicacao[] };
    const pagina_ = json.items ?? [];
    itens.push(...pagina_);
    if (pagina_.length < 100 || itens.length >= (json.count ?? 0)) break;
  }
  return itens;
}

export function PublicacoesDoDia({ clients }: { clients: Array<{ id: string; name: string }> }) {
    const resumirFn = useServerFn(resumirPublicacoes);
  const navigate = useNavigate();

  /** Abre a Agenda com o Novo Evento já preenchido a partir da publicação. */
  function agendar(item: Publicacao, ato: string | undefined) {
    const tipo = item.tipoDocumento ?? item.tipoComunicacao ?? "Publicação";
    const descricao = [
      ato ? `Ato: ${ato}` : "",
      `Publicação DJEN de ${formatDate(item.data_disponibilizacao)} · ${[item.siglaTribunal, item.nomeOrgao].filter(Boolean).join(" – ")}`,
      item.numeroprocessocommascara ? `Processo ${item.numeroprocessocommascara}` : "",
      item.link ? `Documento: ${item.link}` : "",
      "",
      limparTeor(item.texto).slice(0, 1500),
    ].filter((linha, i) => linha || i === 4).join("\n");
    try {
      sessionStorage.setItem(
        "scc-agendar-publicacao",
        JSON.stringify({ titulo: `${tipo}${item.numeroprocessocommascara ? ` – ${item.numeroprocessocommascara}` : ""}`, descricao, cliente_id: item.cliente.id }),
      );
    } catch {
      /* sem armazenamento: abre a Agenda mesmo assim */
    }
    void navigate({ to: "/agenda" });
  }
  const [data, setData] = useState(todayISO());
  const [aberta, setAberta] = useState<number | null>(null);

  const { data: comunicacoes = [], isLoading, isError } = useQuery({
    queryKey: ["publicacoes-djen", data],
    queryFn: () => buscarComunicacoes(data),
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });

  // Só tribunais acompanhados, só clientes cadastrados e sem repetir a mesma comunicação.
  const clientesNormalizados = clients.map((cliente) => ({ ...cliente, chave: normalizar(cliente.name) }));
  const vistos = new Set<string>();
  const publicacoes: Publicacao[] = [];
  for (const item of comunicacoes) {
    if (!TRIBUNAIS.includes(item.siglaTribunal)) continue;
        // A mesma decisão costuma vir em 2 comunicações (uma só para o cliente e outra para as duas partes): conta uma vez.
    const chave = `${item.numeroprocessocommascara}|${item.tipoDocumento}|${item.link || limparTeor(item.texto).slice(0, 500)}`;
    if (vistos.has(chave)) continue;
    const partes = (item.destinatarios ?? []).map((parte) => normalizar(parte.nome));
    const cliente = clientesNormalizados.find((c) => partes.some((parte) => mesmoNome(parte, c.chave)));
    if (!cliente) continue;
    vistos.add(chave);
    publicacoes.push({ ...item, cliente: { id: cliente.id, name: cliente.name } });
  }

  const ids = publicacoes.map((p) => p.id);
  const { data: atos = {}, isLoading: resumindo } = useQuery({
    queryKey: ["publicacoes-atos", ids.join(",")],
    enabled: publicacoes.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const cache = lerCache();
      const faltam = publicacoes.filter((p) => !cache[String(p.id)]);
      for (let i = 0; i < faltam.length; i += 20) {
        const lote = faltam.slice(i, i + 20).map((p) => ({
          id: p.id,
          cliente: p.cliente.name,
          tipo: p.tipoDocumento ?? p.tipoComunicacao ?? "",
          classe: p.nomeClasse ?? "",
          texto: limparTeor(p.texto).slice(0, 8000),
        }));
        try {
          const novos = await resumirFn({ data: { publicacoes: lote } });
          gravarCache(novos);
          Object.assign(cache, novos);
        } catch {
          // sem resumo: a coluna Ato mostra o tipo do documento
        }
      }
            return cache;
    },
  });

  // Toque no aviso do celular: abre /inicio?data=AAAA-MM-DD&agendar=<id> → já abre o Agendar daquela publicação.
  const [pedidoAgendar, setPedidoAgendar] = useState<number | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("agendar"));
    if (!id) return;
    const dia = params.get("data");
    if (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia)) setData(dia);
    setPedidoAgendar(id);
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);
  useEffect(() => {
    if (!pedidoAgendar || isLoading || resumindo) return;
    const item = publicacoes.find((p) => p.id === pedidoAgendar);
    setPedidoAgendar(null);
    if (item) agendar(item, atos[String(item.id)]);
  }, [pedidoAgendar, isLoading, resumindo, publicacoes, atos]);

  return (
    <section className="panel overflow-hidden rounded-xl border border-t-[3px] border-t-accent bg-card text-card-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[#0F2340]">
          <Newspaper className="size-4" />
          {`Publicações do Dia${isLoading ? "" : ` (${publicacoes.length})`}`}
        </h2>
                <div className="flex items-center gap-2">
          <Input type="date" className="h-9 w-44 bg-white sm:w-[160px]" value={data} max={todayISO()} onChange={(e) => e.target.value && setData(e.target.value)} />
          <AtivarAvisos />
        </div>
      </div>

      {isLoading ? <p className="px-5 pb-5 text-sm text-muted-foreground">Consultando o Diário de Justiça Eletrônico Nacional…</p> : null}
      {isError ? (
        <p className="px-5 pb-5 text-sm text-[#B42318]">Não foi possível consultar o DJEN agora. A consulta só funciona com acesso pelo Brasil; tente de novo em instantes.</p>
      ) : null}
      {!isLoading && !isError && publicacoes.length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">Nenhuma publicação de clientes nesta data.</p> : null}

            {publicacoes.length > 0 ? (
        <div className="space-y-2 px-3 pb-3 md:hidden">
          {publicacoes.map((item) => {
            const ato = atos[String(item.id)];
            return (
              <div key={item.id} className="rounded-xl border border-[#ECE7DF] bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <Link to="/clientes/$clientId" params={{ clientId: item.cliente.id }} className="min-w-0 text-sm font-semibold leading-snug text-[#0F2340]">
                    {item.cliente.name}
                  </Link>
                  <span className="shrink-0 rounded-full bg-[#F3F1EC] px-2 py-0.5 text-[11px] text-muted-foreground">{item.siglaTribunal}</span>
                </div>
                <p className="mt-1 text-sm text-[#2C3440]">
                  {ato ?? (resumindo ? <span className="text-muted-foreground">Lendo a publicação…</span> : item.tipoDocumento ?? item.tipoComunicacao ?? "—")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{[item.numeroprocessocommascara, item.nomeOrgao].filter(Boolean).join(" · ")}</p>
                <div className="mt-2 flex items-center gap-3">
                  <button type="button" onClick={() => setAberta((atual) => (atual === item.id ? null : item.id))} className="text-xs text-[#B07A4F] underline underline-offset-4">
                    {aberta === item.id ? "Ocultar Teor ▴" : "Ver Teor ▾"}
                  </button>
                  <button
                    type="button"
                    onClick={() => agendar(item, ato)}
                    className="ml-auto inline-flex items-center gap-1 rounded-md bg-[#0F2340] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <CalendarPlus className="size-3.5" /> Agendar
                  </button>
                </div>
                {aberta === item.id ? (
                  <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-line rounded-md bg-[#FBF7F1] p-2.5 text-xs leading-relaxed">{limparTeor(item.texto) || "Sem teor disponível."}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {publicacoes.length > 0 ? (
        <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tribunal/Órgão</TableHead>
              <TableHead>Disponibilização</TableHead>
              <TableHead>Ato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {publicacoes.map((item) => {
              const ato = atos[String(item.id)];
              return (
                <Fragment key={item.id}>
                  <TableRow className="align-top">
                    <TableCell className="whitespace-nowrap tabular-nums">{item.numeroprocessocommascara ?? "—"}</TableCell>
                    <TableCell className="min-w-40">
                      <Link to="/clientes/$clientId" params={{ clientId: item.cliente.id }} className="font-medium text-[#0F2340] hover:underline">
                        {item.cliente.name}
                      </Link>
                    </TableCell>
                    <TableCell className="min-w-44">{[item.siglaTribunal, item.nomeOrgao].filter(Boolean).join(" – ")}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(item.data_disponibilizacao)}</TableCell>
                    <TableCell className="min-w-64">
                      {ato ?? (resumindo ? <span className="text-muted-foreground">Lendo a publicação…</span> : item.tipoDocumento ?? item.tipoComunicacao ?? "—")}
                      <button
                        type="button"
                        onClick={() => setAberta((atual) => (atual === item.id ? null : item.id))}
                        className="mt-1 block text-xs text-[#B07A4F] underline underline-offset-4 hover:text-[#0F2340]"
                      >
                        {aberta === item.id ? "Ocultar Teor ▴" : "Ver Teor ▾"}
                                            </button>
                      <button
                        type="button"
                        onClick={() => agendar(item, ato)}
                        className="mt-2 inline-flex items-center gap-1 rounded-md border border-[#D4A782] bg-white px-2.5 py-1 text-xs font-medium text-[#0F2340] hover:bg-[#F4EDE4]"
                      >
                        <CalendarPlus className="size-3.5" /> Agendar
                      </button>
                    </TableCell>
                  </TableRow>
                  {aberta === item.id ? (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-[#FBF7F1]">
                        <div className="max-h-80 overflow-y-auto whitespace-pre-line text-xs leading-relaxed">{limparTeor(item.texto) || "Sem teor disponível."}</div>
                        {item.link ? (
                          <a href={item.link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-[#B07A4F] underline">Abrir Documento</a>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
                </Table>
        </div>
      ) : null}
    </section>
  );
}
