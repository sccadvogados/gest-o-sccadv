import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, FileScan, LoaderCircle, Paperclip, PencilLine, ScanText } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { ContractForm } from "@/components/ContractForm";
import { ContractReview } from "@/components/ContractReview";

import { ObjectClauseField } from "@/components/ObjectClauseField";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { officeDatabase } from "@/lib/office-database";
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
    { kind: "contrato_social", label: "Documento da Empresa" },
  { kind: "residencia", label: "Comprovante de Residência" },
  { kind: "outros", label: "Outros Documentos", multiple: true },
];

type Representative = {
  name: string;
  nationality: string;
  marital_status: string;
  profession: string;
  cpf: string;
  quality: "sócio" | "representante legal";
};

type Form = {
    person_type: "PF" | "PJ";
  name: string;
    pj_descricao: string;
  representatives: Representative[];
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
    pj_descricao: "pessoa jurídica de direito privado",
  representatives: [],
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

function Pending({ value }: { value: string | null | undefined }) {
  return !value?.trim() ? <span className="ml-0.5 text-destructive" aria-label="pendente">*</span> : null;
}

function NewClientPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [extracting, setExtracting] = useState<Record<string, boolean>>({});
  const [extractedKinds, setExtractedKinds] = useState<string[]>([]);
    const [showForm, setShowForm] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);
    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [savedClientId, setSavedClientId] = useState<string | null>(null);
  const [savedContractId, setSavedContractId] = useState<string | null>(null);
  const uploadedRef = useRef(new Map<string, { files: File[]; docs: { id: string; path: string }[] }>());
  const [objeto, setObjeto] = useState("");
  const [gratuidade, setGratuidade] = useState(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
    const extractDocument = useServerFn(extractClientDocument);

    const set = <K extends keyof Form,>(key: K, value: Form[K]) =>
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
    const { default: workerUrl } = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
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
      ...(data.representatives.length > 0 ? { representatives: data.representatives } : {}),
    }));
  }

  async function handleAttachment(kind: string, selected: File[]) {
    setFiles((prev) => ({ ...prev, [kind]: selected }));
        if ((kind !== "identificacao" && kind !== "residencia" && kind !== "contrato_social") || !selected[0]) return;

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
            if (kind === "contrato_social") set("person_type", "PJ");
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
      const { representatives: _representatives, ...clientForm } = form;
      let clientId = savedClientId;

      if (clientId) {
        const { error } = await officeDatabase(supabase).from("clients").update(clientForm).eq("id", clientId);
        if (error) throw error;
        const { error: deleteRepresentativesError } = await officeDatabase(supabase)
          .from("cliente_representantes")
          .delete()
          .eq("cliente_id", clientId);
        if (deleteRepresentativesError) throw deleteRepresentativesError;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { data: client, error } = await officeDatabase(supabase)
          .from("clients")
          .insert({ ...clientForm, created_by: auth.user?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        clientId = client.id;
        setSavedClientId(client.id);
      }
      const currentClientId = clientId;

      if (form.person_type === "PJ" && form.representatives.length > 0) {
        const { error: representativesError } = await officeDatabase(supabase)
          .from("cliente_representantes")
          .insert(
            form.representatives.map((representative, ordem) => ({
              cliente_id: currentClientId,
              nome: representative.name,
              nacionalidade: representative.nationality || null,
              estado_civil: representative.marital_status || null,
              profissao: representative.profession || null,
              cpf: onlyDigits(representative.cpf) || null,
              qualidade: representative.quality,
              ordem,
            })),
          );
        if (representativesError) throw representativesError;
      }

      for (const [kind, list] of Object.entries(files)) {
        const previous = uploadedRef.current.get(kind);
        const alreadySent = previous && previous.files.length === list.length && previous.files.every((file, index) => file === list[index]);
        if (alreadySent || list.length === 0) continue;

        if (previous && previous.docs.length > 0) {
          await supabase.storage.from("client-documents").remove(previous.docs.map((doc) => doc.path));
          const { error: removeError } = await supabase.from("client_documents").delete().in("id", previous.docs.map((doc) => doc.id));
          if (removeError) throw removeError;
        }

        const docs: { id: string; path: string }[] = [];
        for (const file of list) {
          const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin" : "bin";
          const path = `${currentClientId}/${kind}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
          const { error: upErr } = await supabase.storage.from("client-documents").upload(path, file);
          if (upErr) throw new Error(`Falha ao enviar "${file.name}": ${upErr.message}`);
          const { data: doc, error: docErr } = await supabase
            .from("client_documents")
            .insert({ client_id: currentClientId, kind, file_name: file.name, file_path: path })
            .select("id")
            .single();
          if (docErr) throw docErr;
          docs.push({ id: doc.id, path });
        }
        uploadedRef.current.set(kind, { files: list, docs });
      }

      return currentClientId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(savedClientId ? "Qualificação atualizada." : "Cliente cadastrado com sucesso.");
      setStep(2);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Erro ao salvar o cliente.");
    },
  });

  const STEPS = ["Qualificação", "Objeto", "Pagamento", "Revisão"] as const;

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

      <div className="mt-6 flex flex-wrap items-center gap-x-2 text-sm font-medium text-muted-foreground">
        {STEPS.map((label, index) => {
          const number = (index + 1) as 1 | 2 | 3 | 4;
          const canGoBack = number < step;
          return (
            <span key={label} className="flex items-center gap-2">
              {index > 0 ? <span>·</span> : null}
              {canGoBack ? (
                <button type="button" className="underline-offset-4 hover:underline" onClick={() => setStep(number)}>
                  {number} {label}
                </button>
              ) : (
                <span className={step === number ? "text-primary" : undefined}>{number} {label}</span>
              )}
            </span>
          );
        })}
      </div>

            {step === 1 && <form
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
                            <h2 className="text-base font-semibold text-[#0F2340]">Anexe os documentos do cliente</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ao anexar, as informações são lidas e preenchidas automaticamente.
              </p>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            {ATTACHMENTS.map(({ kind, label, multiple }) => (
              <div key={kind} className="space-y-2">
                <Label htmlFor={`file-${kind}`}>{label}</Label>
                                <input
                  id={`file-${kind}`}
                  type="file"
                  className="sr-only"
                  accept={kind === "outros" ? undefined : "image/jpeg,image/png,image/webp,application/pdf"}
                  multiple={Boolean(multiple)}
                  onChange={(event) => handleAttachment(kind, Array.from(event.target.files ?? []))}
                />
                <label
                  htmlFor={`file-${kind}`}
                                    className="flex h-10 w-full cursor-pointer items-center justify-start gap-2 rounded-md border border-input bg-background px-3 text-sm font-normal text-muted-foreground transition-colors hover:bg-secondary"
                >
                  <Paperclip className="size-4 shrink-0" />
                  Anexar documento…
                </label>
                {extracting[kind] ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Identificando dados…</p>
                ) : extractedKinds.includes(kind) ? (
                  <p className="flex items-center gap-2 text-xs text-success"><CheckCircle2 className="size-3.5" />Dados identificados</p>
                ) : files[kind]?.length ? (
                                    <p className="truncate text-xs text-muted-foreground">{files[kind]?.map((file) => file.name).join(", ")}</p>
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

                    {form.person_type === "PJ" && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[#0F2340]">Representantes</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm((current) => ({
                    ...current,
                    representatives: [...current.representatives, {
                      name: "",
                      nationality: "Brasileiro(a)",
                      marital_status: "",
                      profession: "",
                      cpf: "",
                      quality: "representante legal",
                    }],
                  }))}
                >
                  + Adicionar representante
                </Button>
              </div>
              {form.representatives.map((representative, index) => (
                <div key={`${representative.name}-${index}`} className="grid gap-4 sm:grid-cols-2">
                  <Input aria-label={`Nome do representante ${index + 1}`} value={representative.name} onChange={(event) => setForm((current) => ({ ...current, representatives: current.representatives.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) }))} />
                  <Input aria-label={`Nacionalidade do representante ${index + 1}`} value={representative.nationality} onChange={(event) => setForm((current) => ({ ...current, representatives: current.representatives.map((item, itemIndex) => itemIndex === index ? { ...item, nationality: event.target.value } : item) }))} />
                  <Input aria-label={`Estado civil do representante ${index + 1}`} value={representative.marital_status} onChange={(event) => setForm((current) => ({ ...current, representatives: current.representatives.map((item, itemIndex) => itemIndex === index ? { ...item, marital_status: event.target.value } : item) }))} />
                  <Input aria-label={`Profissão do representante ${index + 1}`} value={representative.profession} onChange={(event) => setForm((current) => ({ ...current, representatives: current.representatives.map((item, itemIndex) => itemIndex === index ? { ...item, profession: event.target.value } : item) }))} />
                  <Input aria-label={`CPF do representante ${index + 1}`} value={representative.cpf} onChange={(event) => setForm((current) => ({ ...current, representatives: current.representatives.map((item, itemIndex) => itemIndex === index ? { ...item, cpf: maskCpfCnpj(event.target.value) } : item) }))} />
                  <div className="flex gap-2">
                    <Select value={representative.quality} onValueChange={(value) => setForm((current) => ({ ...current, representatives: current.representatives.map((item, itemIndex) => itemIndex === index ? { ...item, quality: value as Representative["quality"] } : item) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sócio">Sócio</SelectItem>
                        <SelectItem value="representante legal">Representante legal</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm((current) => ({ ...current, representatives: current.representatives.filter((_, itemIndex) => itemIndex !== index) }))}>Remover</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

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
                {form.person_type === "PJ" ? "Razão social" : "Nome completo"} <Pending value={form.name} />
              </Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>

                        {form.person_type === "PJ" && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pj_descricao">Descrição da pessoa jurídica</Label>
                <Textarea id="pj_descricao" rows={3} value={form.pj_descricao} onChange={(e) => set("pj_descricao", e.target.value)} />
              </div>
            )}

            <div className="space-y-2">
                            <Label htmlFor="cpf_cnpj">CPF/CNPJ <Pending value={form.cpf_cnpj} /></Label>
              <Input
                id="cpf_cnpj"
                value={form.cpf_cnpj}
                onChange={(e) => set("cpf_cnpj", maskCpfCnpj(e.target.value))}
              />
            </div>

            <div className="space-y-2">
                            <Label htmlFor="nationality">Nacionalidade <Pending value={form.nationality} /></Label>
              <Input
                id="nationality"
                value={form.nationality}
                onChange={(e) => set("nationality", e.target.value)}
              />
            </div>

            {form.person_type === "PF" && (
              <>
                <div className="space-y-2">
                                    <Label>Estado civil <Pending value={form.marital_status} /></Label>
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
                                    <Label htmlFor="profession">Profissão <Pending value={form.profession} /></Label>
                  <Input
                    id="profession"
                    value={form.profession}
                    onChange={(e) => set("profession", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                                    <Label htmlFor="rg_number">RG <Pending value={form.rg_number} /></Label>
                  <Input
                    id="rg_number"
                    value={form.rg_number}
                    onChange={(e) => set("rg_number", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                                    <Label htmlFor="rg_issuer">Órgão expedidor / UF <Pending value={form.rg_issuer} /></Label>
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

        {showForm && <section className="panel rounded-xl border border-t-[3px] border-t-accent bg-card p-6 text-card-foreground shadow-panel space-y-5">
          <h2 className="text-base font-semibold text-[#0F2340]">Endereço e contato</h2>

          <div className="grid gap-5 sm:grid-cols-6">
            <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="cep">CEP <Pending value={form.cep} /></Label>
              <Input
                id="cep"
                value={form.cep}
                onChange={(e) => set("cep", maskCep(e.target.value))}
                onBlur={(e) => lookupCep(e.target.value)}
              />
              {cepBusy && <p className="text-xs text-muted-foreground">Consultando CEP…</p>}
            </div>
            <div className="space-y-2 sm:col-span-3">
                            <Label htmlFor="street">Logradouro <Pending value={form.street} /></Label>
              <Input
                id="street"
                value={form.street}
                onChange={(e) => set("street", e.target.value)}
              />
            </div>
            <div className="space-y-2">
                            <Label htmlFor="number">Número <Pending value={form.number} /></Label>
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
                            <Label htmlFor="district">Bairro <Pending value={form.district} /></Label>
              <Input
                id="district"
                value={form.district}
                onChange={(e) => set("district", e.target.value)}
              />
            </div>
            <div className="space-y-2">
                            <Label htmlFor="city">Cidade <Pending value={form.city} /></Label>
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
                            <Label htmlFor="phone">Telefone <Pending value={form.phone} /></Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => set("phone", maskPhone(e.target.value))}
              />
            </div>
          </div>
        </section>}

        {showForm && <section className="panel rounded-xl border border-t-[3px] border-t-accent bg-card p-6 text-card-foreground shadow-panel space-y-3">
          <Label htmlFor="notes" className="text-[#0F2340]">Observações</Label>
          <Textarea
            id="notes"
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </section>}

        {showForm && <div className="flex gap-3">
                    <Button type="submit" className="bg-[#0F2340] text-white hover:bg-[#0F2340]/90" disabled={save.isPending}>
                        {save.isPending ? "Salvando…" : "Continuar"}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/">Cancelar</Link>
          </Button>
        </div>}
            </form>}

      {step === 2 && savedClientId ? (
        <section className="panel mt-8 space-y-6 rounded-xl border border-t-[3px] border-t-accent bg-card p-6 text-card-foreground">
          <ObjectClauseField value={objeto} onChange={setObjeto} />
          {form.person_type === "PF" ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={gratuidade} onCheckedChange={(checked) => setGratuidade(checked === true)} />
              Pedir gratuidade de justiça
            </label>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              Voltar
            </Button>
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => navigate({ to: "/clientes/$clientId", params: { clientId: savedClientId } })}
              >
                Pular contrato
              </button>
              <Button
                type="button"
                onClick={() => {
                  if (!objeto.trim()) {
                    toast.error("Preencha o objeto do contrato para continuar.");
                    return;
                  }
                  setStep(3);
                }}
              >
                Continuar
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {savedClientId ? (
        <section className={`panel mt-8 rounded-xl border border-t-[3px] border-t-accent bg-card p-6 text-card-foreground ${step === 3 ? "" : "hidden"}`}>
          <ContractForm
            clientId={savedClientId}
            personType={form.person_type}
            hideObject
            initialObject={objeto}
            initialGratuidade={gratuidade}
            existingContractId={savedContractId ?? undefined}
            submitLabel="Continuar"
            onBack={() => setStep(2)}
            onSaved={(contractId) => {
              setSavedContractId(contractId);
              setStep(4);
            }}
          />
        </section>
      ) : null}

      {step === 4 && savedClientId && savedContractId ? (
                <section className="panel mt-8 rounded-xl border border-t-[3px] border-t-accent bg-card p-6 text-card-foreground">
          <ContractReview
            contractId={savedContractId}
            personType={form.person_type}
            onBack={() => setStep(3)}
            onEditObject={() => setStep(2)}
            onFinish={() => navigate({ to: "/clientes/$clientId", params: { clientId: savedClientId } })}
          />
        </section>
      ) : null}
    </AppShell>
  );
}
