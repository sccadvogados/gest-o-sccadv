import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
 
/** Sócios que podem dividir os honorários de um contrato (divisão sempre em partes iguais). */
export const SOCIOS = [
  { sigla: "TAC", nome: "Tiago Craveiro" },
  { sigla: "RCMT", nome: "Raphael Corradi" },
  { sigla: "ASS", nome: "Alexandre Souza" },
] as const;
 
export const TODOS_SOCIOS: string[] = SOCIOS.map((socio) => socio.sigla);
 
export function SociosField({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  function alternar(sigla: string, marcado: boolean) {
    const proximo = marcado ? [...new Set([...value, sigla])] : value.filter((item) => item !== sigla);
    // Mantém a ordem fixa TAC, RCMT, ASS.
    onChange(TODOS_SOCIOS.filter((item) => proximo.includes(item)));
  }
 
  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>Sócios Envolvidos{value.length === 0 ? <span className="ml-0.5 text-destructive">*</span> : null}</Label>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {SOCIOS.map((socio) => (
          <label key={socio.sigla} className="flex items-center gap-2">
            <Checkbox checked={value.includes(socio.sigla)} onCheckedChange={(checked) => alternar(socio.sigla, checked === true)} />
            {socio.nome} <span className="text-muted-foreground">({socio.sigla})</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value.length > 0
          ? `O saldo do contrato é dividido em partes iguais entre ${value.length === 1 ? "o sócio marcado" : `os ${value.length} sócios marcados`}.`
          : "Marque ao menos um sócio."}
      </p>
    </div>
  );
}
