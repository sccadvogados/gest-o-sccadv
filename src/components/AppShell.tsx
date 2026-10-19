import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarDays, House, LogOut, ShieldCheck, Users, Wallet } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
const logoHorizontal = "/__l5e/assets-v1/195a2125-7946-439b-bd3f-5ddac237f27f/scc-logo-horizontal.png";

const NAV = [
    { to: "/inicio", label: "Início", icon: House },
  { to: "/", label: "Clientes", icon: Users },
    { to: "/agenda", label: "Agenda", icon: CalendarDays },
    { to: "/financeiro", label: "Financeiro", icon: Wallet },
  
] as const;

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      <img
                src={logoHorizontal}
        alt="Souza, Craveiro & Corradi Advogados"
                className="h-9 w-auto object-contain sm:h-11"
      />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
    const navigate = useNavigate();
  // Aba Auditoria: só para administradores.
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!user) return;
    void supabase.rpc("is_admin").then(({ data }) => setAdmin(data === true));
  }, [user]);
  const itensMenu = admin ? [...NAV, { to: "/auditoria" as const, label: "Auditoria", icon: ShieldCheck }] : NAV;
    const pathname = useRouterState({ select: (s) => s.location.pathname });
  

    useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (loading || !user) return;

    let cancelled = false;
    async function verifyActiveAccess() {
      const { data, error } = await supabase.rpc("is_ativo" as never);
      if (cancelled || error || data !== false) return;

      sessionStorage.setItem(
        "scc-access-denied-message",
        "Seu acesso ainda não foi liberado. Fale com o administrador do escritório.",
      );
      await supabase.auth.signOut();
      if (!cancelled) navigate({ to: "/auth", replace: true });
    }

    void verifyActiveAccess();
    return () => {
      cancelled = true;
    };
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
            <header className="border-b border-[#ECE8E1] border-t-[3px] border-t-[#D4A782] bg-white text-[#0F2340]">
                <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-6 py-4">
                    <Link to="/inicio" aria-label="Ir para o Início" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BrandMark />
          </Link>
                    <nav className="hidden items-center gap-1 md:flex">
                                                                                                {itensMenu.map(({ to, label, icon }) => {
              const NavItemIcon = icon;
              return (
              <Link
                key={to}
                to={to}
                className={cn(
                                    "flex items-center gap-2 rounded-md border-b-2 border-transparent px-3 py-2 text-sm font-medium transition-colors",
                  pathname === to
                    ? "border-b-[#D4A782] bg-[#F4EDE4] text-[#0F2340]"
                    : "text-[#5B6472] hover:bg-[#F4EDE4]",
                )}
              >
                                <NavItemIcon className="size-4" />
                {label}
              </Link>
                          );
            })}
          </nav>
          <div className="flex items-center gap-3">
                        <span className="hidden text-sm text-[#5B6472] sm:inline">
              {user.email}
            </span>
            <Button
                            variant="outline"
              size="sm"
              className="border-[#D4A782] bg-white text-[#0F2340] hover:bg-[#F4EDE4]"
                            onClick={async () => {
                await Promise.resolve((supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => PromiseLike<unknown>)("registrar_acesso", { p_acao: "logout" })).catch(() => undefined);
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="size-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>
                        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-28 pt-6 sm:px-6 md:py-8">{children}</main>
      {/* Celular: menu fixo embaixo, como um aplicativo */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-[#ECE8E1] bg-white/95 backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${itensMenu.length}, minmax(0, 1fr))`, paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {itensMenu.map(({ to, label, icon }) => {
          const Icone = icon;
          const ativo = pathname === to;
          return (
            <Link key={to} to={to} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", ativo ? "text-[#0F2340]" : "text-[#8A8F98]")}>
              <Icone className={cn("size-5", ativo ? "text-[#B07A4F]" : "")} />
              {label}
            </Link>
          );
        })}
      </nav>
      <footer className="hidden px-6 py-6 text-center text-[13px] text-[#5B6472] md:block">
                © Souza, Craveiro & Corradi Advogados · Acesso Restrito
      </footer>
    </div>
  );
}
