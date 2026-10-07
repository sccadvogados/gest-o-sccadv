import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

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
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [loading, user, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      navigate({ to: "/", replace: true });
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
    <div className="login-page flex min-h-screen items-center justify-center px-4 py-8">
      <main className="login-card w-full max-w-[420px] rounded-2xl border border-slate-200 border-t-4 border-t-[#E3B896] bg-white p-10 shadow-[0_12px_40px_rgba(11,35,64,0.12)]">
        <div className="border-b border-[#E2E8F0] pb-6 text-center">
          <img src="/imagens/imagem-f9880f50.png" alt="SCC Advogados" className="mx-auto h-[110px] w-auto object-contain" />
        </div>
        <div className="pt-7 text-center">
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[#0B2340]">Olá, bem-vindo.</h1>
          <p className="mt-2 text-sm text-slate-500">Acesse sua conta para continuar.</p>
        </div>
        <header className="w-full border-b-2 border-[#E1B795] bg-[#032540] px-3 py-2 text-xs font-bold text-white">
          Gestão SCC
        </header>
        <main className="flex flex-1 items-center justify-center">
          <section className="login-card flex h-[320px] w-full max-w-[650px] overflow-hidden rounded-lg border border-[#E4E0D8] bg-white shadow-[0_1px_3px_rgba(0,0,0,.10),0_10px_30px_rgba(0,0,0,.35)]">
                    <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-[#0B2340]">E-mail</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">@</span>
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="h-[46px] rounded-[10px] border-slate-200 pl-9 text-sm focus-visible:border-[#E3B896] focus-visible:ring-[#E3B896]" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-[#0B2340]">Senha</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">●</span>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-[46px] rounded-[10px] border-slate-200 px-9 text-sm focus-visible:border-[#E3B896] focus-visible:ring-[#E3B896]" required />
              <button type="button" aria-label="Mostrar senha" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Mostrar</button>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-slate-600"><input type="checkbox" className="accent-[#E3B896]" />Manter conectado</label>
            <button type="button" onClick={sendRecovery} disabled={recovering || busy} className="font-medium text-[#B77952] hover:underline">{recovering ? "Enviando..." : "Esqueci a senha"}</button>
          </div>
          <Button type="submit" disabled={busy} className="h-[46px] w-full rounded-[10px] bg-[#0B2340] text-sm font-semibold text-white hover:bg-[#16395F]">{busy ? "Entrando..." : "Entrar"}</Button>
        </form>
        <footer className="mt-7 text-center text-xs text-slate-400">© 2026 SCC Advogados · Acesso Restrito</footer>
      </main>
    </div>
              <img src="/imagens/imagem-fd496630.png" alt="SCC Advogados" className="login-logo h-[200px] w-auto object-contain" />
            </div>
            <div className="login-blue-panel flex flex-1 flex-col bg-gradient-to-br from-[#032540] to-[#021A2E] px-5 pb-[18px] pt-[26px]">
              <form onSubmit={handleSubmit} className="flex h-full flex-col">
                <Label htmlFor="email" className="mb-[3px] text-[11px] font-bold text-white">E-mail</Label>
                <Input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="h-[22px] rounded-[4px] border-[#C9D3E0] bg-[#EEF2F8] text-[12px] text-[#032540] shadow-[0_1px_2px_rgba(0,0,0,.08)] focus:border-[#E1B795] focus:bg-white" required />
                <Label htmlFor="password" className="mb-[3px] mt-[9px] text-[11px] font-bold text-white">Senha</Label>
                                <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-[22px] rounded-[4px] border-[#C9D3E0] bg-[#EEF2F8] text-[12px] text-[#032540] shadow-[0_1px_2px_rgba(0,0,0,.08)] focus:border-[#E1B795] focus:bg-white" required />
                <div className="login-actions mt-[46px] grid grid-cols-2 gap-[6px]">
                  <Button variant="outline" type="button" onClick={sendRecovery} disabled={recovering || busy} className="h-[24px] min-w-0 whitespace-nowrap rounded-[3px] border border-[#7F93AD] bg-transparent px-1 text-[10.5px] font-semibold text-[#E5EAF2] transition-colors hover:border-[#E1B795] hover:text-[#E1B795] disabled:opacity-60">
                    {recovering ? "Enviando..." : "Esqueci a senha"}
                  </Button>
                  <Button type="submit" disabled={busy} className="h-[24px] min-w-0 whitespace-nowrap rounded-[3px] bg-[#E1B795] px-1 text-[10.5px] font-semibold text-[#032540] hover:bg-[#CF9F78]">
                    {busy ? "Entrando..." : "Entrar"}
                  </Button>
                                </div>
                
                <footer className="mt-auto pt-4 text-center text-[9px] font-bold text-[#B9C4D4]">
                  © 2026 Souza, Craveiro & Corradi Advogados
                </footer>
              </form>
            </div>
            <div className="login-white-strip w-[42px] shrink-0 bg-white" />
          </section>
        </main>
      </div>
    );
}
