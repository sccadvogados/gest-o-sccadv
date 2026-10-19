import { Bell, BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { VAPID_PUBLICA } from "@/lib/vapid";

const db = supabase as unknown as {
  from: (tabela: string) => {
    upsert: (dados: Record<string, unknown>, opcoes: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
    delete: () => { eq: (coluna: string, valor: string) => Promise<{ error: { message: string } | null }> };
  };
};

type Estado = "carregando" | "sem-suporte" | "iphone" | "bloqueado" | "desligado" | "ligado";

function chaveBytes(texto: string) {
  const base = texto.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(base + "=".repeat((4 - (base.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function ehIphone() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Botão para receber no celular o aviso de publicações de clientes (Web Push). */
export function AtivarAvisos() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      // No iPhone o aviso só existe com o app instalado na Tela de Início.
      setEstado(ehIphone() ? "iphone" : "sem-suporte");
      return;
    }
    if (Notification.permission === "denied") {
      setEstado("bloqueado");
      return;
    }
    void navigator.serviceWorker.ready
      .then((registro) => registro.pushManager.getSubscription())
      .then((inscricao) => setEstado(inscricao && Notification.permission === "granted" ? "ligado" : "desligado"))
      .catch(() => setEstado("desligado"));
  }, []);

  async function ativar() {
    setOcupado(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        toast.error("Permissão de notificação não concedida.");
        return;
      }
      const registro = await navigator.serviceWorker.ready;
      const inscricao =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(VAPID_PUBLICA) }));
      const json = inscricao.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const { data } = await supabase.auth.getUser();
      const { error } = await db.from("push_inscricoes").upsert(
        {
          user_id: data.user?.id,
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          aparelho: navigator.userAgent.slice(0, 200),
        },
        { onConflict: "endpoint" },
      );
      if (error) throw new Error(error.message);
      setEstado("ligado");
      toast.success("Avisos ativados neste aparelho.");
    } catch (erro) {
      toast.error(erro instanceof Error ? `Não foi possível ativar os avisos: ${erro.message}` : "Não foi possível ativar os avisos.");
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    if (!window.confirm("Desativar os avisos de publicações neste aparelho?")) return;
    setOcupado(true);
    try {
      const registro = await navigator.serviceWorker.ready;
      const inscricao = await registro.pushManager.getSubscription();
      if (inscricao) {
        await db.from("push_inscricoes").delete().eq("endpoint", inscricao.endpoint);
        await inscricao.unsubscribe();
      }
      setEstado("desligado");
      toast.success("Avisos desativados neste aparelho.");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "carregando" || estado === "sem-suporte") return null;

  if (estado === "ligado") {
    return (
      <Button type="button" variant="ghost" size="sm" className="h-9 text-[#8A5A33]" disabled={ocupado} onClick={desativar} title="Avisos de publicações ativos neste aparelho">
        <BellRing className="size-4" />
        <span className="sm:hidden">Ativos</span>
        <span className="hidden sm:inline">Avisos Ativos</span>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9"
      disabled={ocupado}
      onClick={() => {
        if (estado === "iphone") {
          toast.info("No iPhone, instale o app na Tela de Início (Compartilhar › Adicionar à Tela de Início), abra por lá e toque em Ativar Avisos.");
        } else if (estado === "bloqueado") {
          toast.info("As notificações estão bloqueadas para este app. Libere nos ajustes do aparelho ou do navegador e tente de novo.");
        } else {
          void ativar();
        }
      }}
    >
      <Bell className="size-4" />
      <span className="sm:hidden">Avisos</span>
      <span className="hidden sm:inline">Ativar Avisos</span>
    </Button>
  );
}
