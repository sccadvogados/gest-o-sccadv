import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { officeDatabase } from "@/lib/office-database";
import { listGoogleCalendarEvents } from "@/lib/googleCalendarImport";
import { buildGoogleImportPreview, type GoogleImportPreviewRow } from "@/lib/googleCalendarImportPreview";

function defaultDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  date.setUTCDate(date.getUTCDate() - 30);
  return date.toISOString().slice(0, 10);
}

export function GoogleCalendarImportDialog({ onImported }: { onImported: () => void | Promise<void> }) {
  const fetchGoogleEvents = useServerFn(listGoogleCalendarEvents);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultDate);
  const [rows, setRows] = useState<GoogleImportPreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<{ imported: number; ignored: number; warnings: number } | null>(null);

  useEffect(() => {
    supabase.rpc("is_admin").then(({ data }) => {
      setIsAdmin(data === true);
      setAdminChecked(true);
    });
  }, []);

  if (!adminChecked || !isAdmin) return null;

  async function previewImport() {
    setLoading(true);
    try {
      const [{ data: clients, error: clientsError }, { data: existing, error: existingError }, googleEvents] = await Promise.all([
        supabase.from("clients").select("id, name").order("name"),
        supabase.from("eventos").select("google_event_id"),
        fetchGoogleEvents({ data: { from } }),
      ]);
      if (clientsError) throw clientsError;
      if (existingError) throw existingError;
      setRows(buildGoogleImportPreview(googleEvents, clients ?? [], existing ?? []));
      setSummary(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o Google Agenda.");
    } finally {
      setLoading(false);
    }
  }

  async function importSelected() {
    const selected = rows.filter((row) => row.selecionado);
    if (selected.length === 0) return;
    setImporting(true);
    try {
      const candidates = selected.filter((row) => !row.jaImportado);
      const { error } = await officeDatabase(supabase).from("eventos").insert(candidates.map((row) => ({
        cliente_id: row.clienteId,
                data_inicio: row.tipo === "reunião" ? row.dataInicio : row.prazo,
        data_fim: row.tipo === "reunião" ? row.dataFim : null,
        dia_inteiro: row.tipo === "reunião" ? false : true,
        google_event_id: row.googleId,
        numero_processo: row.processo || null,
        parte_contraria: row.parteContraria || null,
        responsavel: row.responsavel || null,
        status: "pendente",
        tipo: row.tipo,
        titulo: row.titulo || row.googleId,
      })));
      if (error) throw error;
      const warnings = rows.filter((row) => row.aviso).length;
      setSummary({ imported: candidates.length, ignored: selected.length - candidates.length, warnings });
      await onImported();
      setOpen(false);
      toast.success("Importação concluída.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar os eventos.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Importar do Google</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-[95vw] overflow-y-auto xl:max-w-7xl">
        <DialogHeader><DialogTitle>Importar do Google Agenda</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Nenhum evento será gravado nesta etapa.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-2 text-sm font-medium">
            A partir de
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <Button onClick={() => void previewImport()} disabled={loading || !from}>
            {loading ? "Lendo agenda…" : "Mostrar prévia"}
          </Button>
          {rows.length > 0 ? (
            <Button onClick={() => void importSelected()} disabled={importing || rows.every((row) => !row.selecionado)}>
              {importing ? "Importando…" : "Importar selecionados"}
            </Button>
          ) : null}
        </div>
        {summary ? <p className="text-sm text-muted-foreground">Importados: {summary.imported} · Ignorados: {summary.ignored} · Com aviso: {summary.warnings}</p> : null}
        <div className="overflow-auto rounded-md border">
          {rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">Escolha a data e mostre a prévia para carregar os eventos.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead><Checkbox checked={rows.length > 0 && rows.filter((row) => !row.jaImportado).every((row) => row.selecionado)} disabled={rows.every((row) => row.jaImportado)} onCheckedChange={(checked) => setRows((current) => current.map((row) => row.jaImportado ? row : { ...row, selecionado: checked === true }))} /> Selecionar</TableHead><TableHead>Tipo</TableHead><TableHead>Título</TableHead><TableHead>Processo</TableHead><TableHead>Cliente</TableHead><TableHead>Parte contrária</TableHead><TableHead>Responsável</TableHead><TableHead>Prazo</TableHead><TableHead>Horário</TableHead><TableHead>Aviso</TableHead></TableRow></TableHeader>
              <TableBody>{rows.map((row) => <TableRow key={row.googleId}><TableCell><Checkbox checked={row.selecionado} disabled={row.jaImportado} onCheckedChange={(checked) => setRows((current) => current.map((item) => item.googleId === row.googleId ? { ...item, selecionado: checked === true } : item))} /></TableCell><TableCell>{row.tipo}</TableCell><TableCell>{row.titulo || "—"}</TableCell><TableCell>{row.processo || "—"}</TableCell><TableCell>{row.cliente || "—"}{row.cliente && !row.clienteId ? <div className="text-xs text-destructive">cliente não encontrado</div> : null}</TableCell><TableCell>{row.parteContraria || "—"}</TableCell><TableCell>{row.responsavel || "—"}</TableCell><TableCell>{row.prazo || "—"}</TableCell><TableCell>{["reunião", "audiência", "julgamento"].includes(row.tipo) ? `${row.dataInicio} – ${row.dataFim}` : "—"}</TableCell><TableCell className="text-destructive">{row.aviso || "—"}</TableCell></TableRow>)}</TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
