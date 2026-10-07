import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Download, FolderOpen, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EditClientDialog } from "@/components/EditClientDialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  buildInstallments,
  formatCurrency,
  formatDate,
  installmentSituation,
  todayISO,
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

function ClientDetailPage() {
  const { clientId } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
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
      const { data, error } = await supabase
        .from("contracts")
        .select("*, installments(*)")
        .eq("client_id", clientId)
        .order("created_at");
      if (error) throw error;
      return data;
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

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl">{client.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {client.person_type === "PJ" ? "Pessoa jurídica" : "Pessoa física"} ·{" "}
            {client.cpf_cnpj || "CPF/CNPJ não informado"}
          </p>
        </div>
        {client.drive_folder_url ? (
          <Button asChild variant="outline">
            <a href={client.drive_folder_url} target="_blank" rel="noreferrer">
              <FolderOpen className="size-4" />
              Abrir pasta no Drive
            </a>
                    </Button>
          ) : null}
        </div>
      </div>

      <section className="panel mt-6 grid gap-4 p-6 sm:grid-cols-2">
        <Field label="Nacionalidade" value={client.nationality} />
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
        <h2 className="text-lg">Documentos</h2>
        <div className="panel mt-3 overflow-hidden">
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
          <h2 className="text-lg">Contratos e condições de pagamento</h2>
          <NewContractDialog clientId={clientId} />
        </div>

        {(contracts ?? []).length === 0 && (
          <p className="panel mt-3 p-6 text-sm text-muted-foreground">
            Nenhum contrato cadastrado para este cliente.
          </p>
        )}

        {(contracts ?? []).map((contract) => (
          <div key={contract.id} className="panel mt-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
              <div>
                <p className="font-medium">{contract.description || contract.category}</p>
                <p className="text-sm text-muted-foreground">
                  {contract.category} · {formatCurrency(contract.total_value)} em{" "}
                  {contract.installments_count}x · êxito {contract.success_fee_percent}%
                </p>
              </div>
              <Badge variant="secondary">{contract.payment_method || "Forma a definir"}</Badge>
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
    </AppShell>
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

function NewContractDialog({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [totalValue, setTotalValue] = useState("");
  const [count, setCount] = useState("1");
  const [firstDue, setFirstDue] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [successFee, setSuccessFee] = useState("0");
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: async () => {
      const total = Number(totalValue.replace(",", "."));
      const installmentsCount = Math.max(1, Number(count));
      if (!Number.isFinite(total) || total <= 0) {
        throw new Error("Informe um valor total válido.");
      }

      const { data: contract, error } = await supabase
        .from("contracts")
        .insert({
          client_id: clientId,
          description,
          category,
          total_value: total,
          installments_count: installmentsCount,
          first_due_date: firstDue,
          payment_method: paymentMethod,
          success_fee_percent: Number(successFee.replace(",", ".")) || 0,
        })
        .select("id")
        .single();
      if (error) throw error;

      const rows = buildInstallments(total, installmentsCount, firstDue).map((row) => ({
        ...row,
        contract_id: contract.id,
        client_id: clientId,
        payment_method: paymentMethod,
        category,
      }));

      const { error: instErr } = await supabase.from("installments").insert(rows);
      if (instErr) throw instErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts", clientId] });
      queryClient.invalidateQueries({ queryKey: ["installments"] });
      toast.success("Contrato cadastrado e parcelas geradas.");
      setOpen(false);
      setDescription("");
      setTotalValue("");
      setCount("1");
      setSuccessFee("0");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Erro ao salvar o contrato."),
  });

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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              id="description"
              placeholder="Ex.: Ação trabalhista — pró-labore"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="total">Valor total (R$)</Label>
            <Input
              id="total"
              inputMode="decimal"
              value={totalValue}
              onChange={(e) => setTotalValue(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="count">Número de parcelas</Label>
            <Input
              id="count"
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="firstDue">Primeiro vencimento</Label>
            <Input
              id="firstDue"
              type="date"
              value={firstDue}
              onChange={(e) => setFirstDue(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="successFee">% de êxito</Label>
            <Input
              id="successFee"
              inputMode="decimal"
              value={successFee}
              onChange={(e) => setSuccessFee(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            {create.isPending ? "Salvando…" : "Salvar e gerar parcelas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
