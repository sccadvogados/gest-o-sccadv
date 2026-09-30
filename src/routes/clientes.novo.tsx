import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { maskCep, maskCpfCnpj, maskPhone, onlyDigits } from "@/lib/format";

export const Route = createFileRoute("/clientes/novo")({
  head: () => ({
    meta: [
      { title: "Novo cliente — SCC Advogados" },
      {
        name: "description",
        content:
          "Cadastro completo da qualificação do cliente e envio dos documentos no escritório SCC Advogados.",
      },
      { property: "og:title", content: "Novo cliente — SCC Advogados" },
      {
        property: "og:description",
        content: "Qualificação completa, endereço e anexos do cliente.",
      },
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

const ATTACHMENTS = [
  { kind: "identificacao", label: "Documento de Identificação" },
  { kind: "residencia", label: "Comprovante de Residência" },
  { kind: "outros", label: "Outros Documentos", multiple: true },
] as const;

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
  const [cepBusy, setCepBusy] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

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

      <h1 className="mt-4 text-2xl">Novo cliente</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Preencha a qualificação completa — os dados alimentam as minutas do escritório.
      </p>

      <form
        className="mt-8 space-y-8"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <section className="panel space-y-5 p-6">
          <h2 className="text-base font-semibold">Qualificação</h2>

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
        </section>

        <section className="panel space-y-5 p-6">
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
        </section>

        <section className="panel space-y-5 p-6">
          <h2 className="text-base font-semibold">Anexos</h2>
          <div className="grid gap-5 sm:grid-cols-3">
            {ATTACHMENTS.map(({ kind, label, multiple }) => (
              <div key={kind} className="space-y-2">
                <Label htmlFor={`file-${kind}`}>{label}</Label>
                <Input
                  id={`file-${kind}`}
                  type="file"
                  multiple={Boolean(multiple)}
                  onChange={(e) =>
                    setFiles((prev) => ({
                      ...prev,
                      [kind]: Array.from(e.target.files ?? []),
                    }))
                  }
                />
                {files[kind]?.length ? (
                  <p className="text-xs text-muted-foreground">
                    {files[kind]!.length} arquivo(s) selecionado(s)
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="panel space-y-3 p-6">
          <Label htmlFor="notes">Observações</Label>
          <Textarea
            id="notes"
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </section>

        <div className="flex gap-3">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar cliente"}
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/">Cancelar</Link>
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
