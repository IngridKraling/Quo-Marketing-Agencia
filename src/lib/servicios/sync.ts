import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sigmaExportAll } from "@/lib/sigma/client";
import type { SigmaCliente } from "@/lib/sigma/types";
import { listarTimeClocks, listarTurnos } from "@/lib/connecteam/client";

/** Trae los clientes activos de Sigma y los inserta/actualiza por sigma_cliente_id. */
export async function sincronizarClientesSigma(db: SupabaseClient) {
  const clientes = await sigmaExportAll<SigmaCliente>("ExportClientes");
  const ahora = new Date().toISOString();
  const filas = clientes.map((c) => ({
    sigma_cliente_id: c.id,
    nombre: c.nombre,
    tipo_documento: c.tipoDocumento,
    numero_documento: c.numeroDocumento,
    condicion_iva: c.condicionIva,
    email: c.eMail,
    activo: !c.suspendido && !c.desactivado,
    sigma_vendedor: c.vendedorPredeterminado,
    sigma_condicion_venta:
      c.vendedores?.find((v) => v.vendedor === c.vendedorPredeterminado)?.condicionVenta ??
      c.vendedores?.[0]?.condicionVenta ??
      null,
    sigma_sincronizado_at: ahora,
  }));
  // sigma_tipo_iva no viene en ExportClientes (trae la descripción); se completa a mano.
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await db.from("clientes").upsert(filas.slice(i, i + 500), { onConflict: "sigma_cliente_id" });
    if (error) throw new Error(`Supabase clientes: ${error.message}`);
  }
  return filas.length;
}

/**
 * Trae los turnos de todos los time clocks de Connecteam en el rango y los guarda.
 * Vincula miembro (por connecteam_user_id) y presupuesto (por connecteam_job_id).
 */
export async function sincronizarHorasConnecteam(db: SupabaseClient, desde: string, hasta: string) {
  const [{ data: miembros }, { data: presupuestos }] = await Promise.all([
    db.from("miembros").select("id, connecteam_user_id").not("connecteam_user_id", "is", null),
    db.from("presupuestos").select("id, connecteam_job_id").not("connecteam_job_id", "is", null),
  ]);
  const miembroPorUser = new Map((miembros ?? []).map((m) => [Number(m.connecteam_user_id), m.id as string]));
  const presupuestoPorJob = new Map((presupuestos ?? []).map((p) => [String(p.connecteam_job_id), p.id as string]));

  const clocks = await listarTimeClocks();
  let total = 0;
  for (const clock of clocks) {
    const turnos = await listarTurnos(clock.id, desde, hasta);
    const filas = turnos.map((t) => ({
      connecteam_activity_id: t.activityId,
      connecteam_user_id: t.userId,
      miembro_id: miembroPorUser.get(t.userId) ?? null,
      connecteam_job_id: t.jobId,
      presupuesto_id: t.jobId ? (presupuestoPorJob.get(t.jobId) ?? null) : null,
      inicio: t.inicio.toISOString(),
      fin: t.fin?.toISOString() ?? null,
      horas: t.horas,
      sincronizado_at: new Date().toISOString(),
    }));
    if (filas.length) {
      const { error } = await db.from("horas_reales").upsert(filas, { onConflict: "connecteam_activity_id" });
      if (error) throw new Error(`Supabase horas_reales: ${error.message}`);
    }
    total += filas.length;
  }
  return total;
}
