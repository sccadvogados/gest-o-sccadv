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
      <div className="flex min-h-screen flex-col bg-[#444444]">
        <header className="w-full border-b-2 border-[#E1B795] bg-[#032540] px-3 py-2 text-xs font-bold text-white">
          Gestão SCC
        </header>
        <main className="flex flex-1 items-center justify-center">
          <section className="flex h-[320px] w-full max-w-[650px] overflow-hidden rounded-lg border border-[#E4E0D8] bg-white shadow-[0_1px_3px_rgba(0,0,0,.10),0_10px_30px_rgba(0,0,0,.35)]">
            <div className="flex basis-[57.5%] items-center justify-center bg-white">
              <img src="/imagens/imagem-fd496630.png" alt="SCC Advogados" className="h-[200px] w-auto object-contain" />
            </div>
            <div className="flex-1 bg-gradient-to-br from-[#032540] to-[#021A2E]" />
            <div className="w-[42px] shrink-0 bg-white" />
          </section>
        </main>
      </div>
    );
}
