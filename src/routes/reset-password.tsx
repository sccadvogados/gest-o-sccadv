import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova senha | Gestão Administrativa | SCC Adv" },
      { name: "description", content: "Definição de nova senha para o acesso administrativo da SCC Adv." },
      { property: "og:title", content: "Nova senha | Gestão Administrativa | SCC Adv" },
      { property: "og:description", content: "Definição segura de uma nova senha de acesso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [validRecovery, setValidRecovery] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    setValidRecovery(hash.get("type") === "recovery" || Boolean(hash.get("access_token")));
  }, []);

  async function updatePassword(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível alterar a senha. Solicite um novo link.");
      return;
    }
    toast.success("Senha alterada com sucesso.");
    navigate({ to: "/" });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden bg-sidebar p-12 lg:flex lg:items-start"><BrandMark /></div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={updatePassword} className="panel w-full max-w-sm space-y-5 p-8">
          <div><h1 className="text-xl">Definir nova senha</h1><p className="mt-1 text-sm text-muted-foreground">Crie uma senha com pelo menos seis caracteres.</p></div>
          {!validRecovery && <p className="text-sm text-destructive">Abra esta página pelo link enviado ao seu e-mail.</p>}
          <div className="space-y-2"><Label htmlFor="password">Nova senha</Label><Input id="password" type="password" minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
          <div className="space-y-2"><Label htmlFor="confirm">Confirmar nova senha</Label><Input id="confirm" type="password" minLength={6} value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></div>
          <Button className="w-full" type="submit" disabled={busy || !validRecovery}>{busy ? "Salvando…" : "Salvar nova senha"}</Button>
          <Button className="w-full" type="button" variant="ghost" onClick={() => navigate({ to: "/auth" })}>Voltar ao acesso</Button>
        </form>
      </div>
    </div>
  );
}