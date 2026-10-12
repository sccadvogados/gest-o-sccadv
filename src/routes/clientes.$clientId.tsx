import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Archive, ArchiveRestore, ArrowLeft, Download, FileText, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { ContractForm } from "@/components/ContractForm";
import { ContractPartners } from "@/components/ContractPartners";
import { ContractReview } from "@/components/ContractReview";
import { CurrencyInput } from "@/components/CurrencyInput";
import { ObjectClauseField } from "@/components/ObjectClauseField";
import { DeleteClientDialog } from "@/components/DeleteClientDialog";

import { EditClientDialog } from "@/components/EditClientDialog";
import { TIPO_CORES } from "@/lib/calendarSync";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { officeDatabase } from "@/lib/office-database";
import { arquivarContrato } from "@/lib/arquivo.functions";
import {
  buildContractInstallments,
  buildInstallments,
  formatCurrency,
  formatDate,
  installmentSituation,
  todayISO,
  type ContractModality,
} from "@/lib/format";

export const Route = createFileRoute("/clientes/$clientId")({
  head: () => ({
    meta: [
      { title: "Ficha do cliente | Gestão Administrativa | SCC Adv" },
      {
        name: "description",
        content:
          "Qualificação, documentos, contratos e parcelas do cliente no escritório SCC Advogados.",
      },
      { property: "og:title", content: "Ficha do cliente | Gestão Administrativa | SCC Adv" },
      {
        property: "og:description",
        content: "Dados do cliente, contratos e condições de pagamento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientDetailPage,
});

export const CATEGORIES = [
  "(R) Pró-labore",
  "(R) Honorários de Êxito",
  "(R) Honorários de Sucumbência",
] as const;

const PAYMENT_METHODS = ["Cartão", "PIX", "Boleto"] as const;

const DOC_LABELS: Record<string, string> = {
  identificacao: "Documento de Identificação",
  residencia: "Comprovante de Residência",
  outros: "Outros Documentos",
  procuracao: "Procuração",
  declaracao: "Declaração de Hipossuficiência",
  contrato: "Contrato de Prestação de Serviços",
};

function getMissingClientFields(client: {
  cpf_cnpj: string | null;
  cep: string | null;
  street: string | null;
  email: string | null;
  phone: string | null;
}) {
  const missing: string[] = [];
  if (!client.cpf_cnpj?.trim()) missing.push("CPF/CNPJ");
  if (!client.cep?.trim() && !client.street?.trim()) missing.push("endereço");
  if (!client.email?.trim()) missing.push("e-mail");
  if (!client.phone?.trim()) missing.push("telefone");
  return missing;
}

function ClientDetailPage() {
  const { clientId } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const { data, error } = await officeDatabase(supabase)
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: documents } = useQuery({
    queryKey: ["client-documents", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_documents")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: contracts } = useQuery({
    queryKey: ["contracts", clientId],
    queryFn: async () => {
      const { data, error } = await officeDatabase(supabase)
        .from("contracts")
        .select("*, installments(*)")
        .eq("client_id", clientId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

    const { data: clientEvents } = useQuery({
    queryKey: ["client-events", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventos")
        .select("id, tipo, titulo, data_inicio, data_fim, status, dia_inteiro")
        .eq("cliente_id", clientId)
        .order("data_inicio");
      if (error) throw error;
      return data ?? [];
    },
  });

  const markPaid = useMutation({
    mutationFn: async (installmentId: string) => {
      const { error } = await supabase
        .from("installments")
        .update({ status: "Pago", paid_at: todayISO() })
        .eq("id", installmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts", clientId] });
      queryClient.invalidateQueries({ queryKey: ["installments"] });
      toast.success("Parcela baixada.");
    },
    onError: () => toast.error("Não foi possível baixar a parcela."),
  });

  async function downloadDocument(path: string, fileName: string) {
    const { data, error } = await supabase.storage
      .from("client-documents")
      .createSignedUrl(path, 60);
    if (error || !data) {
      toast.error("Não foi possível abrir o arquivo.");
      return;
    }
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = fileName;
    link.target = "_blank";
    link.click();
  }

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Carregando ficha…</p>
      </AppShell>
    );
  }

  if (!client) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Cliente não encontrado.</p>
      </AppShell>
    );
  }

  const address = [
    [client.street, client.number].filter(Boolean).join(", "),
    client.complement,
    client.district,
    [client.city, client.state].filter(Boolean).join(" / "),
    client.cep,
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <AppShell>
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Voltar para clientes
        </Link>
      </Button>

            {getMissingClientFields(client).length > 0 ? (
        <div className="mt-4 rounded-md border border-[#E8B9A5] bg-[#FFF4EF] px-4 py-3 text-sm text-[#7A3F2D]">
          <strong>Cadastro incompleto:</strong> faltam {getMissingClientFields(client).join(", ")}.
          <span className="ml-1 inline-flex">
            <EditClientDialog
              clientId={clientId}
              client={client}
              triggerLabel="Editar Dados"
              triggerClassName="h-auto border-0 bg-transparent p-0 text-[#7A3F2D] underline hover:bg-transparent"
            />
          </span>
        </div>
      ) : null}

            <PageHeader
        className="mt-4"
        title={client.name}
        subtitle={`${client.person_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"} · ${client.cpf_cnpj || "CPF/CNPJ não informado"}`}
        action={
          <div className="flex flex-wrap gap-2">
                        <EditClientDialog clientId={clientId} client={client} />
            <DeleteClientDialog clientId={clientId} clientName={client.name} />
            {client.drive_folder_url ? (
              <Button asChild variant="outline">
                <a href={client.drive_folder_url} target="_blank" rel="noreferrer">
                  <FolderOpen className="size-4" />
                                    Abrir Pasta no Drive
                </a>
              </Button>
            ) : null}
          </div>
        }
      />

            <section className="panel mt-6 grid gap-5 rounded-xl border border-[#E6D6C4] border-t-[3px] border-t-[#D4A782] bg-white p-6 shadow-panel sm:grid-cols-2">
                <Field label="Nacionalidade" value={client.nationality} />
        {client.person_type === "PJ" ? <Field label="Descrição da pessoa jurídica" value={client.pj_descricao ?? null} /> : null}
        <Field label="Estado civil" value={client.marital_status} />
        <Field label="Profissão" value={client.profession} />
        <Field
          label="RG"
          value={[client.rg_number, client.rg_issuer].filter(Boolean).join(" — ")}
        />
        <Field label="E-mail" value={client.email} />
        <Field label="Telefone" value={client.phone} />
        <div className="sm:col-span-2">
          <Field label="Endereço" value={address} />
        </div>
        {client.notes ? (
          <div className="sm:col-span-2">
            <Field label="Observações" value={client.notes} />
          </div>
        ) : null}
      </section>

      <section className="mt-8">
                <h2 className="text-xl font-semibold text-[#0F2340]">Documentos</h2>
        <div className="panel mt-3 overflow-hidden rounded-xl border border-[#E6D6C4] border-t-[3px] border-t-[#D4A782] bg-white shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Arquivo</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(documents ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    Nenhum documento anexado.
                  </TableCell>
                </TableRow>
              )}
              {(documents ?? []).map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>{DOC_LABELS[doc.kind] ?? doc.kind}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {doc.file_name}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadDocument(doc.file_path, doc.file_name)}
                    >
                      <Download className="size-4" />
                      Baixar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-semibold text-[#0F2340]">Contratos e Condições de Pagamento</h2>
          <NewContractDialog clientId={clientId} personType={client.person_type as "PF" | "PJ"} />
        </div>

        {(contracts ?? []).length === 0 && (
          <p className="panel mt-3 p-6 text-sm text-muted-foreground">
            Nenhum contrato cadastrado para este cliente.
          </p>
        )}

                {(contracts ?? []).map((contract) => (
                    <div key={contract.id} className={`panel mt-4 overflow-hidden rounded-xl border border-[#E6D6C4] border-t-[3px] border-t-[#D4A782] bg-white shadow-panel${contract.situacao === "arquivado" ? " opacity-70" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
              <div>
                                                                <p className="font-medium">{contract.numero != null && contract.ano != null ? `Contrato ${String(contract.numero).padStart(3, "0")}/${contract.ano}` : "Contrato"}</p>
                <p className="text-xs text-muted-foreground">{`Cadastrado em ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(contract.created_at))}`}</p>

                                <p className="text-sm text-muted-foreground">
                  {contract.modality === "probono"
                    ? "Pro Bono"
                    : contract.modality === "exito"
                      ? `Somente Êxito · ${contract.success_fee_percent}%`
                      : `${contract.category} · ${formatCurrency(contract.total_value)} em ${contract.installments_count}x · êxito ${contract.success_fee_percent}%`}
                </p>
              </div>
                                                        <div className="flex items-center gap-2">
                {contract.situacao === "arquivado" ? (
                  <Badge className="border-transparent bg-[#5B6472] text-white hover:bg-[#5B6472]">
                    {`Arquivado${contract.arquivado_em ? ` em ${formatDate(contract.arquivado_em)}` : ""}`}
                  </Badge>
                                ) : null}
                {contract.modality !== "probono" ? (
                  <Badge variant="secondary">{contract.payment_method || "Forma a definir"}</Badge>
                ) : null}
                {contract.captacao ? (
                  <Badge variant="secondary">
                    {`Captação: ${contract.captacao}${contract.captacao_percentual ? ` – ${String(contract.captacao_percentual).replace(".", ",")}%` : ""}`}
                  </Badge>
                ) : null}
                <ContractActions
                  clientId={clientId}
                  personType={client.person_type as "PF" | "PJ"}
                                    contract={{ ...contract, modality: contract.modality as ContractModality }}
                />
              </div>
            </div>

            {contract.modality !== "probono" ? <ContractPartners contract={contract} /> : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...(contract.installments ?? [])]
                  .sort((a, b) => a.number - b.number)
                  .map((installment) => {
                    const situation = installmentSituation(
                      installment.due_date,
                      installment.status,
                    );
                    return (
                      <TableRow key={installment.id}>
                        <TableCell>
                          {installment.number}/{contract.installments_count}
                        </TableCell>
                        <TableCell>{formatCurrency(installment.amount)}</TableCell>
                        <TableCell>{formatDate(installment.due_date)}</TableCell>
                        <TableCell>
                          <SituationBadge situation={situation} />
                        </TableCell>
                        <TableCell className="text-right">
                          {installment.status === "Pago" ? (
                            <span className="text-xs text-muted-foreground">
                              Baixada em {formatDate(installment.paid_at)}
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={markPaid.isPending}
                              onClick={() => markPaid.mutate(installment.id)}
                            >
                              Baixar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>
        ))}
            </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-[#0F2340]">Prazos e Reuniões</h2>
        <div className="panel mt-3 overflow-hidden rounded-xl border border-[#E6D6C4] border-t-[3px] border-t-[#D4A782] bg-white shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(clientEvents ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nenhum evento cadastrado para este cliente.
                  </TableCell>
                </TableRow>
              )}
              {(clientEvents ?? []).map((event) => {
                const timed = !event.dia_inteiro && Boolean(event.data_fim);
                const typeColor = TIPO_CORES[event.tipo as keyof typeof TIPO_CORES];
                return (
                  <TableRow key={event.id}>
                    <TableCell>
                      <Badge style={{ backgroundColor: typeColor?.hex, color: event.tipo === "protocolo" ? "#0F2340" : "white" }}>
                        {event.tipo === "reuniao" ? "Reunião" : event.tipo === "audiencia" ? "Audiência" : event.tipo === "julgamento" ? "Julgamento" : event.tipo === "acompanhamento" ? "Acompanhamento" : event.tipo === "protocolo" ? "Protocolo" : event.tipo === "compromisso" ? "Compromisso" : "Prazo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{event.titulo}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(event.data_inicio)}
                      {timed ? ` · ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(event.data_inicio))}–${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(event.data_fim!))}` : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{event.status === "cumprido" ? "Cumprido" : event.status === "cancelado" ? "Cancelado" : "Pendente"}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </AppShell>
  );
}

function ContractObjectSummary({ object }: { object: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
      <span className={expanded ? "" : "line-clamp-2"}>{object}</span>{" "}
      <button type="button" className="font-medium text-[#0F2340] underline" onClick={() => setExpanded((value) => !value)}>
        {expanded ? "ver menos" : "ver mais"}
      </button>
    </p>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm">{value || "—"}</p>
    </div>
  );
}

export function SituationBadge({
  situation,
}: {
  situation: "Pago" | "Pendente" | "Atrasado";
}) {
  if (situation === "Pago") {
    return (
      <Badge className="bg-success text-success-foreground hover:bg-success">Pago</Badge>
    );
  }
  if (situation === "Atrasado") {
    return (
      <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">
        Atrasado
      </Badge>
    );
  }
  return <Badge variant="secondary">Pendente</Badge>;
}

type ContractRow = {
    id: string;
  description: string | null;
  numero: number | null;
  ano: number | null;
  category: string;
  total_value: number;
  installments_count: number;
  first_due_date: string;
  payment_method: string | null;
  modality: ContractModality;
    created_at: string;

    success_fee_percent: number;
    objeto?: string | null;
  parte_contraria?: string | null;
  gratuidade?: boolean;
    captacao?: string | null;
  captacao_percentual?: number | null;
  situacao?: string;
  installments?: Array<{ status: string }>;
};

const CAPTACAO = ["Tráfego Pago", "Indicação", "Parceria", "Prospecção Ativa", "Cliente Recorrente"] as const;

function ContractActions({
  clientId,
  personType,
  contract,
}: {
  clientId: string;
  personType: "PF" | "PJ";
  contract: ContractRow;
}) {
    const queryClient = useQueryClient();
        const [editOpen, setEditOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const hasPaidInstallment = (contract.installments ?? []).some((installment) => installment.status === "Pago");
  const arquivado = contract.situacao === "arquivado";
  const arquivarFn = useServerFn(arquivarContrato);
  const arquivar = useMutation({
    mutationFn: () => arquivarFn({ data: { contrato_id: contract.id, reativar: arquivado } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["contracts", clientId] });
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      queryClient.invalidateQueries({ queryKey: ["contract-counts"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(result.situacao === "arquivado" ? "Contrato arquivado." : "Contrato reativado.");
      if (result.drive_erro) toast.warning(result.drive_erro);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível alterar o contrato."),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contracts").delete().eq("id", contract.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts", clientId] });
      queryClient.invalidateQueries({ queryKey: ["installments"] });
      toast.success("Contrato excluído.");
    },
    onError: () => toast.error("Não foi possível excluir o contrato."),
  });

  return (
        <>
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Gerar documentos" title="Gerar documentos">
            <FileText className="size-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Revisão e geração dos documentos</DialogTitle>
          </DialogHeader>
          {reviewOpen ? (
            <ContractReview
              contractId={contract.id}
              personType={personType}
              onFinish={() => {
                setReviewOpen(false);
                queryClient.invalidateQueries({ queryKey: ["client-documents", clientId] });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Editar contrato">
            <Pencil className="size-4" />
          </Button>
        </DialogTrigger>
        <EditContractDialog
          clientId={clientId}
                    personType={personType}
                    contract={contract}
          onSaved={() => setEditOpen(false)}
        />
      </Dialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={arquivado ? "Reativar Contrato" : "Arquivar Contrato"}
            title={arquivado ? "Reativar Contrato" : "Arquivar Contrato"}
          >
            {arquivado ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{arquivado ? "Reativar este contrato?" : "Arquivar este contrato?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {arquivado
                ? "O contrato volta a contar como ativo e a pasta dele retorna do Arquivo Morto para a pasta do cliente no Arquivo Digital."
                : "Use quando o trabalho estiver encerrado. O contrato deixa de contar como ativo e a pasta dele no Drive vai para o Arquivo Morto, dentro da pasta do cliente. Nada é apagado: parcelas, documentos e histórico continuam no sistema."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => arquivar.mutate()} disabled={arquivar.isPending}>
              {arquivar.isPending ? "Aguarde…" : arquivado ? "Reativar Contrato" : "Arquivar Contrato"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
                    <Button
            variant="ghost"

            size="icon"
            aria-label="Excluir contrato"
            onClick={(event) => {
              if (hasPaidInstallment) {
                event.preventDefault();
                toast.error("Este contrato tem parcelas pagas e não pode ser excluído.");
              }
            }}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este contrato?</AlertDialogTitle>
            <AlertDialogDescription>
              O contrato e todas as parcelas relacionadas serão excluídos. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? "Excluindo…" : "Excluir contrato"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EditContractDialog({
  clientId,
  personType,
  contract,
  onSaved,
}: {
  clientId: string;
  personType: "PF" | "PJ";
  contract: ContractRow;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const hasPaidInstallment = (contract.installments ?? []).some((installment) => installment.status === "Pago");
  const [category, setCategory] = useState(contract.category);
    const [totalValue, setTotalValue] = useState(Number(contract.total_value) || 0);
  const [count, setCount] = useState(String(contract.installments_count));
  const [firstDue, setFirstDue] = useState(contract.first_due_date);
  const [modality, setModality] = useState<ContractModality>(contract.modality);
  const proBono = modality === "probono";
  const semParcelas = modality === "exito" || proBono;
  const [paymentMethod, setPaymentMethod] = useState(contract.payment_method ?? PAYMENT_METHODS[0]);
  const paymentMethodOptions: string[] = PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number])
    ? [...PAYMENT_METHODS]
    : [paymentMethod, ...PAYMENT_METHODS];
  const [successFee, setSuccessFee] = useState(String(contract.success_fee_percent));
  const [object, setObject] = useState(contract.objeto ?? "");
    const [gratuidade, setGratuidade] = useState(contract.gratuidade ?? false);
  const [captacao, setCaptacao] = useState<string>(contract.captacao ?? "");
  const [captacaoPercentual, setCaptacaoPercentual] = useState(
    contract.captacao_percentual != null ? String(contract.captacao_percentual).replace(".", ",") : "",
  );
  const temRepasse = captacao === "Indicação" || captacao === "Parceria";
  const cadastro = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(contract.created_at));

    const update = useMutation({
    mutationFn: async () => {
      const installmentsCount = Math.max(1, Number(count));
      const fee = proBono ? 0 : Number(successFee.replace(",", ".")) || 0;
      const objeto = object.trim().replace(/\.+$/, "").trim() || null;
            const gratuidadeToSave = personType === "PF" ? gratuidade : false;
      const repasse = Number(captacaoPercentual.replace(",", "."));
      if (temRepasse && (!Number.isFinite(repasse) || repasse <= 0 || repasse > 100)) {
        throw new Error("Informe o percentual de repasse entre 0 e 100.");
      }
      if (modality === "exito") {
        if (fee <= 0) throw new Error("Informe um percentual de êxito válido.");
      } else if (!proBono && !hasPaidInstallment) {
        if (!Number.isFinite(totalValue) || totalValue <= 0) throw new Error("Informe um valor total válido.");
        if (!Number.isInteger(Number(count)) || Number(count) < 1) throw new Error("Informe um número inteiro de parcelas.");
        if (!firstDue) throw new Error("Informe o primeiro vencimento.");
      }

      const common = {
        category,
        payment_method: proBono ? null : paymentMethod,
        success_fee_percent: fee,
        objeto,
        gratuidade: gratuidadeToSave,
        captacao: captacao || null,
        captacao_percentual: temRepasse ? repasse : null,
      };
      const contractUpdate = hasPaidInstallment
        ? common
        : semParcelas
          ? { ...common, modality, total_value: 0, installments_count: 1, recurring: false }
          : { ...common, modality, total_value: totalValue, installments_count: installmentsCount, first_due_date: firstDue, recurring: modality === "mensal" };
      const { error } = await officeDatabase(supabase).from("contracts").update(contractUpdate).eq("id", contract.id);
      if (error) throw error;

            if (hasPaidInstallment) return;

      const { error: deleteError } = await supabase.from("installments").delete().eq("contract_id", contract.id);
      if (deleteError) throw deleteError;
      if (semParcelas) return;

      const rows = buildContractInstallments(totalValue, installmentsCount, firstDue, modality).map((row) => ({
        ...row,
        contract_id: contract.id,
        client_id: clientId,
        payment_method: paymentMethod,
        category,
      }));
      const { error: insertError } = await supabase.from("installments").insert(rows);
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts", clientId] });
      queryClient.invalidateQueries({ queryKey: ["installments"] });
      toast.success(hasPaidInstallment ? "Contrato atualizado sem alterar as parcelas." : "Contrato atualizado.");
      onSaved();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Não foi possível atualizar o contrato."),
  });

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{contract.numero != null && contract.ano != null ? `Editar contrato ${String(contract.numero).padStart(3, "0")}/${contract.ano}` : "Editar contrato"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        {hasPaidInstallment ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground sm:col-span-2">
            Há parcelas pagas; modalidade, valor e parcelas não podem ser alterados.
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground sm:col-span-2">Data de cadastro: {cadastro}</p>
        <div className="space-y-2">
          <Label>Modalidade</Label>
          <Select value={modality} onValueChange={(value) => setModality(value as ContractModality)} disabled={hasPaidInstallment}>
            <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="parcelado">Pró-labore Parcelado</SelectItem>
                            <SelectItem value="mensal">Pró-labore Mensal</SelectItem>
                            <SelectItem value="exito">Somente Êxito</SelectItem>
              <SelectItem value="probono">Pro Bono</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </div>
                {!semParcelas ? (
          <>
            <div className="space-y-2">
              <Label htmlFor={`edit-contract-total-${contract.id}`}>{modality === "mensal" ? "Valor mensal" : "Valor total"}</Label>
              <CurrencyInput id={`edit-contract-total-${contract.id}`} value={totalValue} onChange={setTotalValue} disabled={hasPaidInstallment} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-contract-count-${contract.id}`}>Número de parcelas</Label>
              <Input id={`edit-contract-count-${contract.id}`} type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} disabled={hasPaidInstallment} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-contract-due-${contract.id}`}>Primeiro vencimento</Label>
              <Input id={`edit-contract-due-${contract.id}`} type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} disabled={hasPaidInstallment} />
            </div>
          </>
        ) : null}
                {!proBono ? (
          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{paymentMethodOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : null}
                <div className="space-y-2">
                    <Label>Forma de Captação</Label>
          <Select value={captacao} onValueChange={(value) => setCaptacao(value === "nenhuma" ? "" : value)}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent><SelectItem value="nenhuma">Nenhuma</SelectItem>{CAPTACAO.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {temRepasse ? (
          <div className="space-y-2">
            <Label htmlFor={`edit-contract-repasse-${contract.id}`}>% de Repasse da {captacao}</Label>
            <Input
              id={`edit-contract-repasse-${contract.id}`}
              inputMode="decimal"
              placeholder="Ex.: 10"
              value={captacaoPercentual}
              onChange={(e) => setCaptacaoPercentual(e.target.value)}
            />
          </div>
        ) : null}
                {!proBono ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`edit-contract-fee-${contract.id}`}>% de êxito{modality === "exito" ? " (obrigatório)" : ""}</Label>
            <Input id={`edit-contract-fee-${contract.id}`} inputMode="decimal" value={successFee} onChange={(e) => setSuccessFee(e.target.value)} />
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <ObjectClauseField value={object} onChange={setObject} />
        </div>
        {personType === "PF" ? (
                    <div className="space-y-2 text-sm sm:col-span-2">
            <p className="font-medium">Pedir Gratuidade de Justiça?</p>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2">
                <Checkbox checked={gratuidade} onCheckedChange={(checked) => { if (checked === true) setGratuidade(true); }} />
                Sim
              </label>
              <label className="flex items-center gap-2">
                <Checkbox checked={!gratuidade} onCheckedChange={(checked) => { if (checked === true) setGratuidade(false); }} />
                Não
              </label>
            </div>
          </div>
        ) : null}
      </div>
      <DialogFooter>
        <Button onClick={() => update.mutate()} disabled={update.isPending}>{update.isPending ? "Salvando…" : "Salvar Alterações"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewContractDialog({ clientId, personType }: { clientId: string; personType: "PF" | "PJ" }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
                    <Plus className="size-4" />
          Novo Contrato
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Contrato</DialogTitle>
        </DialogHeader>
        <ContractForm clientId={clientId} personType={personType} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
