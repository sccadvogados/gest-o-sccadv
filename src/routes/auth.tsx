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
      { title: "Entrar — SCC Advogados" },
      {
        name: "description",
        content: "Acesso do financeiro e administrativo do escritório SCC Advogados.",
      },
      { property: "og:title", content: "Entrar — SCC Advogados" },
      {
        property: "og:description",
        content: "Acesso restrito à equipe do escritório Souza, Craveiro & Corradi.",
      },
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

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <BrandMark />
        <div>
          <h1 className="max-w-sm text-3xl leading-snug">
            Gestão de clientes, contratos e financeiro do escritório.
          </h1>
          <p className="mt-4 max-w-sm text-sm text-sidebar-foreground/70">
            Cadastro completo do cliente, contratos com condições de pagamento e controle
            de parcelas em um só lugar.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">Acesso restrito à equipe.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="panel w-full max-w-sm space-y-5 p-8">
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

          <button
            type="button"
            className="w-full text-sm text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "Não tenho acesso ainda" : "Já tenho acesso"}
          </button>
        </form>
      </div>
    </div>
  );
}
