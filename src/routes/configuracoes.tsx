import { useServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { listGoogleCalendarEvents } from "@/lib/googleCalendarImport";
import { buildGoogleImportPreview, type GoogleImportPreviewRow } from "@/lib/googleCalendarImportPreview";

export const Route = createFileRoute("/configuracoes")({ component: SettingsPage });

function defaultDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().slice(0, 10);
}

function SettingsPage() {
  const fetchGoogleEvents = useServerFn(listGoogleCalendarEvents);
  const [from, setFrom] = useState(defaultDate);
  const [rows, setRows] = useState<GoogleImportPreviewRow[]>([]);
  const [loading, setLoading] = useState(false);

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
      const { error } = await supabase.from("eventos").insert(candidates.map((row) => ({
        cliente_id: row.clienteId,
        data_inicio: row.prazoFatal || row.prazoInterno,
        dia_inteiro: true,
        google_event_id: row.googleId,
        numero_processo: row.processo || null,
        parte_contraria: row.parteContraria || null,
        prazo_fatal: row.prazoFatal || null,
        prazo_interno: row.prazoInterno || null,
        responsavel: row.responsavel || null,
        status: "pendente",
        tipo: row.tipo,
        titulo: row.titulo || row.googleId,
      })));
      if (error) throw error;
      const warnings = rows.filter((row) => row.aviso).length;
      setSummary({ imported: candidates.length, ignored: selected.length - candidates.length, warnings });
      toast.success("Importação concluída.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar os eventos.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Configurações</h1>
          <p className="mt-1 text-sm text-muted-foreground">Prévia administrativa da importação do Google Agenda.</p>
        </div>
      </div>
      <section className="panel mt-6 p-6">
        <h2 className="font-semibold">Importar do Google Agenda</h2>
        <p className="mt-1 text-sm text-muted-foreground">Nenhum evento será gravado nesta etapa.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
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
        {summary ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Importados: {summary.imported} · Ignorados: {summary.ignored} · Com aviso: {summary.warnings}
          </p>
        ) : null
        </div>
      </section>
      <div className="panel mt-6 overflow-auto">
        {rows.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">Escolha a data e mostre a prévia para carregar os eventos.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Título</TableHead><TableHead>Processo</TableHead><TableHead>Cliente</TableHead><TableHead>Parte contrária</TableHead><TableHead>Responsável</TableHead><TableHead>Prazo</TableHead><TableHead>Aviso</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((row) => <TableRow key={row.googleId}><TableCell>{row.tipo}</TableCell><TableCell>{row.titulo || "—"}</TableCell><TableCell>{row.processo || "—"}</TableCell><TableCell>{row.cliente || "—"}{row.cliente && !row.clienteId ? <div className="text-xs text-destructive">cliente não encontrado</div> : null}</TableCell><TableCell>{row.parteContraria || "—"}</TableCell><TableCell>{row.responsavel || "—"}</TableCell><TableCell>{row.prazoFatal || row.prazoInterno || "—"}</TableCell><TableCell className="text-destructive">{row.aviso || "—"}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
      </div>
    </AppShell>
  );
}
