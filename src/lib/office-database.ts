import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Migration-backed office objects not yet present in the generated schema.
type EventRow = {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  cliente_id: string | null;
  contrato_id: string | null;
  data_inicio: string;
  data_fim: string | null;
  prazo_fatal: string | null;
  prazo_interno: string | null;
  local_link: string | null;
  responsavel: string | null;
  status: string;
  dia_inteiro: boolean;
  google_event_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type OfficeDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      eventos: {
        Row: EventRow;
        Insert: Pick<EventRow, "tipo" | "titulo" | "data_inicio"> & Partial<EventRow>;
        Update: Partial<EventRow>;
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      is_ativo: { Args: Record<string, never>; Returns: boolean };
    };
  };
};

export function officeDatabase(client: SupabaseClient<Database>) {
  return client as SupabaseClient<OfficeDatabase>;
}