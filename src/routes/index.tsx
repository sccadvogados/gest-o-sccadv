import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BriefcaseBusiness, Filter, FolderOpen, Plus, Search } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { getActiveProcessCounts } from "@/lib/drive-processes.functions";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gestão Administrativa | SCC Adv" },
      {
        name: "description",
        content:
          "Busca e cadastro de clientes do escritório Souza, Craveiro & Corradi Advogados.",
      },
      { property: "og:title", content: "Gestão Administrativa | SCC Adv" },
      {
        property: "og:description",
        content: "Lista de clientes, pastas no Drive e cadastro de novos clientes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientsPage,
});

function isClientIncomplete(client: {
  cpf_cnpj: string | null;
  cep: string | null;
  street: string | null;
  email: string | null;
  phone: string | null;
}) {
  return !client.cpf_cnpj?.trim() ||
    (!client.cep?.trim() && !client.street?.trim()) ||
    !client.email?.trim() ||
    !client.phone?.trim();
}

function ClientsPage() {
  const [term, setTerm] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const fetchProcessCounts = useServerFn(getActiveProcessCounts);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, person_type, cpf_cnpj, cep, street, email, phone, city, state, drive_folder_id, drive_folder_url, drive_error, created_at")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: processCounts, isLoading: processCountsLoading } = useQuery({
    queryKey: ["drive-active-process-counts"],
    queryFn: () => fetchProcessCounts(),
    staleTime: 5 * 60 * 1000,
  });

    const search = term.trim().toLowerCase();
  const filtered = (clients ?? []).filter((c) => {
    const matchesSearch = search.length === 0
      ? true
      : [c.name, c.cpf_cnpj, c.email, c.phone]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(search));
    return matchesSearch && (!onlyIncomplete || isClientIncomplete(c));
  });
    const totalActiveProcesses = (clients ?? []).reduce(
    (total, client) => total + (processCounts?.[client.drive_folder_id ?? ""] ?? 0),
    0,
  );

  return (
    <AppShell>
            <PageHeader
        title="Clientes"
        subtitle="Busque por nome, CPF/CNPJ, e-mail ou telefone."
        action={(
          <Button asChild>
            <Link to="/clientes/novo">
              <Plus className="size-4" />
              Novo cliente
            </Link>
          </Button>
        )}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
            placeholder="Buscar cliente…"
            className="pl-9"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant={onlyIncomplete ? "default" : "outline"}
          onClick={() => setOnlyIncomplete((current) => !current)}
          aria-pressed={onlyIncomplete}
                >
          <Filter className="size-4" />
          Somente incompletos
        </Button>
        <div className="ml-auto flex min-w-44 items-center gap-3 rounded-xl border border-[#E6E1D8] bg-white px-4 py-3 shadow-sm">
          <div className="rounded-lg bg-[#F1EEE7] p-2">
            <BriefcaseBusiness className="size-5 text-accent" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Processos ativos</p>
            <p className="text-xl font-semibold tabular-nums">
              {processCountsLoading ? "—" : totalActiveProcesses}
            </p>
          </div>
        </div>
      </div>

            <div className="panel mt-6 overflow-hidden border-t-2 border-t-accent">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>CPF/CNPJ</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead>Processos ativos</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead className="text-right">Pasta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Carregando clientes…
                </TableCell>
              </TableRow>
            )}

            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {clients?.length
                    ? "Nenhum cliente encontrado para essa busca."
                    : "Nenhum cliente cadastrado ainda."}
                </TableCell>
              </TableRow>
            )}

            {filtered.map((client) => (
                            <TableRow key={client.id} className="h-20">
                <TableCell>
                  <Link
                    to="/clientes/$clientId"
                    params={{ clientId: client.id }}
                    className="font-medium underline-offset-4 hover:text-accent hover:underline"
                  >
                    {client.name}
                  </Link>
                                    <Badge variant="secondary" className="ml-2 align-middle text-[10px]">
                    {client.person_type === "PJ" ? "Pessoa jurídica" : "Pessoa física"}
                  </Badge>
                  {isClientIncomplete(client) ? (
                    <Badge className="ml-2 align-middle border-transparent bg-[#E8B9A5] text-[#7A3F2D] hover:bg-[#E8B9A5] text-[10px]">
                      Cadastro incompleto
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {client.cpf_cnpj || "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <div>{client.email || "—"}</div>
                  <div>{client.phone || ""}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {[client.city, client.state].filter(Boolean).join(" / ") || "—"}
                </TableCell>
                <TableCell className="text-sm font-medium tabular-nums">
                  {processCountsLoading
                    ? "—"
                    : processCounts?.[client.drive_folder_id ?? ""] ?? 0}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(client.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  {client.drive_folder_url ? (
                    <a
                      href={client.drive_folder_url}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir pasta no Google Drive"
                      className="inline-flex items-center justify-center rounded-md p-2 text-accent hover:bg-secondary"
                    >
                      <FolderOpen className="size-4" />
                    </a>
                  ) : (
                    <span
                      title={
                        client.drive_error ??
                        "Pasta no Drive ainda não criada — conecte a conta do escritório."
                      }
                      className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground/50"
                    >
                      <FolderOpen className="size-4" />
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
