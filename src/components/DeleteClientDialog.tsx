import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
    AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { excluirClienteCompleto } from "@/lib/arquivo.functions";

export function DeleteClientDialog({
  clientId,
  clientName,

}: {
  clientId: string;
  clientName: string;
}) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();
    const navigate = useNavigate();
  const excluir = useServerFn(excluirClienteCompleto);

  useEffect(() => {
    let active = true;
    void supabase.rpc("is_admin").then(({ data, error }) => {
      if (active) setIsAdmin(!error && data === true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (isAdmin !== true) return null;

  
  async function deleteClient() {
    setIsDeleting(true);
    try {
      const result = await excluir({ data: { cliente_id: clientId } });
      if (result.drive_erro) toast.warning(result.drive_erro);
      toast.success("Cliente excluído.");
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      await navigate({ to: "/" });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : (error as { message?: string })?.message ?? "Erro ao excluir o cliente.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          <Trash2 className="size-4" />
                    Excluir Cliente

        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
                    <AlertDialogTitle>Excluir Cliente?</AlertDialogTitle>

          <AlertDialogDescription>
            Esta ação apaga {clientName} e todos os seus contratos, parcelas, documentos e representantes. Os eventos da Agenda serão mantidos sem cliente vinculado. Não é possível desfazer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void deleteClient();
            }}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Excluindo…" : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
