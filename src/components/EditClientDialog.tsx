import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PencilLine } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { maskCep, maskCpfCnpj, maskPhone, onlyDigits } from "@/lib/format";

type ClientForm = {
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

const MARITAL = [
  "Solteiro(a)",
  "Casado(a)",
  "Divorciado(a)",
  "Viúvo(a)",
  "União estável",
];

function clientToForm(client: Record<string, unknown>): ClientForm {
  return {
    person_type: client["person_type"] === "PJ" ? "PJ" : "PF",
    name: String(client["name"] ?? ""),
    nationality: String(client["nationality"] ?? ""),
    marital_status: String(client["marital_status"] ?? ""),
    profession: String(client["profession"] ?? ""),
    rg_number: String(client["rg_number"] ?? ""),
    rg_issuer: String(client["rg_issuer"] ?? ""),
    cpf_cnpj: String(client["cpf_cnpj"] ?? ""),
    cep: String(client["cep"] ?? ""),
    street: String(client["street"] ?? ""),
    number: String(client["number"] ?? ""),
    complement: String(client["complement"] ?? ""),
    district: String(client["district"] ?? ""),
    city: String(client["city"] ?? ""),
    state: String(client["state"] ?? ""),
    email: String(client["email"] ?? ""),
    phone: String(client["phone"] ?? ""),
    notes: String(client["notes"] ?? ""),
  };
}

export function EditClientDialog({
  clientId,
  client,
}: {
  clientId: string;
  client: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ClientForm>(() => clientToForm(client));
  const [cepBusy, setCepBusy] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) setForm(clientToForm(client));
  }, [client, open]);

    const set = <K extends keyof ClientForm,>(key: K, value: ClientForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function lookupCep(value: string) {
    const digits = onlyDigits(value);
    if (digits.length !== 8) return;
    setCepBusy(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = (await response.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (data.erro) throw new Error("CEP não encontrado.");
      setForm((current) => ({
        ...current,
        street: data.logradouro ?? current.street,
        district: data.bairro ?? current.district,
        city: data.localidade ?? current.city,
        state: data.uf ?? current.state,
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível consultar o CEP agora.");
    } finally {
      setCepBusy(false);
    }
  }

  const update = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome completo ou a razão social.");
      const documentDigits = onlyDigits(form.cpf_cnpj);
      if (documentDigits && documentDigits.length !== 11 && documentDigits.length !== 14) {
        throw new Error("Informe um CPF ou CNPJ válido.");
      }
      if (form.cep && onlyDigits(form.cep).length !== 8) {
        throw new Error("Informe um CEP válido.");
      }
      const { error } = await supabase.from("clients").update(form).eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Dados do cliente atualizados.");
      setOpen(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o cliente."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PencilLine className="size-4" />
          Editar dados
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar dados do cliente</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-4">
            <h3 className="text-sm font-semibold">Qualificação</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tipo de pessoa</Label>
                <Select value={form.person_type} onValueChange={(value) => set("person_type", value as "PF" | "PJ")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PF">Pessoa física</SelectItem>
                    <SelectItem value="PJ">Pessoa jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-name">{form.person_type === "PJ" ? "Razão social" : "Nome completo"}</Label>
                <Input id="edit-name" value={form.name} onChange={(event) => set("name", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cpf">CPF/CNPJ</Label>
                <Input id="edit-cpf" value={form.cpf_cnpj} onChange={(event) => set("cpf_cnpj", maskCpfCnpj(event.target.value))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-nationality">Nacionalidade</Label>
                <Input id="edit-nationality" value={form.nationality} onChange={(event) => set("nationality", event.target.value)} />
              </div>
              {form.person_type === "PF" && (
                <>
                  <div className="space-y-2">
                    <Label>Estado civil</Label>
                    <Select value={form.marital_status} onValueChange={(value) => set("marital_status", value)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{MARITAL.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label htmlFor="edit-profession">Profissão</Label><Input id="edit-profession" value={form.profession} onChange={(event) => set("profession", event.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="edit-rg">RG (número)</Label><Input id="edit-rg" value={form.rg_number} onChange={(event) => set("rg_number", event.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="edit-rg-issuer">Órgão expedidor / UF</Label><Input id="edit-rg-issuer" value={form.rg_issuer} onChange={(event) => set("rg_issuer", event.target.value)} /></div>
                </>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-sm font-semibold">Endereço e contato</h3>
            <div className="grid gap-4 sm:grid-cols-6">
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="edit-cep">CEP</Label><Input id="edit-cep" value={form.cep} onChange={(event) => set("cep", maskCep(event.target.value))} onBlur={(event) => lookupCep(event.target.value)} />{cepBusy && <p className="text-xs text-muted-foreground">Consultando CEP…</p>}</div>
              <div className="space-y-2 sm:col-span-3"><Label htmlFor="edit-street">Logradouro</Label><Input id="edit-street" value={form.street} onChange={(event) => set("street", event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="edit-number">Número</Label><Input id="edit-number" value={form.number} onChange={(event) => set("number", event.target.value)} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="edit-complement">Complemento</Label><Input id="edit-complement" value={form.complement} onChange={(event) => set("complement", event.target.value)} /></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="edit-district">Bairro</Label><Input id="edit-district" value={form.district} onChange={(event) => set("district", event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="edit-city">Cidade</Label><Input id="edit-city" value={form.city} onChange={(event) => set("city", event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="edit-state">UF</Label><Input id="edit-state" maxLength={2} value={form.state} onChange={(event) => set("state", event.target.value.toUpperCase())} /></div>
              <div className="space-y-2 sm:col-span-3"><Label htmlFor="edit-email">E-mail</Label><Input id="edit-email" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} /></div>
              <div className="space-y-2 sm:col-span-3"><Label htmlFor="edit-phone">Telefone</Label><Input id="edit-phone" value={form.phone} onChange={(event) => set("phone", maskPhone(event.target.value))} /></div>
            </div>
          </section>

          <section className="space-y-2"><Label htmlFor="edit-notes">Observações</Label><Textarea id="edit-notes" rows={3} value={form.notes} onChange={(event) => set("notes", event.target.value)} /></section>
        </div>

        <DialogFooter>
          <Button onClick={() => update.mutate()} disabled={update.isPending}>
            {update.isPending ? "Salvando…" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
