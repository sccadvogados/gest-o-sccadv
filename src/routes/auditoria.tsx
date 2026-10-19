import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { addDays, rotuloRegistro, MODULOS, mudancas, todayISOAuditoria, type Registro } from "@/lib/auditoria";

// Tabela nova (auditoria) ainda não está nos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any; rpc: (fn: string) => Promise<{ data: unknown }> };

export const Route = createFileRoute("/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria | Gestão Administrativa | SCC Adv" },
      { property: "og:title", content: "Auditoria | Gestão Administrativa | SCC Adv" },
    ],
  }),
  component: AuditoriaPage,
});

const PERIODOS = [
  { valor: "1", rotulo: "Hoje" },
  { valor: "7", rotulo: "Últimos 7 Dias" },
  { valor: "30", rotulo: "Últimos 30 Dias" },
  { valor: "90", rotulo: "Últimos 90 Dias" },
  { valor: "365", rotulo: "Último Ano" },
];
const ACOES: Record<string, { rotulo: string; classe: string }> = {
  inclusao: { rotulo: "Inclusão", classe: "bg-[#E7F2EA] text-[#256b3a]" },
  alteracao: { rotulo: "Alteração", classe: "bg-[#E7EEF6] text-[#0F2340]" },
  exclusao: { rotulo: "Exclusão", classe: "bg-[#FBE9E7] text-[#B42318]" },
  login: { rotulo: "Entrada", classe: "bg-[#F4EDE4] text-[#7A4A28]" },
  logout: { rotulo: "Saída", classe: "bg-[#F4EDE4] text-[#7A4A28]" },
};
const LIMITE = 1000;

function quando(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function AuditoriaPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [periodo, setPeriodo] = useState("7");
  const [usuario, setUsuario] = useState("todos");
  const [modulo, setModulo] = useState("todos");
  const [acao, setAcao] = useState("todas");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<number | null>(null);

  useEffect(() => {
    void db.rpc("is_admin").then(({ data }) => setAdmin(data === true));
  }, []);

  const desde = addDays(todayISOAuditoria(), -(Number(periodo) - 1));
  const { data: registros = [], isLoading } = useQuery({
    queryKey: ["auditoria", desde],
    enabled: admin === true,
    queryFn: async () => {
      const { data, error } = await db
        .from("auditoria")
        .select("*")
        .gte("quando", `${desde}T00:00:00-03:00`)
        .order("quando", { ascending: false })
        .limit(LIMITE);
      if (error) throw error;
      return (data ?? []) as Registro[];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["auditoria-clientes"],
    enabled: admin === true,
    queryFn: async () => {
      const { data, error } = await db.from("clients").select("id, name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const nomesClientes = new Map(clientes.map((c) => [c.id, c.name]));

  const usuarios = [...new Set(registros.map((r) => r.usuario_nome || r.usuario_email || "Sistema"))].sort();
  const termo = busca.trim().toLowerCase();
  const visiveis = registros.filter((r) => {
    const nome = r.usuario_nome || r.usuario_email || "Sistema";
    if (usuario !== "todos" && nome !== usuario) return false;
    if (acao === "acessos" ? !["login", "logout"].includes(r.acao) : acao !== "todas" && r.acao !== acao) return false;
    if (modulo !== "todos") {
      const tabelas = MODULOS.find((m) => m.valor === modulo)?.tabelas ?? [];
      if (!r.tabela || !tabelas.includes(r.tabela)) return false;
    }
    if (termo) {
      const texto = `${rotuloRegistro(r, nomesClientes)} ${nome} ${JSON.stringify(r.depois ?? r.antes ?? {})}`.toLowerCase();
      if (!texto.includes(termo)) return false;
    }
    return true;
  });

  return (
    <AppShell>
      <PageHeader title="Auditoria" />
      {admin === false ? (
        <p className="mt-6 text-sm text-muted-foreground">Acesso restrito aos administradores.</p>
      ) : (
        <>
                    <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{PERIODOS.map((p) => <SelectItem key={p.valor} value={p.valor}>{p.rotulo}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={usuario} onValueChange={setUsuario}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Usuários</SelectItem>
                {usuarios.map((nome) => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={modulo} onValueChange={setModulo}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Módulos</SelectItem>
                {MODULOS.map((m) => <SelectItem key={m.valor} value={m.valor}>{m.rotulo}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={acao} onValueChange={setAcao}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as Ações</SelectItem>
                <SelectItem value="inclusao">Inclusões</SelectItem>
                <SelectItem value="alteracao">Alterações</SelectItem>
                <SelectItem value="exclusao">Exclusões</SelectItem>
                <SelectItem value="acessos">Entradas e Saídas</SelectItem>
              </SelectContent>
            </Select>
            <Input className="col-span-2 h-9 w-full bg-white sm:w-56" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>

          <div className="panel mt-4 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Registro</TableHead>
                  <TableHead>O Que Mudou</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading || admin === null ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : null}
                {!isLoading && admin && visiveis.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum registro neste período.</TableCell></TableRow>
                ) : null}
                {visiveis.map((r) => {
                  const lista = mudancas(r);
                  const info = ACOES[r.acao] ?? { rotulo: r.acao, classe: "" };
                  const nomeModulo = MODULOS.find((m) => r.tabela && m.tabelas.includes(r.tabela))?.rotulo ?? (r.tabela ? r.tabela : "Acesso");
                  return (
                    <Fragment key={r.id}>
                      <TableRow className="align-top">
                        <TableCell className="whitespace-nowrap tabular-nums">{quando(r.quando)}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.usuario_nome || r.usuario_email || "Sistema"}</TableCell>
                        <TableCell><span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${info.classe}`}>{info.rotulo}</span></TableCell>
                        <TableCell className="whitespace-nowrap">{nomeModulo}</TableCell>
                        <TableCell className="min-w-44">{r.tabela ? rotuloRegistro(r, nomesClientes) : "—"}</TableCell>
                        <TableCell className="min-w-64 text-sm">
                          {r.acao === "alteracao" ? (
                            <>
                              {lista.slice(0, 2).map((m) => (
                                <div key={m.campo}>
                                  <span className="text-muted-foreground">{`${m.rotulo}: `}</span>
                                  {`${m.antes} → ${m.depois}`}
                                </div>
                              ))}
                              {lista.length > 2 ? <span className="text-xs text-muted-foreground">{`e mais ${lista.length - 2}`}</span> : null}
                            </>
                          ) : r.acao === "inclusao" ? "Registro criado" : r.acao === "exclusao" ? "Registro apagado" : r.acao === "login" ? "Entrou no sistema" : "Saiu do sistema"}
                          {r.tabela ? (
                            <button
                              type="button"
                              onClick={() => setAberto((atual) => (atual === r.id ? null : r.id))}
                              className="mt-1 block text-xs text-[#B07A4F] underline underline-offset-4 hover:text-[#0F2340]"
                            >
                              {aberto === r.id ? "Ocultar Detalhes ▴" : "Ver Detalhes ▾"}
                            </button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                      {aberto === r.id ? (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-[#FBF7F1]">
                            <div className="grid gap-x-8 gap-y-1 text-xs sm:grid-cols-2">
                              {mudancas(r, true).map((m) => (
                                <div key={m.campo} className="flex gap-2">
                                  <span className="w-44 shrink-0 text-muted-foreground">{m.rotulo}</span>
                                  <span className="min-w-0 break-words">
                                    {r.acao === "alteracao" ? `${m.antes} → ${m.depois}` : r.acao === "exclusao" ? m.antes : m.depois}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {registros.length >= LIMITE ? (
            <p className="mt-2 text-xs text-muted-foreground">{`Mostrando os ${LIMITE} registros mais recentes do período. Escolha um período menor para ver os demais.`}</p>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
