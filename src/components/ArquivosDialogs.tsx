import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Folder } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listarPasta } from "@/lib/arquivos.functions";

const SUGESTOES = ["Procuração", "Documentos Pessoais", "Petições", "Decisões", "Comprovantes"];

/** Janela de nome: usada em "Nova Pasta" e "Renomear". */
export function NomeDialog({
  aberto,
  titulo,
  rotuloBotao,
  inicial,
  sugestoes = false,
  ocupado,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean;
  titulo: string;
  rotuloBotao: string;
  inicial: string;
  sugestoes?: boolean;
  ocupado: boolean;
  onFechar: () => void;
  onConfirmar: (nome: string) => void;
}) {
  const [nome, setNome] = useState(inicial);
  useEffect(() => {
    if (aberto) setNome(inicial);
  }, [aberto, inicial]);
  return (
    <Dialog open={aberto} onOpenChange={(v) => (!v ? onFechar() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="arquivo-nome">Nome</Label>
          <Input
            id="arquivo-nome"
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nome.trim()) onConfirmar(nome.trim());
            }}
          />
          {sugestoes ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SUGESTOES.map((s) => (
                <button key={s} type="button" onClick={() => setNome(s)} className="rounded-full border border-border px-2.5 py-1 text-xs text-[#0F2340] hover:bg-[#F4EDE4]">
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!nome.trim() || ocupado} onClick={() => onConfirmar(nome.trim())}>{ocupado ? "Salvando…" : rotuloBotao}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Janela "Mover para…": navega pelas pastas do cliente e escolhe o destino. */
export function MoverDialog({
  aberto,
  clienteId,
  nomeItem,
  ocupado,
  onFechar,
  onConfirmar,
}: {
  aberto: boolean;
  clienteId: string;
  nomeItem: string;
  ocupado: boolean;
  onFechar: () => void;
  onConfirmar: (destinoId: string) => void;
}) {
  const listar = useServerFn(listarPasta);
  const [pasta, setPasta] = useState<string | null>(null);
  useEffect(() => {
    if (aberto) setPasta(null);
  }, [aberto]);
  const { data, isLoading } = useQuery({
    queryKey: ["arquivos-mover", clienteId, pasta],
    enabled: aberto,
    queryFn: () => listar({ data: { cliente_id: clienteId, pasta_id: pasta } }),
  });
  const caminho = data?.caminho ?? [];
  const atual = caminho[caminho.length - 1];
  const pastas = (data?.itens ?? []).filter((item) => item.pasta);

  return (
    <Dialog open={aberto} onOpenChange={(v) => (!v ? onFechar() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{`Mover "${nomeItem}"`}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {caminho.map((parte, i) => (
            <span key={parte.id} className="flex items-center gap-1">
              {i ? <ChevronRight className="size-3.5 text-muted-foreground" /> : null}
              {i === caminho.length - 1 ? (
                <b className="text-[#0F2340]">{parte.nome}</b>
              ) : (
                <button type="button" className="text-muted-foreground hover:underline" onClick={() => setPasta(parte.id)}>{parte.nome}</button>
              )}
            </span>
          ))}
        </div>
        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {isLoading ? <p className="p-3 text-sm text-muted-foreground">Carregando…</p> : null}
          {!isLoading && pastas.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Nenhuma subpasta aqui.</p> : null}
          {pastas.map((p) => (
            <button key={p.id} type="button" onClick={() => setPasta(p.id)} className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-[#FBF7F1]">
              <Folder className="size-4 text-[#B07A4F]" />
              {p.nome}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!atual || ocupado} onClick={() => atual && onConfirmar(atual.id)}>{ocupado ? "Movendo…" : "Mover para Esta Pasta"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
