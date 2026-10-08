import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/agenda")({
  head: () => ({
    meta: [{ title: "Agenda | Gestão Administrativa | SCC Adv" }],
  }),
  component: AgendaPage,
});

function AgendaPage() {
  return (
    <AppShell>
      <h1 className="text-2xl">Agenda</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Prazos, audiências, reuniões e compromissos.
      </p>
    </AppShell>
  );
}
