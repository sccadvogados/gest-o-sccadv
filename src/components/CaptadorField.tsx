import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { maskCpfCnpj } from "@/lib/format";

// Tabela nova (captadores) ainda não está nos tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

export type Captador = { id: string; nome: string; documento: string };

export function useCaptadores() {
  return useQuery({
    queryKey: ["captadores"],
    queryFn: async () => {
      const { data, error } = await db.from("captadores").select("id, nome, documento").order("nome");
      if (error) throw error;
      return (data ?? []) as Captador[];
    },
  });
}

/** Nome do captador/parceiro de um contrato (para exibir na ficha). */
export function CaptadorNome({ id }: { id: string | null | undefined }) {
  const { data } = useCaptadores();
  const captador = (data ?? []).find((item) => item.id === id);
  return captador ? <>{captador.nome}</> : null;
}

/** Quem indicou o cliente (Indicação) ou o parceiro (Parceria): escolhe do cadastro ou cadastra na hora. */
export function CaptadorField({
  tipo,
  value,
  onChange,
}: {
  tipo: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: captadores } = useCaptadores();
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const rotulo = tipo === "Parceria" ? "Parceria" : "Captador";

  const cadastrar = useMutation({
    mutationFn: async () => {
      const digitos = documento.replace(/\D/g, "");
      if (!nome.trim()) throw new Error("Informe o nome.");
      if (digitos.length !== 11 && digitos.length !== 14) throw new Error("Informe um CPF ou CNPJ válido.");
      const existente = (captadores ?? []).find((item) => item.documento === digitos);
      if (existente) return existente;
      const { data, error } = await db.from("captadores").insert({ nome: nome.trim(), documento: digitos }).select("id, nome, documento").single();
      if (error) throw error;
      return data as Captador;
    },
    onSuccess: (captador) => {
      queryClient.invalidateQueries({ queryKey: ["captadores"] });
      onChange(captador.id);
      setNovo(false);
      setNome("");
      setDocumento("");
      toast.success(`${rotulo} cadastrado.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar."),
  });

  return (
    <div className="space-y-2">
      <Label>
        {rotulo}
        {!value ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {!novo ? (
        <div className="flex flex-wrap items-center gap-2">
          {(captadores ?? []).length > 0 ? (
            <div className="min-w-0 flex-1">
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(captadores ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>{`${item.nome} · ${maskCpfCnpj(item.documento)}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => setNovo(true)}>
            <Plus className="size-4" /> {tipo === "Parceria" ? "Adicionar Parceria" : "Adicionar Captador"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="captador-nome">Nome</Label>
              <Input id="captador-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="captador-doc">CPF/CNPJ</Label>
              <Input id="captador-doc" inputMode="numeric" value={maskCpfCnpj(documento)} onChange={(e) => setDocumento(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setNovo(false)}>Cancelar</Button>
            <Button type="button" size="sm" disabled={cadastrar.isPending} onClick={() => cadastrar.mutate()}>Cadastrar</Button>
          </div>
        </div>
      )}
    </div>
  );
}
