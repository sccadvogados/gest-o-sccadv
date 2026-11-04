import { cartaoDataCredito, cartaoTotalCliente, CARTAO_MAX_PARCELAS, CARTAO_TAXA_FIXA, CARTAO_TAXA_PERCENTUAL, formatCurrency, formatDate } from "@/lib/format";

/** Simulação do cartão (Asaas): taxa repassada ao cliente; escritório recebe as parcelas mês a mês. */
export function CartaoSimulacao({ valor, parcelas, dataPagamento, onParcelas }: { valor: number; parcelas: number; dataPagamento: string; onParcelas: (parcelas: number) => void }) {
  if (!Number.isFinite(valor) || valor <= 0) return null;
  const total = cartaoTotalCliente(valor);
  const linhas = Array.from({ length: CARTAO_MAX_PARCELAS }, (_, index) => index + 1);
  const taxa = `${String(CARTAO_TAXA_PERCENTUAL).replace(".", ",")}% + ${formatCurrency(CARTAO_TAXA_FIXA)}`;
  return (
    <div className="space-y-2 md:col-span-2">
      <p className="text-sm font-medium text-[#0F2340]">Simulação no Cartão</p>
      <div className="overflow-hidden rounded-lg border border-[#ECE7DF] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#F3EEE7] text-xs text-[#0F2340]">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Parcelas</th>
              <th className="px-3 py-2 text-right font-semibold">Total do Cliente</th>
              <th className="px-3 py-2 text-right font-semibold">Parcela</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((n) => {
              const ativa = n === parcelas;
              return (
                <tr key={n} onClick={() => onParcelas(n)} className={`cursor-pointer border-t border-[#F1ECE4] ${ativa ? "bg-[#FBF1EA] font-semibold text-[#8A5A33]" : "hover:bg-accent/40"}`}>
                  <td className="px-3 py-1.5">{`${n}x${ativa ? " ✓" : ""}`}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">{formatCurrency(total)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">{formatCurrency(Math.round((total / n) * 100) / 100)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {`Taxa de ${taxa} repassada ao cliente (valor estimado; o exato aparece no Asaas). O escritório recebe ${parcelas > 1 ? `${parcelas} parcelas mensais de ${formatCurrency(Math.round((valor / parcelas) * 100) / 100)}` : formatCurrency(valor)}${dataPagamento ? `, a 1ª em ${formatDate(cartaoDataCredito(dataPagamento))}` : ", a 1ª 30 dias após o pagamento"}.`}
      </p>
    </div>
  );
}
