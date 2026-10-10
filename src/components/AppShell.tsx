import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarDays, LogOut, Users, Wallet } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
const logoHorizontal = "/__l5e/assets-v1/195a2125-7946-439b-bd3f-5ddac237f27f/scc-logo-horizontal.png";

const NAV = [
  { to: "/", label: "Clientes", icon: Users },
    { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
] as const;

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      <img
        src={logoHorizontalWhite}
        alt="Souza, Craveiro & Corradi Advogados"
        className="h-11 w-auto object-contain"
      />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
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
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <BrandMark />
          <nav className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: NavIcon }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === to
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                )}
              >
                                <NavIcon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-sidebar-foreground/70 sm:inline">
              {user.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-primary"
              onClick={async () => {
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
            <main className="mx-auto w-full max-w-[1240px] flex-1 px-6 py-8">{children}</main>
      <footer className="px-6 py-6 text-center text-[13px] text-[#5B6472]">
        © 2026 SCC Advogados · Acesso restrito
      </footer>
    </div>
  );
}
