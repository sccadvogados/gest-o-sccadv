import { FileDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useFechamentos } from "@/components/FecharMes";
import { Button } from "@/components/ui/button";
import { todayISO } from "@/lib/format";
import { gerarRelatorioMes, type LancamentoRelatorio } from "@/lib/relatorio-mes";

/** Botão "Relatório do Mês": baixa o PDF de prestação de contas do mês escolhido no Livro-Caixa. */
export function RelatorioMes({ periodo, nomePeriodo, lancamentos }: { periodo: string; nomePeriodo: string; lancamentos: LancamentoRelatorio[] }) {
  const [gerando, setGerando] = useState(false);
  const { data: fechamentos } = useFechamentos();
  if (periodo.length !== 7) return null;
  const fechamento = (fechamentos ?? []).find((item) => String(item.mes).slice(0, 7) === periodo);

  async function baixar() {
    setGerando(true);
    try {
      const { doc, nomeArquivo } = await gerarRelatorioMes({ periodo, nomePeriodo, lancamentos, fechamento, hoje: todayISO() });
      doc.save(nomeArquivo);
    } catch {
      toast.error("Não foi possível gerar o relatório.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <Button variant="outline" onClick={baixar} disabled={gerando} title={fechamento ? undefined : "O mês ainda está aberto: o relatório sai como prévia."}>
      <FileDown className="size-4" />
      {gerando ? "Gerando…" : "Relatório do Mês"}
    </Button>
  );
}
