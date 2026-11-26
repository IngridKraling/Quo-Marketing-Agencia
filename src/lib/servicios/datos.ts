import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function rolesYClientes() {
  const supabase = await createClient();
  const [roles, clientes] = await Promise.all([
    supabase.from("roles").select("id, nombre, costo_hora").eq("activo", true).order("nombre"),
    supabase.from("clientes").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  return {
    roles: (roles.data ?? []).map((r) => ({ ...r, costo_hora: Number(r.costo_hora) })),
    clientes: clientes.data ?? [],
  };
}
