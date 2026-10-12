import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type EventTable = Database["public"]["Tables"]["eventos"];
type ClientTable = Database["public"]["Tables"]["clients"];
type ContractTable = Database["public"]["Tables"]["contracts"];

// Compatibility declarations do not create database objects or grant access.
type RepresentativeRow = {
  id: string;
  cliente_id: string;
  nome: string;
  nacionalidade: string | null;
  estado_civil: string | null;
  profissao: string | null;
  cpf: string | null;
  qualidade: string;
  ordem: number;
  sexo: string | null;
};
type RepresentativeInsert = Pick<RepresentativeRow, "cliente_id" | "nome"> &
  Partial<Omit<RepresentativeRow, "cliente_id" | "nome">>;

type OfficeDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Omit<Database["public"]["Tables"], "eventos" | "clients" | "contracts"> & {
      contracts: Omit<ContractTable, "Row" | "Insert" | "Update"> & {
        Row: ContractTable["Row"] & { objeto?: string | null; gratuidade?: boolean };
        Insert: ContractTable["Insert"] & { objeto?: string | null; gratuidade?: boolean; captacao?: string | null };
        Update: ContractTable["Update"] & { objeto?: string | null; gratuidade?: boolean };
      };
      clients: Omit<ClientTable, "Row" | "Insert" | "Update"> & {
        Row: ClientTable["Row"] & { pj_descricao?: string | null; sexo?: string | null };
        Insert: ClientTable["Insert"] & { pj_descricao?: string | null; sexo?: string | null };
        Update: ClientTable["Update"] & { pj_descricao?: string | null; sexo?: string | null };
      };
      cliente_representantes: {
        Row: RepresentativeRow;
        Insert: RepresentativeInsert;
        Update: Partial<RepresentativeRow>;
        Relationships: [];
      };
      feriados: {
        Row: { data: string };
        Insert: { data: string };
        Update: { data?: string };
        Relationships: [];
      };
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