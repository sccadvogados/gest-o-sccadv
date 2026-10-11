import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Download, FolderOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { ContractForm } from "@/components/ContractForm";
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
import { Textarea } from "@/components/ui/textarea";
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

const PAYMENT_METHODS = ["PIX", "Transferência", "Boleto", "Cartão", "Dinheiro"] as const;

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
              triggerLabel="Editar dados"
              triggerClassName="h-auto border-0 bg-transparent p-0 text-[#7A3F2D] underline hover:bg-transparent"
            />
          </span>
        </div>
      ) : null}

            <PageHeader
        className="mt-4"
        title={client.name}
        subtitle={`${client.person_type === "PJ" ? "Pessoa jurídica" : "Pessoa física"} · ${client.cpf_cnpj || "CPF/CNPJ não informado"}`}
        action={
          <div className="flex flex-wrap gap-2">
                        <EditClientDialog clientId={clientId} client={client} />
            <DeleteClientDialog clientId={clientId} clientName={client.name} />
            {client.drive_folder_url ? (
              <Button asChild variant="outline">
                <a href={client.drive_folder_url} target="_blank" rel="noreferrer">
                  <FolderOpen className="size-4" />
                  Abrir pasta no Drive
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
                    <h2 className="text-xl font-semibold text-[#0F2340]">Contratos e condições de pagamento</h2>
          <NewContractDialog clientId={clientId} personType={client.person_type as "PF" | "PJ"} />
        </div>

        {(contracts ?? []).length === 0 && (
          <p className="panel mt-3 p-6 text-sm text-muted-foreground">
            Nenhum contrato cadastrado para este cliente.
          </p>
        )}

        {(contracts ?? []).map((contract) => (
                    <div key={contract.id} className="panel mt-4 overflow-hidden rounded-xl border border-[#E6D6C4] border-t-[3px] border-t-[#D4A782] bg-white shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
              <div>
                                <p className="font-medium">Contrato {String(contract.numero).padStart(3, "0")}/{contract.ano}</p>
                <p className="text-sm text-muted-foreground">
                  {contract.category} · {formatCurrency(contract.total_value)} em{" "}
                  {contract.installments_count}x · êxito {contract.success_fee_percent}%
                </p>
              </div>
                            <div className="flex items-center gap-2">
                <Badge variant="secondary">{contract.payment_method || "Forma a definir"}</Badge>
                <ContractActions
                  clientId={clientId}
                  personType={client.person_type as "PF" | "PJ"}
                  contract={{ ...contract, modality: contract.modality as ContractModality }}
                />
              </div>
            </div>

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
        <h2 className="text-xl font-semibold text-[#0F2340]">Prazos e reuniões</h2>
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
  numero: number;
  ano: number;
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
  installments?: Array<{ status: string }>;
};

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
  const hasPaidInstallment = (contract.installments ?? []).some((installment) => installment.status === "Pago");

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
  const [totalValue, setTotalValue] = useState(String(contract.total_value));
  const [count, setCount] = useState(String(contract.installments_count));
    const [firstDue, setFirstDue] = useState(contract.first_due_date);
  const [modality, setModality] = useState<ContractModality>(contract.modality);
  
  const [paymentMethod, setPaymentMethod] = useState(contract.payment_method ?? PAYMENT_METHODS[0]);
    const [successFee, setSuccessFee] = useState(String(contract.success_fee_percent));
    const [object, setObject] = useState(contract.objeto ?? "");
  const [parteContraria, setParteContraria] = useState(contract.parte_contraria ?? "");
  const [gratuidade, setGratuidade] = useState(contract.gratuidade ?? false);

  const update = useMutation({
    mutationFn: async () => {
            const total = Number(totalValue.replace(",", "."));
      const installmentsCount = Math.max(1, Number(count));
      const fee = Number(successFee.replace(",", ".")) || 0;
      if (modality === "exito") {
        if (fee <= 0) throw new Error("Informe um percentual de êxito válido.");
      } else {
        if (!Number.isFinite(total) || total <= 0) throw new Error("Informe um valor total válido.");
        if (!Number.isInteger(installmentsCount)) throw new Error("Informe um número inteiro de parcelas.");
        if (!firstDue) throw new Error("Informe o primeiro vencimento.");
      }

                              const contractUpdate = hasPaidInstallment
                                ? { category, modality, payment_method: paymentMethod, success_fee_percent: fee, objeto: object || null, parte_contraria: parteContraria || null, gratuidade }


        : modality === "exito"
                                        ? { category, modality, total_value: 0, installments_count: 1, payment_method: paymentMethod, success_fee_percent: fee, objeto: object || null, parte_contraria: parteContraria || null, gratuidade }


          : {
              category,
              modality,
                            total_value: total,

              installments_count: installmentsCount,
              first_due_date: firstDue,
              payment_method: paymentMethod,
              success_fee_percent: fee,
              recurring: modality === "mensal",
              objeto: object || null,
              parte_contraria: parteContraria || null,
              gratuidade,
            };
      const { error } = await officeDatabase(supabase).from("contracts").update(contractUpdate).eq("id", contract.id);
      if (error) throw error;

                        if (hasPaidInstallment) return;

      const { error: deleteError } = await supabase.from("installments").delete().eq("contract_id", contract.id);
      if (deleteError) throw deleteError;

            const rows = buildContractInstallments(total, installmentsCount, firstDue, modality).map((row) => ({
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
            toast.success(hasPaidInstallment ? "Contrato atualizado sem alterar as parcelas." : "Contrato atualizado e parcelas regeneradas.");
      onSaved();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o contrato."),
  });

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Editar contrato</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        {hasPaidInstallment ? (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground sm:col-span-2">
            Há parcelas pagas; valor e parcelas não podem ser alterados.
          </p>
        ) : null}
                
        <div className="space-y-2 sm:col-span-2">
          <Label>Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </div>
                {modality !== "exito" ? <>
          <div className="space-y-2"><Label htmlFor={`edit-contract-total-${contract.id}`}>Valor total (R$)</Label><Input id={`edit-contract-total-${contract.id}`} inputMode="decimal" value={totalValue} onChange={(e) => setTotalValue(e.target.value)} disabled={hasPaidInstallment} /></div>
          <div className="space-y-2"><Label htmlFor={`edit-contract-count-${contract.id}`}>Número de parcelas</Label><Input id={`edit-contract-count-${contract.id}`} type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} disabled={hasPaidInstallment} /></div>
        </> : null}
                <div className="space-y-2"><Label>Modalidade</Label><Select value={modality} onValueChange={(value) => setModality(value as ContractModality)} disabled={hasPaidInstallment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="parcelado">Pró-labore parcelado</SelectItem><SelectItem value="mensal">Pró-labore mensal</SelectItem><SelectItem value="exito">Somente êxito</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>Data de cadastro</Label><p className="text-sm text-muted-foreground">{`Data de cadastro: ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(contract.created_at))}`}</p></div>

                {modality !== "exito" ? <div className="space-y-2"><Label htmlFor={`edit-contract-due-${contract.id}`}>Primeiro vencimento</Label><Input id={`edit-contract-due-${contract.id}`} type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} disabled={hasPaidInstallment} /></div> : null}
        <div className="space-y-2"><Label>Forma de pagamento</Label><Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>
                                <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`edit-contract-counterparty-${contract.id}`}>Parte contrária</Label>
          <Input id={`edit-contract-counterparty-${contract.id}`} value={parteContraria} onChange={(e) => setParteContraria(e.target.value)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`edit-contract-object-${contract.id}`}>Objeto do contrato</Label>
          <p className="text-sm text-muted-foreground">O objeto do presente contrato é a prestação de serviços advocatícios relativos…</p>
          <Textarea id={`edit-contract-object-${contract.id}`} rows={4} value={object} onChange={(e) => setObject(e.target.value)} />
                    <p className="text-sm text-muted-foreground">O objeto do presente contrato é a prestação de serviços advocatícios relativos {object}.</p>
        </div>
        {personType === "PF" ? <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={gratuidade} onCheckedChange={(checked) => setGratuidade(checked === true)} />Pedir gratuidade de justiça</label> : null}
        <div className="space-y-2 sm:col-span-2"><Label htmlFor={`edit-contract-fee-${contract.id}`}>% de êxito</Label><Input id={`edit-contract-fee-${contract.id}`} inputMode="decimal" value={successFee} onChange={(e) => setSuccessFee(e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button onClick={() => update.mutate()} disabled={update.isPending}>{update.isPending ? "Salvando…" : "Salvar alterações"}</Button>
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
          Novo contrato
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo contrato</DialogTitle>
        </DialogHeader>
        <ContractForm clientId={clientId} personType={personType} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
