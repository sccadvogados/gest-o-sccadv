import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { officeDatabase } from "@/lib/office-database";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar | Gestão Administrativa | SCC Adv" },
      {
        name: "description",
        content: "Acesso restrito à Gestão Administrativa do escritório Souza, Craveiro & Corradi Advogados: clientes, contratos e financeiro.",
      },
      { property: "og:title", content: "Entrar | Gestão Administrativa | SCC Adv" },
      {
        property: "og:description",
        content: "Acesso restrito à Gestão Administrativa do escritório Souza, Craveiro & Corradi Advogados: clientes, contratos e financeiro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Entrar | Gestão Administrativa | SCC Adv" },
      {
        name: "twitter:description",
        content: "Acesso restrito à Gestão Administrativa do escritório Souza, Craveiro & Corradi Advogados: clientes, contratos e financeiro.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

    useEffect(() => {
    const message = sessionStorage.getItem("scc-access-denied-message");
    if (!message) return;

    sessionStorage.removeItem("scc-access-denied-message");
    toast.error(message);
  }, []);

  useEffect(() => {
    if (loading || !user) return;

    let cancelled = false;
    async function verifyAccountAccess() {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
            if (error || !data.user) return;

            const { data: active, error: activeError } = await officeDatabase(supabase).rpc("is_ativo");
            if (activeError || active !== true) {
        toast.error("Seu acesso ainda não foi liberado. Fale com o administrador do escritório.");
        await supabase.auth.signOut();
        sessionStorage.setItem(
          "scc-access-denied-message",
          "Seu acesso ainda não foi liberado. Fale com o administrador do escritório.",
        );
        return;
      }

      await navigate({ to: "/", replace: true });
    }

    void verifyAccountAccess();
    return () => {
      cancelled = true;
    };
  }, [loading, user, navigate]);

    async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAccessDeniedMessage(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado";
      toast.error(
        message.includes("Invalid login credentials")
          ? "E-mail ou senha incorretos."
          : message.includes("Email not confirmed")
            ? "Confirme seu e-mail antes de entrar."
            : message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendRecovery() {
    if (!email.trim()) {
      toast.error("Informe seu e-mail para receber o link.");
      return;
    }
    setRecovering(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.");
    } catch {
      toast.error("Não foi possível enviar o link agora.");
    } finally {
      setRecovering(false);
    }
  }

  return (
        <div className="login-page flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
            <main className="w-full max-w-[420px] rounded-[16px] border border-border border-t-4 border-t-[#E3B896] bg-card p-10 text-card-foreground shadow-[0_1px_2px_rgba(0,0,0,.04),_0_16px_48px_rgba(11,35,64,.10)]">
                <div className="border-b border-[#E2E8F0] pb-6 text-center">
          <img src="/imagens/imagem-f9880f50.png" alt="SCC Advogados" className="mx-auto h-[110px] max-w-full object-contain" />
        </div>
        <div className="pt-7 text-center">
                    <h1 className="font-sans text-left text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[#0F172A]">Olá, bem-vindo.</h1>
                    <p className="mt-1 mb-[22px] text-left text-[14px] text-[#64748B]">Acesse sua conta para continuar.</p>
        </div>
        <form onSubmit={handleSubmit} className="mt-0 space-y-5">
                    <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" aria-hidden="true" />
              <Input id="email" type="email" autoComplete="username" placeholder="nome@sccadvocacia.com.br" value={email} onChange={(event) => setEmail(event.target.value)} className="h-[46px] rounded-[10px] border-[#E2E8F0] bg-white pl-[42px] focus-visible:border-[#C9956B] focus-visible:ring-4 focus-visible:ring-[rgba(227,184,150,0.25)]" required />
            </div>
          </div>
                    <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#94A3B8]" aria-hidden="true" />
              <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(event) => setPassword(event.target.value)} className="h-[46px] rounded-[10px] border-[#E2E8F0] bg-white pl-[42px] pr-[42px] focus-visible:border-[#C9956B] focus-visible:ring-4 focus-visible:ring-[rgba(227,184,150,0.25)]" required />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
                    <div className="space-y-[22px]">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-[13px] text-[#64748B]">
                <input type="checkbox" className="size-4 rounded border-[#CBD5E1] accent-[#C9956B]" />
                Manter conectado
              </label>
              <Button variant="link" type="button" onClick={sendRecovery} disabled={recovering || busy} className="h-auto p-0 text-[13px] font-medium text-[#C9956B]">
                {recovering ? "Enviando..." : "Esqueci a senha"}
              </Button>
            </div>
            <Button type="submit" disabled={busy} className="h-[48px] w-full rounded-[10px] bg-[#0B2340] text-[15px] font-semibold text-white hover:bg-[#13325A]">
              {busy ? "Entrando..." : "Entrar"}
            </Button>
          </div>
        </form>
              </main>
      <footer className="mt-[22px] text-center text-[12px] text-[#94A3B8]">© 2026 SCC Advogados · Acesso Restrito</footer>
    </div>
  );
}
