import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function officeDatabase(client: SupabaseClient<Database>) {
  return client;
}