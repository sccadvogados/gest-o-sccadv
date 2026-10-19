import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";

const CLASSE =
  "fixed right-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-[#0F2340] px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(15,35,64,0.35)] active:scale-95 md:hidden";
const POSICAO = { bottom: "calc(env(safe-area-inset-bottom) + 76px)" };

/** Botão principal da tela, flutuando no canto (só no celular, acima do menu de baixo). */
export function BotaoFlutuante({ children, onClick, to }: { children: ReactNode; onClick?: () => void; to?: "/clientes/novo" }) {
  if (to) {
    return (
      <Link to={to} className={CLASSE} style={POSICAO}>
        <Plus className="size-4" />
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={CLASSE} style={POSICAO}>
      <Plus className="size-4" />
      {children}
    </button>
  );
}