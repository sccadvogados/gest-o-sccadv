import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { FolderOpen, Plus, Search } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
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

function ClientsPage() {
  const [term, setTerm] = useState("");

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, person_type, cpf_cnpj, email, phone, city, state, drive_folder_url, drive_error, created_at")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const search = term.trim().toLowerCase();
  const filtered = (clients ?? []).filter((c) =>
    search.length === 0
      ? true
      : [c.name, c.cpf_cnpj, c.email, c.phone]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(search)),
  );

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Busque por nome, CPF/CNPJ, e-mail ou telefone.
          </p>
        </div>
        <Button asChild>
          <Link to="/clientes/novo">
            <Plus className="size-4" />
            Novo Cliente
          </Link>
        </Button>
      </div>

      <div className="relative mt-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar cliente…"
          className="pl-9"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      <div className="panel mt-6 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>CPF/CNPJ</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead className="text-right">Pasta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Carregando clientes…
                </TableCell>
              </TableRow>
            )}

            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {clients?.length
                    ? "Nenhum cliente encontrado para essa busca."
                    : "Nenhum cliente cadastrado ainda."}
                </TableCell>
              </TableRow>
            )}

            {filtered.map((client) => (
              <TableRow key={client.id}>
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
