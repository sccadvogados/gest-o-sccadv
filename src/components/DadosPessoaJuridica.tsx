import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { officeDatabase } from "@/lib/office-database";

type Representante = {
  id: string;
  nome: string | null;
  cpf: string | null;
  qualidade: string | null;
  nacionalidade: string | null;
  estado_civil: string | null;
  profissao: string | null;
};

function Campo({ label, value, destaque = false }: { label: string; value?: string | null | undefined; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 break-words text-sm ${destaque ? "font-semibold text-[#0F2340]" : ""}`}>{value || "—"}</p>
    </div>
  );
}

const QUALIDADE: Record<string, string> = { "sócio": "Sócio Administrador", "representante legal": "Representante Legal" };

/** Ficha do cliente (aba Dados) para pessoa jurídica: dados da empresa + representantes. */
export function DadosPessoaJuridica({
  clientId,
  cnpj,
  email,
  phone,
  address,
  notes,
}: {
  clientId: string;
  cnpj?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  address?: string | null | undefined;
  notes?: string | null | undefined;
}) {
  const { data: representantes = [] } = useQuery({
    // Fica sob ["client", clientId] para atualizar junto quando o cadastro é editado
    queryKey: ["client", clientId, "representantes"],
    queryFn: async () => {
      const { data, error } = await officeDatabase(supabase)
        .from("cliente_representantes")
        .select("id, nome, cpf, qualidade, nacionalidade, estado_civil, profissao")
        .eq("cliente_id", clientId)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Representante[];
    },
  });

  return (
    <section className="panel mt-6 rounded-xl border border-[#E6D6C4] border-t-[3px] border-t-[#D4A782] bg-white p-6 shadow-panel">
      <h3 className="text-base font-semibold text-[#0F2340]">Pessoa Jurídica</h3>
      <div className="mt-4 grid gap-5 sm:grid-cols-3">
        <Campo label="CNPJ" value={cnpj} />
        <Campo label="E-mail" value={email} />
        <Campo label="Telefone" value={phone} />
        <div className="sm:col-span-3">
          <Campo label="Endereço" value={address} />
        </div>
        {notes ? (
          <div className="sm:col-span-3">
            <Campo label="Observações" value={notes} />
          </div>
        ) : null}
      </div>

      <div className="my-6 h-px bg-[#EEE8DF]" />

      <h3 className="flex items-center gap-2 text-base font-semibold text-[#0F2340]">
        Representantes
        <span className="rounded-full bg-[#F3EEE7] px-2 py-0.5 text-[11px] font-bold text-[#8A5A33]">{representantes.length}</span>
      </h3>
      {representantes.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum representante cadastrado. Use "Editar" para incluir.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {representantes.map((r) => (
            <div key={r.id} className="grid grid-cols-2 gap-4 rounded-lg border border-[#EEE8DF] p-4 sm:grid-cols-3">
              <Campo label="Nome" value={r.nome} destaque />
              <Campo label="Qualidade" value={QUALIDADE[r.qualidade ?? ""] ?? r.qualidade} />
              <Campo label="CPF" value={r.cpf} />
              <Campo label="Nacionalidade" value={r.nacionalidade} />
              <Campo label="Estado Civil" value={r.estado_civil} />
              <Campo label="Profissão" value={r.profissao} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
