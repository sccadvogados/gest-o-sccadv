import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AgendaScreen } from "@/components/AgendaScreen";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda | Gestão Administrativa | SCC Adv" },
      {
        name: "description",
        content: "Prazos, audiências, reuniões e compromissos do escritório.",
      },
    ],
  }),
  component: AgendaPage,
});

type EventType = "prazo" | "audiencia" | "reuniao" | "compromisso";

type AgendaEvent = {
  id: string;
  tipo: EventType;
  titulo: string;
  descricao: string | null;
  cliente_id: string | null;
  contrato_id: string | null;
  numero_processo: string | null;
  orgao_vara: string | null;
  data_inicio: string;
};

type EventForm = {
  tipo: EventType;
  titulo: string;
  descricao: string;
  cliente_id: string;
  contrato_id: string;
  numero_processo: string;
  orgao_vara: string;
  data_inicio: string;
};

const emptyForm: EventForm = {
  tipo: "prazo",
  titulo: "",
  descricao: "",
  cliente_id: "",
  contrato_id: "",
  numero_processo: "",
  orgao_vara: "",
  data_inicio: "",
};

const typeLabels: Record<EventType, string> = {
  prazo: "Prazo",
  audiencia: "Audiência",
  reuniao: "Reunião",
  compromisso: "Compromisso",
};

function AgendaPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"todos" | EventType>("todos");
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [open, setOpen] = useState(false);

  const { data: events, isLoading } = useQuery({
    queryKey: ["agenda-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("eventos" as never)
        .select("id, tipo, titulo, descricao, cliente_id, contrato_id, numero_processo, orgao_vara, data_inicio")
        .order("data_inicio");
      if (error) throw error;
      return (data ?? []) as unknown as AgendaEvent[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["agenda-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const createEvent = useMutation({
    mutationFn: async (values: EventForm) => {
      const { error } = await supabase.from("eventos" as never).insert({
        tipo: values.tipo,
        titulo: values.titulo.trim(),
        descricao: values.descricao.trim() || null,
        cliente_id: values.cliente_id || null,
        contrato_id: values.contrato_id || null,
        numero_processo: values.numero_processo.trim() || null,
        orgao_vara: values.orgao_vara.trim() || null,
        data_inicio: values.data_inicio,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda-events"] });
      setForm(emptyForm);
      setOpen(false);
      toast.success("Evento criado na agenda.");
    },
    onError: () => toast.error("Não foi possível criar o evento."),
  });

  const filteredEvents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (events ?? []).filter((event) => {
      const matchesType = typeFilter === "todos" || event.tipo === typeFilter;
      const matchesSearch = !normalizedSearch || [
        event.titulo,
        event.descricao,
        event.numero_processo,
        event.orgao_vara,
      ].some((value) => value?.toLowerCase().includes(normalizedSearch));
      return matchesType && matchesSearch;
    });
  }, [events, search, typeFilter]);

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Agenda</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize prazos, audiências, reuniões e compromissos.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Novo evento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Novo evento</DialogTitle>
            </DialogHeader>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!form.titulo.trim() || !form.data_inicio) {
                  toast.error("Informe o título e a data do evento.");
                  return;
                }
                createEvent.mutate(form);
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tipo">
                  <Select value={form.tipo} onValueChange={(value: EventType) => setForm((current) => ({ ...current, tipo: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(typeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Data e hora">
                  <Input type="datetime-local" value={form.data_inicio} onChange={(event) => setForm((current) => ({ ...current, data_inicio: event.target.value }))} />
                </Field>
              </div>
              <Field label="Título">
                <Input value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} placeholder="Ex.: Audiência de instrução" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Cliente">
                  <Select value={form.cliente_id || "none"} onValueChange={(value) => setForm((current) => ({ ...current, cliente_id: value === "none" ? "" : value }))}>
                    <SelectTrigger><SelectValue placeholder="Sem cliente vinculado" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem cliente vinculado</SelectItem>
                      {(clients ?? []).map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Órgão / vara">
                  <Input value={form.orgao_vara} onChange={(event) => setForm((current) => ({ ...current, orgao_vara: event.target.value }))} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Número do processo">
                  <Input value={form.numero_processo} onChange={(event) => setForm((current) => ({ ...current, numero_processo: event.target.value }))} placeholder="0000000-00.0000.0.00.0000" />
                </Field>
                <Field label="ID do contrato (opcional)">
                  <Input value={form.contrato_id} onChange={(event) => setForm((current) => ({ ...current, contrato_id: event.target.value }))} />
                </Field>
              </div>
              <Field label="Descrição">
                <Textarea value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} rows={4} />
              </Field>
              <DialogFooter>
                <Button type="submit" disabled={createEvent.isPending}>{createEvent.isPending ? "Salvando…" : "Salvar evento"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar na agenda…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={(value: "todos" | EventType) => setTypeFilter(value)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {Object.entries(typeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="panel mt-6 overflow-hidden">
        {isLoading ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">Carregando agenda…</p>
        ) : filteredEvents.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <CalendarDays className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Nenhum evento encontrado.</p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredEvents.map((event) => (
              <article key={event.id} className="flex flex-wrap items-start justify-between gap-4 px-6 py-5">
                <div className="flex min-w-0 gap-4">
                  <div className="min-w-28 text-sm text-muted-foreground">{formatDate(event.data_inicio)}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">{event.titulo}</h2>
                      <Badge variant="secondary">{typeLabels[event.tipo]}</Badge>
                    </div>
                    {event.descricao && <p className="mt-1 text-sm text-muted-foreground">{event.descricao}</p>}
                    {(event.numero_processo || event.orgao_vara) && <p className="mt-2 text-xs text-muted-foreground">{[event.numero_processo, event.orgao_vara].filter(Boolean).join(" · ")}</p>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label>{label}</Label>{children}</div>;
}
