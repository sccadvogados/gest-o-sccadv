import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type EventTable = Database["public"]["Tables"]["eventos"];
type OfficeDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Omit<Database["public"]["Tables"], "eventos"> & {
      eventos: Omit<EventTable, "Row" | "Insert" | "Update"> & {
        Row: EventTable["Row"] & { parte_contraria: string | null };
        Insert: EventTable["Insert"] & { parte_contraria?: string | null };
        Update: EventTable["Update"] & { parte_contraria?: string | null };
      };
    };
  };
};

export function officeDatabase(client: SupabaseClient<Database>) {
  return client as unknown as SupabaseClient<OfficeDatabase>;
}