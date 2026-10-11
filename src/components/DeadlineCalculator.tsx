import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DeadlineCalculatorProps = {
  holidays: string[];
  onUseDate: (date: string) => void;
};

function shiftDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date.toISOString().slice(0, 10);
}

function isRecess(date: string) {
  const monthDay = date.slice(5);
  return monthDay >= "12-20" || monthDay <= "01-20";
}

function formatResult(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "long",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function DeadlineCalculator({ holidays, onUseDate }: DeadlineCalculatorProps) {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [days, setDays] = useState("");
  const [mode, setMode] = useState<"uteis" | "corridos">("uteis");

  const result = useMemo(() => {
    const amount = Number(days);
    if (!startDate || !Number.isInteger(amount) || amount < 0) return "";
    if (mode === "corridos") return shiftDate(startDate, amount);

    const holidaySet = new Set(holidays);
    const isBusinessDay = (date: string) => {
      const day = new Date(`${date}T12:00:00`).getDay();
      return day !== 0 && day !== 6 && !holidaySet.has(date) && !isRecess(date);
    };
    let current = startDate;
    let counted = 0;
    while (counted < amount) {
      current = shiftDate(current, 1);
      if (isBusinessDay(current)) counted += 1;
    }
    while (!isBusinessDay(current)) current = shiftDate(current, 1);
    return current;
  }, [days, holidays, mode, startDate]);

  return <div className="rounded-lg border bg-muted/20 p-3">
    <button type="button" className="flex w-full items-center justify-between text-left text-sm font-semibold" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span>Calculadora de prazo</span><ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open ? <div className="mt-4 grid gap-3">
      <div className="grid gap-2"><Label>Data da intimação/publicação</Label><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
      <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label>Nº de dias</Label><Input type="number" min="0" step="1" value={days} onChange={(event) => setDays(event.target.value)} /></div><div className="grid gap-2"><Label>Contagem</Label><Select value={mode} onValueChange={(value: "uteis" | "corridos") => setMode(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="uteis">Dias úteis</SelectItem><SelectItem value="corridos">Dias corridos</SelectItem></SelectContent></Select></div></div>
      {result ? <div className="rounded-md border bg-background p-3"><p className="text-sm font-semibold">Resultado: {formatResult(result)}</p><p className="mt-2 text-xs text-muted-foreground">Cálculo auxiliar — confira o prazo no sistema do tribunal</p><Button type="button" className="mt-3" variant="outline" onClick={() => onUseDate(result)}>Usar como data</Button></div> : null}
    </div> : null}
  </div>;
}
