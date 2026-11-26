import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = () => process.env.SUPABASE_URL!;

/** Cliente con la sesión del usuario (respeta RLS). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(url(), process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el proxy se encarga de refrescar la sesión.
        }
      },
    },
  });
}

/** Cliente con service role, solo para procesos sin usuario (cron de sincronización). */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Falta SUPABASE_SECRET_KEY");
  return createSupabaseClient(url(), key, { auth: { persistSession: false } });
}
