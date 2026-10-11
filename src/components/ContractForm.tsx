import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/CurrencyInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { officeDatabase } from "@/lib/office-database";
import { buildContractInstallments, formatCurrency, todayISO, type ContractModality } from "@/lib/format";

const CATEGORIES = [
  "(R) Pró-labore",
  "(R) Honorários de Êxito",
  "(R) Honorários de Sucumbência",
] as const;

const PAYMENT_METHODS = ["Cartão", "PIX", "Boleto"] as const;

type PreviewInstallment = {
  number: number;
  amount: number;
  due_date: string;
};

type ContractFormProps = {
  clientId: string;
  personType: "PF" | "PJ";
  onSaved: (contractId: string) => void;
};

export function ContractForm({ clientId, personType, onSaved }: ContractFormProps) {
  
  const [modality, setModality] = useState<ContractModality>("parcelado");
  
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
    const [totalValue, setTotalValue] = useState(0);
  const [count, setCount] = useState("1");
  const [firstDue, setFirstDue] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [successFee, setSuccessFee] = useState("0");
    const [object, setObject] = useState("");
  
  const [gratuidade, setGratuidade] = useState(true);
  const [preview, setPreview] = useState<PreviewInstallment[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    refreshPreview();
  }, [totalValue, count, firstDue, modality]);

  function refreshPreview() {
        const value = totalValue;
    const installmentsCount = Number(count);
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(installmentsCount) || installmentsCount < 1 || !firstDue || modality === "exito") {
      setPreview([]);
      return;
    }
    setPreview(buildContractInstallments(value, installmentsCount, firstDue, modality));
  }

    function updatePreview(index: number, field: "amount" | "due_date", value: number | string) {
    setPreview((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: field === "amount" ? value as number : value } : row));
  }

  const create = useMutation({
    mutationFn: async () => {
            const value = totalValue;
      const installmentsCount = Math.max(1, Number(count));
      const fee = Number(successFee.replace(",", ".")) || 0;
            if (modality !== "exito" && (!Number.isFinite(value) || value <= 0)) throw new Error("Informe um valor válido.");
      if (modality !== "exito" && !Number.isInteger(installmentsCount)) throw new Error("Informe um número inteiro de meses/parcelas.");
      if (modality !== "exito" && !firstDue) throw new Error("Informe o primeiro vencimento.");
      if (modality === "exito" && (fee < 0 || fee > 100)) throw new Error("Informe um percentual de êxito entre 0 e 100.");
      if (modality !== "exito" && preview.length !== installmentsCount) throw new Error("Preencha as condições para gerar a prévia das parcelas.");
      if (modality !== "exito") {
        const expectedTotal = modality === "mensal" ? value * installmentsCount : value;
        const previewTotal = preview.reduce((sum, row) => sum + row.amount, 0);
        if (Math.abs(previewTotal - expectedTotal) > 0.005) {
          throw new Error("A soma das parcelas precisa ser exatamente igual ao total.");
        }
        if (preview.some((row) => !row.due_date || !Number.isFinite(row.amount) || row.amount < 0)) {
          throw new Error("Confira os valores e vencimentos da prévia.");
        }
      }

      const total = modality === "mensal" ? value * installmentsCount : value;
      const { data: contract, error } = await officeDatabase(supabase)
        .from("contracts")
        .insert({
                                        client_id: clientId,
          modality,
          category,
          total_value: modality === "exito" ? 0 : total,
          installments_count: modality === "exito" ? 1 : installmentsCount,
          ...(modality !== "exito" ? { first_due_date: firstDue } : {}),
          payment_method: paymentMethod,
          parte_contraria: parteContraria || null,
          success_fee_percent: fee,
          recurring: modality === "mensal",
          objeto: object || null,
          gratuidade: personType === "PF" ? gratuidade : false,
        })
        .select("id")
        .single();
      if (error) throw error;

      const rows = modality === "exito" ? [] : preview.map((row) => ({
        ...row,
        contract_id: contract.id,
        client_id: clientId,
        payment_method: paymentMethod,
        category,
      }));

      if (rows.length > 0) {
        const { error: instErr } = await supabase.from("installments").insert(rows);
        if (instErr) throw instErr;
      }
      return contract.id;
    },
    onSuccess: (contractId) => {
      queryClient.invalidateQueries({ queryKey: ["contracts", clientId] });
      queryClient.invalidateQueries({ queryKey: ["installments"] });
            toast.success(modality === "exito" ? "Contrato cadastrado." : "Contrato cadastrado e parcelas geradas.");
      onSaved(contractId);
    },
        onError: (error) =>
      toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Erro ao salvar o contrato."),
  });

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        

        <div className="space-y-2">
          <Label>Modalidade</Label>
          <Select value={modality} onValueChange={(value) => setModality(value as ContractModality)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="parcelado">Pró-labore parcelado</SelectItem>
              <SelectItem value="mensal">Pró-labore mensal</SelectItem>
              <SelectItem value="exito">Somente êxito</SelectItem>
            </SelectContent>
          </Select>
        </div>

        

        <div className="space-y-2 sm:col-span-2">
          <Label>Categoria</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {modality !== "exito" ? <div className="space-y-2">
                    <Label htmlFor="total">{modality === "mensal" ? "Valor mensal" : "Valor total"}</Label>
          <CurrencyInput id="total" value={totalValue} onChange={setTotalValue} />
        </div> : null}

        {modality !== "exito" ? <div className="space-y-2">
          <Label htmlFor="count">Número de parcelas</Label>
          <Input id="count" type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
        </div> : null}

        {modality !== "exito" ? <div className="space-y-2">
          <Label htmlFor="firstDue">Primeiro vencimento</Label>
          <Input id="firstDue" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
        </div> : null}

        <div className="space-y-2">
          <Label>Forma de pagamento</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PAYMENT_METHODS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </div>

                

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="new-contract-object">Objeto do contrato</Label>
          <p className="text-sm text-muted-foreground">O objeto do presente contrato é a prestação de serviços advocatícios relativos…</p>
          <Textarea id="new-contract-object" rows={4} value={object} onChange={(e) => setObject(e.target.value)} />
          <p className="text-sm text-muted-foreground">O objeto do presente contrato é a prestação de serviços advocatícios relativos {object}.</p>
        </div>
        {personType === "PF" ? <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox checked={gratuidade} onCheckedChange={(checked) => setGratuidade(checked === true)} />Pedir gratuidade de justiça</label> : null}

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="successFee">% de êxito{modality === "exito" ? " (obrigatório)" : ""}</Label>
          <Input id="successFee" inputMode="decimal" value={successFee} onChange={(e) => setSuccessFee(e.target.value)} />
        </div>
      </div>

      {modality !== "exito" && preview.length > 0 && (
        <div className="space-y-3 rounded-md border border-border p-4">
          <div>
            <h3 className="text-sm font-medium">Prévia das parcelas</h3>
            <p className="text-xs text-muted-foreground">Confira e ajuste os valores e vencimentos antes de salvar.</p>
          </div>
          <div className="space-y-3">
            {preview.map((row, index) => (
              <div key={row.number} className="grid gap-3 sm:grid-cols-[auto_1fr_1fr] sm:items-end">
                <p className="pb-2 text-sm font-medium">{row.number}</p>
                <div className="space-y-1">
                  <Label htmlFor={`preview-amount-${row.number}`}>Valor</Label>
                                    <CurrencyInput id={`preview-amount-${row.number}`} value={row.amount} onChange={(value) => updatePreview(index, "amount", value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`preview-due-${row.number}`}>Vencimento</Label>
                  <Input id={`preview-due-${row.number}`} type="date" value={row.due_date} onChange={(event) => updatePreview(index, "due_date", event.target.value)} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-right text-sm font-medium">Total: {formatCurrency(preview.reduce((sum, row) => sum + row.amount, 0))}</p>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          onClick={() => create.mutate()}
          disabled={create.isPending}
        >
          {create.isPending ? "Salvando…" : "Salvar e gerar parcelas"}
        </button>
      </div>
    </>
  );
}
