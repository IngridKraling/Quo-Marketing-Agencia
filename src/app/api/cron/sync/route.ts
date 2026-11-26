import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sincronizarClientesSigma, sincronizarHorasConnecteam } from "@/lib/servicios/sync";

/** Cron de Vercel (ver vercel.json): sincroniza clientes de Sigma y horas de los últimos 7 días. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const db = createAdminClient();
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 7 * 864e5);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const resultado: Record<string, number | string> = {};
  try {
    resultado.clientes = await sincronizarClientesSigma(db);
  } catch (e) {
    resultado.clientesError = (e as Error).message;
  }
  try {
    resultado.horas = await sincronizarHorasConnecteam(db, fmt(desde), fmt(hasta));
  } catch (e) {
    resultado.horasError = (e as Error).message;
  }
  const ok = !("clientesError" in resultado) && !("horasError" in resultado);
  return NextResponse.json(resultado, { status: ok ? 200 : 500 });
}
