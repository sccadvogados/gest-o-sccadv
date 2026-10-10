import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, FileScan, LoaderCircle, PencilLine, ScanText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  extractClientDocument,
  type ExtractedClientData,
} from "@/lib/document-extraction.functions";
import { maskCep, maskCpfCnpj, maskPhone, onlyDigits } from "@/lib/format";

export const Route = createFileRoute("/clientes/novo")({
  head: () => ({
    meta: [
      { title: "Novo cliente | Gestão Administrativa | SCC Adv" },
      {
        name: "description",
        content:
          "Cadastro completo da qualificação do cliente e envio dos documentos no escritório SCC Advogados.",
      },
      { property: "og:title", content: "Novo cliente | Gestão Administrativa | SCC Adv" },
      {
        property: "og:description",
        content: "Qualificação completa, endereço e anexos do cliente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewClientPage,
});

const MARITAL = [
  "Solteiro(a)",
  "Casado(a)",
  "Divorciado(a)",
  "Viúvo(a)",
  "União estável",
];

const ATTACHMENTS: { kind: string; label: string; multiple?: boolean }[] = [
  { kind: "identificacao", label: "Documento de Identificação" },
  { kind: "residencia", label: "Comprovante de Residência" },
  { kind: "outros", label: "Outros Documentos", multiple: true },
];

type Form = {
  person_type: "PF" | "PJ";
  name: string;
  nationality: string;
  marital_status: string;
  profession: string;
  rg_number: string;
  rg_issuer: string;
  cpf_cnpj: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  email: string;
  phone: string;
  notes: string;
};

const EMPTY: Form = {
  person_type: "PF",
  name: "",
  nationality: "Brasileiro(a)",
  marital_status: "",
  profession: "",
  rg_number: "",
  rg_issuer: "",
  cpf_cnpj: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  email: "",
  phone: "",
  notes: "",
};

function NewClientPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [extracting, setExtracting] = useState<Record<string, boolean>>({});
  const [extractedKinds, setExtractedKinds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const extractDocument = useServerFn(extractClientDocument);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function fileToBase64(file: File) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.readAsDataURL(file);
    });
  }

  async function prepareDocument(file: File) {
    if (file.type !== "application/pdf") {
      return {
        mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
        base64: await fileToBase64(file),
      };
    }

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise;
    const pages = Math.min(pdf.numPages, 2);
    const rendered: Array<{ canvas: HTMLCanvasElement; width: number; height: number }> = [];

    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível preparar este PDF para leitura.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      rendered.push({ canvas, width: canvas.width, height: canvas.height });
    }

    const combined = document.createElement("canvas");
    combined.width = Math.max(...rendered.map((page) => page.width));
    combined.height = rendered.reduce((height, page) => height + page.height, 0);
    const combinedContext = combined.getContext("2d");
    if (!combinedContext) throw new Error("Não foi possível preparar este PDF para leitura.");
    combinedContext.fillStyle = "#ffffff";
    combinedContext.fillRect(0, 0, combined.width, combined.height);
    let y = 0;
    for (const page of rendered) {
      combinedContext.drawImage(page.canvas, 0, y);
      y += page.height;
    }

    return {
      mimeType: "image/jpeg" as const,
      base64: combined.toDataURL("image/jpeg", 0.88).split(",")[1] ?? "",
    };
  }

  function mergeExtracted(data: ExtractedClientData) {
    setForm((current) => ({
      ...current,
      name: data.name || current.name,
      nationality: data.nationality || current.nationality,
      marital_status: data.marital_status || current.marital_status,
      profession: data.profession || current.profession,
      rg_number: data.rg_number || current.rg_number,
      rg_issuer: data.rg_issuer || current.rg_issuer,
      cpf_cnpj: data.cpf_cnpj ? maskCpfCnpj(data.cpf_cnpj) : current.cpf_cnpj,
      cep: data.cep ? maskCep(data.cep) : current.cep,
      street: data.street || current.street,
      number: data.number || current.number,
      complement: data.complement || current.complement,
      district: data.district || current.district,
      city: data.city || current.city,
      state: data.state?.toUpperCase() || current.state,
    }));
  }

  async function handleAttachment(kind: string, selected: File[]) {
    setFiles((prev) => ({ ...prev, [kind]: selected }));
    if ((kind !== "identificacao" && kind !== "residencia") || !selected[0]) return;

    const file = selected[0];
    const supported = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!supported.includes(file.type)) {
      toast.error("Para leitura automática, envie uma imagem JPG, PNG, WEBP ou um PDF.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("O arquivo deve ter até 12 MB para leitura automática.");
      return;
    }

    setExtracting((current) => ({ ...current, [kind]: true }));
    try {
      const prepared = await prepareDocument(file);
      const data = await extractDocument({
        data: {
          kind,
          fileName: file.name,
          mimeType: prepared.mimeType,
          base64: prepared.base64,
        },
      });
      mergeExtracted(data);
      setExtractedKinds((current) => [...new Set([...current, kind])]);
      setShowForm(true);
      toast.success("Dados identificados. Confira os campos antes de salvar.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o documento.");
    } finally {
      setExtracting((current) => ({ ...current, [kind]: false }));
    }
  }

  async function lookupCep(value: string) {
    const digits = onlyDigits(value);
    if (digits.length !== 8) return;
    setCepBusy(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await res.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data.erro) {
        toast.error("CEP não encontrado.");
        return;
      }
      setForm((prev) => ({
        ...prev,
        street: data.logradouro ?? prev.street,
        district: data.bairro ?? prev.district,
        city: data.localidade ?? prev.city,
        state: data.uf ?? prev.state,
      }));
    } catch {
      toast.error("Não foi possível consultar o CEP agora.");
    } finally {
      setCepBusy(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) {
        throw new Error("Anexe a identificação para ler os dados ou abra o preenchimento manual.");
      }
      const { data: auth } = await supabase.auth.getUser();
      const { data: client, error } = await supabase
        .from("clients")
        .insert({ ...form, created_by: auth.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;

      const uploads = Object.entries(files).flatMap(([kind, list]) =>
        list.map((file) => ({ kind, file })),
      );

      for (const { kind, file } of uploads) {
        const path = `${client.id}/${kind}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("client-documents")
          .upload(path, file);
        if (upErr) throw new Error(`Falha ao enviar "${file.name}": ${upErr.message}`);
        const { error: docErr } = await supabase.from("client_documents").insert({
          client_id: client.id,
          kind,
          file_name: file.name,
          file_path: path,
        });
        if (docErr) throw docErr;
      }

      return client.id;
    },
    onSuccess: (clientId) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente cadastrado com sucesso.");
      navigate({ to: "/clientes/$clientId", params: { clientId } });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar o cliente.");
    },
  });

  return (
    <AppShell>
            <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to="/">
          <ArrowLeft className="size-4" />
          Voltar para clientes
        </Link>
      </Button>

      <PageHeader
        className="mt-4"
        title="Novo cliente"
        subtitle="Anexe a identificação e o comprovante de residência para preencher os dados automaticamente."
      />

      <form
        className="mt-8 space-y-8"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
                <section className="panel rounded-xl border border-t-[3px] border-t-accent bg-card p-6 text-card-foreground shadow-panel space-y-6">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-md bg-secondary text-primary">
              <FileScan className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Anexe os documentos do cliente</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ao anexar, as informações são lidas e preenchidas automaticamente.
              </p>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            {ATTACHMENTS.map(({ kind, label, multiple }) => (
              <div key={kind} className="space-y-2">
                <Label htmlFor={`file-${kind}`}>{label}</Label>
                <Input
                  id={`file-${kind}`}
                  type="file"
                  accept={kind === "outros" ? undefined : "image/jpeg,image/png,image/webp,application/pdf"}
                  multiple={Boolean(multiple)}
                  onChange={(event) => handleAttachment(kind, Array.from(event.target.files ?? []))}
                />
                {extracting[kind] ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Identificando dados…</p>
                ) : extractedKinds.includes(kind) ? (
                  <p className="flex items-center gap-2 text-xs text-success"><CheckCircle2 className="size-3.5" />Dados identificados</p>
                ) : files[kind]?.length ? (
                  <p className="text-xs text-muted-foreground">{files[kind]?.length} arquivo(s) selecionado(s)</p>
                ) : null}
              </div>
            ))}
          </div>
          {!showForm && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setShowForm(true)}
            >
              <PencilLine className="size-4" />
              Preencher manualmente
            </Button>
          )}
        </section>

        {extractedKinds.length > 0 && (
          <Alert>
            <ScanText className="size-4" />
            <AlertTitle>Dados preenchidos automaticamente</AlertTitle>
            <AlertDescription>Revise a qualificação e o endereço abaixo. Campos não encontrados continuam disponíveis para preenchimento manual.</AlertDescription>
          </Alert>
        )}

        {showForm && <section className="panel rounded-xl border border-t-[3px] border-t-accent bg-card p-6 text-card-foreground shadow-panel space-y-5">
          <h2 className="text-base font-semibold text-[#0F2340]">Qualificação</h2>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo de pessoa</Label>
              <Select
                value={form.person_type}
                onValueChange={(v) => set("person_type", v as "PF" | "PJ")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa física</SelectItem>
                  <SelectItem value="PJ">Pessoa jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">
                {form.person_type === "PJ" ? "Razão social" : "Nome completo"}
              </Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cpf_cnpj">CPF/CNPJ</Label>
              <Input
                id="cpf_cnpj"
                value={form.cpf_cnpj}
                onChange={(e) => set("cpf_cnpj", maskCpfCnpj(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nationality">Nacionalidade</Label>
              <Input
                id="nationality"
                value={form.nationality}
                onChange={(e) => set("nationality", e.target.value)}
              />
            </div>

            {form.person_type === "PF" && (
              <>
                <div className="space-y-2">
                  <Label>Estado civil</Label>
                  <Select
                    value={form.marital_status}
                    onValueChange={(v) => set("marital_status", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {MARITAL.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profession">Profissão</Label>
                  <Input
                    id="profession"
                    value={form.profession}
                    onChange={(e) => set("profession", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rg_number">RG (número)</Label>
                  <Input
                    id="rg_number"
                    value={form.rg_number}
                    onChange={(e) => set("rg_number", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rg_issuer">Órgão expedidor / UF</Label>
                  <Input
                    id="rg_issuer"
                    placeholder="SSP/SP"
                    value={form.rg_issuer}
                    onChange={(e) => set("rg_issuer", e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        </section>}

        {showForm && <section className="panel space-y-5 p-6">
          <h2 className="text-base font-semibold">Endereço e contato</h2>

          <div className="grid gap-5 sm:grid-cols-6">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cep">CEP</Label>
              <Input
                id="cep"
                value={form.cep}
                onChange={(e) => set("cep", maskCep(e.target.value))}
                onBlur={(e) => lookupCep(e.target.value)}
              />
              {cepBusy && <p className="text-xs text-muted-foreground">Consultando CEP…</p>}
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="street">Logradouro</Label>
              <Input
                id="street"
                value={form.street}
                onChange={(e) => set("street", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="number">Número</Label>
              <Input
                id="number"
                value={form.number}
                onChange={(e) => set("number", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="complement">Complemento</Label>
              <Input
                id="complement"
                value={form.complement}
                onChange={(e) => set("complement", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="district">Bairro</Label>
              <Input
                id="district"
                value={form.district}
                onChange={(e) => set("district", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Cidade</Label>
              <Input
                id="city"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">UF</Label>
              <Input
                id="state"
                maxLength={2}
                value={form.state}
                onChange={(e) => set("state", e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => set("phone", maskPhone(e.target.value))}
              />
            </div>
          </div>
        </section>}

        {showForm && <section className="panel space-y-3 p-6">
          <Label htmlFor="notes">Observações</Label>
          <Textarea
            id="notes"
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </section>}

        {showForm && <div className="flex gap-3">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar cliente"}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/">Cancelar</Link>
          </Button>
        </div>}
      </form>
    </AppShell>
  );
}
