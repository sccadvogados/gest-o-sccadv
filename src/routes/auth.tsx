import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/AppShell";
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
        content: "Acesso do financeiro e administrativo do escritório SCC Advogados.",
      },
      { property: "og:title", content: "Entrar | Gestão Administrativa | SCC Adv" },
      {
        property: "og:description",
        content: "Acesso restrito à equipe do escritório Souza, Craveiro & Corradi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
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
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Cadastro criado. Confirme o e-mail para acessar.");
        setMode("login");
      }
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
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setRecovering(false);
    if (error) {
      toast.error("Não foi possível enviar o link agora.");
      return;
    }
    toast.success("Enviamos um link para redefinir sua senha.");
  }

  return (
        <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col items-center justify-center bg-sidebar p-12 text-sidebar-foreground">
        <BrandMark className="scale-150" />
        <BrandMark />
                <p className="mt-10 text-center text-xs text-sidebar-foreground/50">
          Acesso restrito à equipe.
        </p>
      </div>

            <div className="flex items-center justify-center bg-gradient-to-b from-sidebar to-primary p-6 text-primary-foreground">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5 p-8">
          <div className="space-y-1">
            <h2 className="text-xl">{mode === "login" ? "Entrar" : "Criar acesso"}</h2>
            <p className="text-sm text-muted-foreground">
              {mode === "login"
                ? "Use seu e-mail e senha do escritório."
                : "Você receberá um e-mail de confirmação."}
            </p>
          </div>

          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome completo</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar acesso"}
          </Button>

          {mode === "login" && (
            <Button
              type="button"
              variant="link"
              className="w-full text-muted-foreground"
              disabled={recovering}
              onClick={sendRecovery}
            >
              {recovering ? "Enviando…" : "Esqueci a senha"}
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "Não tenho acesso ainda" : "Já tenho acesso"}
          </Button>
        </form>
      </div>
    </div>
  );
}
