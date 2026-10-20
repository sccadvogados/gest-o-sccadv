/** Ocultar valores (símbolo do olho): guarda a escolha neste aparelho e avisa as telas para redesenhar. */
import { useSyncExternalStore } from "react";

const CHAVE = "scc-ocultar-valores";
export const VALOR_OCULTO = "R$ •••••";

let ocultos = false;
let iniciado = false;
const ouvintes = new Set<() => void>();

function avisar() {
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function valoresEstaoOcultos() {
  return ocultos;
}

/** Lê a escolha salva no aparelho (só no navegador, depois de a tela abrir). */
export function iniciarValoresOcultos() {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  try {
    if (localStorage.getItem(CHAVE) === "1") {
      ocultos = true;
      avisar();
    }
  } catch {
    /* sem armazenamento: começa mostrando */
  }
}

export function alternarValoresOcultos() {
  ocultos = !ocultos;
  try {
    localStorage.setItem(CHAVE, ocultos ? "1" : "0");
  } catch {
    /* sem armazenamento: vale só até fechar o app */
  }
  avisar();
}

/** Use no topo da tela: ela redesenha quando o olho é tocado. */
export function useValoresOcultos() {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    () => ocultos,
    () => false,
  );
}
