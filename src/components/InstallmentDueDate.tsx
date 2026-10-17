import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
 
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
 
/** Vencimento da parcela com edição no próprio lugar (parcelas em aberto e pagas). */
export function InstallmentDueDate({
  installment,
  clientId,
}: {
  installment: { id: string; due_date: string; status: string };
  clientId: string;
}) {
  const queryClient = useQueryClient();
  const atual = String(installment.due_date).slice(0, 10);
  const [editando, setEditando] = useState(false);
  const [data, setData] = useState(atual);
 
  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("installments").update({ due_date: data }).eq("id", installment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts", clientId] });
      queryClient.invalidateQueries({ queryKey: ["installments"] });
      toast.success("Vencimento atualizado.");
      setEditando(false);
    },
    onError: () => toast.error("Não foi possível alterar o vencimento."),
  });
 
  if (installment.status === "Cancelado") return <>{formatDate(installment.due_date)}</>;
 
  if (!editando) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {formatDate(installment.due_date)}
        <button
          type="button"
          aria-label="Editar Vencimento"
          title="Editar Vencimento"
          onClick={() => {
            setData(atual);
            setEditando(true);
          }}
          className="text-muted-foreground hover:text-[#0F2340]"
        >
          <Pencil className="size-3.5" />
        </button>
      </span>
    );
  }
 
  return (
    <span className="inline-flex items-center gap-1.5">
      <Input
        type="date"
        className="h-9 w-[160px] bg-white"
        value={data}
        autoFocus
        onChange={(e) => setData(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && data) salvar.mutate();
          if (e.key === "Escape") setEditando(false);
        }}
      />
      <button
        type="button"
        aria-label="Salvar"
        title="Salvar"
        disabled={!data || data === atual || salvar.isPending}
        onClick={() => salvar.mutate()}
        className="text-[#0F2340] disabled:opacity-40"
      >
        <Check className="size-4" />
      </button>
      <button type="button" aria-label="Cancelar" title="Cancelar" onClick={() => setEditando(false)} className="text-muted-foreground hover:text-destructive">
        <X className="size-4" />
      </button>
    </span>
  );
}
