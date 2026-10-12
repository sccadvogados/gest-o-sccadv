import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CurrencyInput } from "@/components/CurrencyInput";
import { ObjectClauseField } from "@/components/ObjectClauseField";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { officeDatabase } from "@/lib/office-database";
import { buildContractInstallments, formatCurrency, todayISO, type ContractModality } from "@/lib/format";

const CATEGORIES = [
  "(R) Pró-labore",
  "(R) Honorários de Êxito",
  "(R) Honorários de Sucumbência",
] as const;

const PAYMENT_METHODS = ["Cartão", "PIX", "Boleto"] as const;
const CAPTACAO = ["Tráfego Pago", "Indicação", "Parceria", "Prospecção Ativa", "Cliente Recorrente"] as const;

type PreviewInstallment = {
  number: number;
  amount: number;
  due_date: string;
};

type ContractFormProps = {
  clientId: string;
  personType: "PF" | "PJ";
  onSaved: (contractId: string) => void;
  initialObject?: string | undefined;
  initialGratuidade?: boolean | undefined;
  hideObject?: boolean | undefined;
  existingContractId?: string | undefined;
  submitLabel?: string | undefined;
  onBack?: (() => void) | undefined;
  /** No assistente de Novo Cliente: o contrato fica como rascunho (sem número e sem parcelas) até "Finalizar". */
  rascunho?: boolean | undefined;
};

function cleanObject(value: string) {
  return value.trim().replace(/\.+$/, "").trim();
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : (error as { message?: string })?.message ?? fallback;
}

export function ContractForm({
  clientId,
  personType,
  onSaved,
  initialObject,
  initialGratuidade,
  hideObject = false,
  existingContractId,
  submitLabel,
  onBack,
  rascunho = false,
}: ContractFormProps) {
  const [modality, setModality] = useState<ContractModality>("parcelado");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [totalValue, setTotalValue] = useState(0);
  const [count, setCount] = useState("1");
  const [firstDue, setFirstDue] = useState(todayISO());
    const [paymentMethod, setPaymentMethod] = useState<string>(PAYMENT_METHODS[0]);
  const [captacao, setCaptacao] = useState<string>("");
  const [captacaoPercentual, setCaptacaoPercentual] = useState("");
  const temRepasse = captacao === "Indicação" || captacao === "Parceria";
  const [successFee, setSuccessFee] = useState("0");
    const [object, setObject] = useState(initialObject ?? "");
  const [gratuidade, setGratuidade] = useState(initialGratuidade ?? personType === "PF");
  const [preview, setPreview] = useState<PreviewInstallment[]>([]);
  const queryClient = useQueryClient();
  const proBono = modality === "probono";
  const semParcelas = modality === "exito" || proBono;

  useEffect(() => {
    if (!Number.isFinite(totalValue) || totalValue <= 0 || !Number.isInteger(Number(count)) || Number(count) < 1 || !firstDue || semParcelas) {
      setPreview([]);
      return;
    }
    setPreview(buildContractInstallments(totalValue, Number(count), firstDue, modality));
  }, [totalValue, count, firstDue, modality, semParcelas]);

  function updatePreview(index: number, field: "amount" | "due_date", value: number | string) {
    setPreview((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  }

  const save = useMutation({
        mutationFn: async () => {
            const repasse = Number(captacaoPercentual.replace(",", "."));
      if (temRepasse && (!Number.isFinite(repasse) || repasse <= 0 || repasse > 100)) throw new Error("Informe o percentual de repasse entre 0 e 100.");

            const installmentsCount = Math.max(1, Number(count));
      const fee = proBono ? 0 : Number(successFee.replace(",", ".")) || 0;
      const objectToSave = cleanObject(hideObject ? initialObject ?? "" : object);
      const gratuidadeToSave = personType === "PF" ? (hideObject ? initialGratuidade ?? true : gratuidade) : false;

      if (fee < 0 || fee > 100) throw new Error("Informe um percentual de êxito entre 0 e 100.");
      if (modality === "exito") {
        if (fee <= 0) throw new Error("Informe o percentual de êxito.");
      } else if (!proBono) {
        if (!Number.isFinite(totalValue) || totalValue <= 0) throw new Error("Informe um valor válido.");
        if (!Number.isInteger(Number(count)) || Number(count) < 1) throw new Error("Informe um número inteiro de meses/parcelas.");
        if (!firstDue) throw new Error("Informe o primeiro vencimento.");
        if (preview.length !== installmentsCount) throw new Error("Preencha as condições para gerar a prévia das parcelas.");
        const expectedTotal = modality === "mensal" ? totalValue * installmentsCount : totalValue;
        const previewTotal = preview.reduce((sum, row) => sum + row.amount, 0);
        if (Math.abs(previewTotal - expectedTotal) > 0.005) {
          throw new Error("A soma das parcelas precisa ser exatamente igual ao total.");
        }
        if (preview.some((row) => !row.due_date || !Number.isFinite(row.amount) || row.amount < 0)) {
          throw new Error("Confira os valores e vencimentos da prévia.");
        }
      }

            const total = modality === "mensal" ? totalValue * installmentsCount : totalValue;
      const values = {
        modality,
        category,
        total_value: semParcelas ? 0 : total,
        installments_count: semParcelas ? 1 : installmentsCount,
        ...(!semParcelas ? { first_due_date: firstDue } : {}),
        payment_method: proBono ? null : paymentMethod,
        success_fee_percent: fee,
        recurring: modality === "mensal",
        objeto: objectToSave || null,
                gratuidade: gratuidadeToSave,
                captacao: captacao || null,
        captacao_percentual: temRepasse ? repasse : null,
      };

      const parcelasRascunho = semParcelas ? [] : preview.map((row) => ({
        number: row.number,
        amount: row.amount,
        due_date: row.due_date,
        payment_method: paymentMethod,
        category,
      }));

      let contractId: string;
      if (rascunho) {
        // Rascunho: guarda as parcelas no próprio contrato; elas só viram parcelas reais ao finalizar.
        const draftValues = { ...values, rascunho: true, parcelas_rascunho: parcelasRascunho };
        if (existingContractId) {
          const { error } = await officeDatabase(supabase).from("contracts").update(draftValues).eq("id", existingContractId);
          if (error) throw error;
          return existingContractId;
        }
        const { data: contract, error } = await officeDatabase(supabase)
          .from("contracts")
          .insert({ client_id: clientId, ...draftValues })
          .select("id")
          .single();
        if (error) throw error;
        return contract.id;
      }

      if (existingContractId) {
        const { error } = await officeDatabase(supabase).from("contracts").update(values).eq("id", existingContractId);
        if (error) throw error;
        const { error: deleteError } = await supabase.from("installments").delete().eq("contract_id", existingContractId);
        if (deleteError) throw deleteError;
        contractId = existingContractId;
      } else {
        const { data: contract, error } = await officeDatabase(supabase)
          .from("contracts")
          .insert({ client_id: clientId, ...values })
          .select("id")
          .single();
        if (error) throw error;
        contractId = contract.id;
      }

            const rows = semParcelas ? [] : preview.map((row) => ({
        ...row,
        contract_id: contractId,
        client_id: clientId,
        payment_method: paymentMethod,
        category,
      }));
      if (rows.length > 0) {
        const { error: installmentsError } = await supabase.from("installments").insert(rows);
        if (installmentsError) throw installmentsError;
      }
      return contractId;
    },
    onSuccess: (contractId) => {
      queryClient.invalidateQueries({ queryKey: ["contracts", clientId] });
      queryClient.invalidateQueries({ queryKey: ["installments"] });
            if (!rascunho) toast.success(semParcelas ? "Contrato salvo." : "Contrato salvo e parcelas geradas.");
      onSaved(contractId);
    },
    onError: (error) => toast.error(errorMessage(error, "Erro ao salvar o contrato.")),
  });

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Modalidade</Label>
          <Select value={modality} onValueChange={(value) => setModality(value as ContractModality)}>
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
                            <Label htmlFor="total">{modality === "mensal" ? "Valor Mensal" : "Valor Total"}</Label>
              <CurrencyInput id="total" value={totalValue} onChange={setTotalValue} />
            </div>
            <div className="space-y-2">
                            <Label htmlFor="count">Número de Parcelas</Label>
              <Input id="count" type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
            </div>
            <div className="space-y-2">
                            <Label htmlFor="firstDue">Primeiro Vencimento</Label>
              <Input id="firstDue" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
                        </div>
          </>
        ) : null}

        {!proBono ? (
          <div className="space-y-2">
            <Label>Forma de Pagamento</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : null}

                <div className="space-y-2">
          <Label>Forma de Captação (Opcional)</Label>
          <Select value={captacao} onValueChange={(value) => setCaptacao(value === "nenhuma" ? "" : value)}>

            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent><SelectItem value="nenhuma">Nenhuma</SelectItem>{CAPTACAO.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {temRepasse ? (
          <div className="space-y-2">
            <Label htmlFor="captacaoPercentual">% de Repasse da {captacao}{!captacaoPercentual ? <span className="ml-0.5 text-destructive">*</span> : null}</Label>
            <Input id="captacaoPercentual" inputMode="decimal" placeholder="Ex.: 10" value={captacaoPercentual} onChange={(e) => setCaptacaoPercentual(e.target.value)} />
                        <p className="text-xs text-muted-foreground">Percentual dos honorários destinado a quem indicou ou ao parceiro.</p>
          </div>
        ) : null}

        {!proBono ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="successFee">% de êxito{modality === "exito" ? " (obrigatório)" : ""}</Label>
            <Input id="successFee" inputMode="decimal" value={successFee} onChange={(e) => setSuccessFee(e.target.value)} />
          </div>
        ) : null}

        {!hideObject ? (
          <div className="sm:col-span-2">
            <ObjectClauseField value={object} onChange={setObject} />
          </div>
        ) : null}
        {!hideObject && personType === "PF" ? (
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

      {modality !== "exito" && preview.length > 0 ? (
        <div className="mt-4 space-y-3 rounded-md border border-border p-4">
          <div>
            <h3 className="text-sm font-medium">Prévia das Parcelas</h3>
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
      ) : null}

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {onBack ? (
          <Button type="button" variant="outline" onClick={onBack}>Voltar</Button>
        ) : <span />}
        <Button type="button" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Salvando…" : submitLabel ?? "Salvar e gerar parcelas"}
        </Button>
      </div>
    </>
  );
}

