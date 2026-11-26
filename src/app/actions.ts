"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { calcularTotales } from "@/lib/presupuesto-calc";
import { construirImportFactura, configFacturacionDesdeEnv } from "@/lib/sigma/factura";
import { SigmaError, sigmaRequest } from "@/lib/sigma/client";
import { sincronizarClientesSigma, sincronizarHorasConnecteam } from "@/lib/servicios/sync";

export type Resultado = { ok: boolean; mensaje: string } | null;

async function db() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return supabase;
}

const num = z.coerce.number().finite();

/* ---------- Roles y equipo ---------- */

export async function guardarRol(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z
    .object({ id: z.string().optional(), nombre: z.string().trim().min(1), costo_hora: num.min(0) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, mensaje: "Revisá nombre y costo hora" };
  const { id, ...fila } = parsed.data;
  const supabase = await db();
  const { error } = id
    ? await supabase.from("roles").update(fila).eq("id", id)
    : await supabase.from("roles").insert(fila);
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/equipo");
  return { ok: true, mensaje: "Rol guardado" };
}

export async function guardarMiembro(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z
    .object({
      nombre: z.string().trim().min(1),
      email: z.string().trim().optional(),
      rol_id: z.string().uuid().optional().or(z.literal("")),
      connecteam_user_id: z.string().trim().optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, mensaje: "Revisá los datos del miembro" };
  const d = parsed.data;
  const supabase = await db();
  const { error } = await supabase.from("miembros").insert({
    nombre: d.nombre,
    email: d.email || null,
    rol_id: d.rol_id || null,
    connecteam_user_id: d.connecteam_user_id ? Number(d.connecteam_user_id) : null,
  });
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/equipo");
  return { ok: true, mensaje: "Miembro agregado" };
}

/* ---------- Clientes ---------- */

export async function sincronizarClientes(): Promise<Resultado> {
  const supabase = await db();
  try {
    const n = await sincronizarClientesSigma(supabase);
    revalidatePath("/clientes");
    return { ok: true, mensaje: `${n} clientes sincronizados desde Sigma` };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}

export async function guardarDatosFiscales(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      sigma_tipo_iva: z.coerce.number().int().optional(),
      sigma_condicion_venta: z.string().trim().optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, mensaje: "Datos inválidos" };
  const { id, ...fila } = parsed.data;
  const supabase = await db();
  const { error } = await supabase.from("clientes").update(fila).eq("id", id);
  if (error) return { ok: false, mensaje: error.message };
  revalidatePath("/clientes");
  return { ok: true, mensaje: "Guardado" };
}

/* ---------- Presupuestos ---------- */

const presupuestoSchema = z.object({
  id: z.string().uuid().optional(),
  cliente_id: z.string().uuid().nullable(),
  titulo: z.string().trim().min(1, "El título es obligatorio"),
  estado: z.enum(["borrador", "enviado", "aprobado", "rechazado", "facturado"]),
  markup_horas_pct: num,
  markup_externos_pct: num,
  iva_pct: num.min(0),
  valido_hasta: z.string().nullable(),
  notas: z.string().nullable(),
  connecteam_job_id: z.string().nullable(),
  horas: z.array(z.object({ descripcion: z.string().trim().min(1), rol_id: z.string().uuid().nullable(), horas: num.min(0), costo_hora: num.min(0) })),
  externos: z.array(z.object({ descripcion: z.string().trim().min(1), costo: num.min(0), markup_pct: num.nullable() })),
});
export type PresupuestoInput = z.infer<typeof presupuestoSchema>;

export async function guardarPresupuesto(input: PresupuestoInput): Promise<Resultado & { id?: string }> {
  const parsed = presupuestoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, mensaje: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const { id, horas, externos, ...cabecera } = parsed.data;
  const supabase = await db();

  let presupuestoId = id;
  if (presupuestoId) {
    const { error } = await supabase.from("presupuestos").update(cabecera).eq("id", presupuestoId);
    if (error) return { ok: false, mensaje: error.message };
  } else {
    const { data, error } = await supabase.from("presupuestos").insert(cabecera).select("id").single();
    if (error) return { ok: false, mensaje: error.message };
    presupuestoId = data.id as string;
  }

  // Reemplaza las líneas. (Para concurrencia fuerte, mover a una función RPC transaccional.)
  for (const [tabla, filas] of [
    ["presupuesto_horas", horas],
    ["presupuesto_externos", externos],
  ] as const) {
    const del = await supabase.from(tabla).delete().eq("presupuesto_id", presupuestoId);
    if (del.error) return { ok: false, mensaje: del.error.message };
    if (filas.length) {
      const ins = await supabase
        .from(tabla)
        .insert(filas.map((f, orden) => ({ ...f, orden, presupuesto_id: presupuestoId })));
      if (ins.error) return { ok: false, mensaje: ins.error.message };
    }
  }

  revalidatePath("/presupuestos");
  return { ok: true, mensaje: "Presupuesto guardado", id: presupuestoId };
}

/* ---------- Facturación en Sigma ---------- */

export async function facturarPresupuesto(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z
    .object({
      presupuesto_id: z.string().uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      numero_comprobante: z.string().trim().min(1),
      cae_numero: z.string().trim().optional(),
      cae_vencimiento: z.string().trim().optional(),
      observacion: z.string().trim().optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, mensaje: "Completá fecha y número de comprobante" };
  const d = parsed.data;
  const supabase = await db();

  const { data: p, error } = await supabase
    .from("presupuestos")
    .select("*, clientes(*), presupuesto_horas(horas, costo_hora), presupuesto_externos(costo, markup_pct)")
    .eq("id", d.presupuesto_id)
    .single();
  if (error || !p) return { ok: false, mensaje: "Presupuesto no encontrado" };
  if (p.estado === "facturado") return { ok: false, mensaje: "El presupuesto ya está facturado" };
  const c = p.clientes;
  if (!c?.sigma_cliente_id) return { ok: false, mensaje: "El cliente no está vinculado a Sigma" };
  if (c.sigma_tipo_iva == null || !c.sigma_condicion_venta) {
    return { ok: false, mensaje: "Completá tipo de IVA y condición de venta del cliente en Clientes" };
  }

  const t = calcularTotales({
    horas: p.presupuesto_horas.map((h: { horas: number; costo_hora: number }) => ({ horas: Number(h.horas), costoHora: Number(h.costo_hora) })),
    externos: p.presupuesto_externos.map((e: { costo: number; markup_pct: number | null }) => ({ costo: Number(e.costo), markupPct: e.markup_pct == null ? null : Number(e.markup_pct) })),
    markupHorasPct: Number(p.markup_horas_pct),
    markupExternosPct: Number(p.markup_externos_pct),
    ivaPct: Number(p.iva_pct),
  });

  const facturaId = crypto.randomUUID();
  let payload;
  try {
    payload = construirImportFactura(configFacturacionDesdeEnv(), {
      id: facturaId,
      fecha: d.fecha,
      numeroComprobante: d.numero_comprobante,
      cliente: {
        sigmaClienteId: c.sigma_cliente_id,
        tipoIva: c.sigma_tipo_iva,
        condicionVenta: c.sigma_condicion_venta,
        vendedor: c.sigma_vendedor,
      },
      subtotal: t.subtotal,
      ivaPct: Number(p.iva_pct),
      observacion: d.observacion || `Presupuesto #${p.numero} - ${p.titulo}`.slice(0, 200),
      cae: d.cae_numero ? { numero: d.cae_numero, vencimiento: d.cae_vencimiento ?? "" } : null,
    });
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }

  const ins = await supabase.from("facturas").insert({
    id: facturaId,
    presupuesto_id: p.id,
    fecha: d.fecha,
    numero_comprobante: payload.numeroComprobante,
    subtotal: payload.subtotalMonto,
    iva: payload.ivaMonto,
    total: payload.totalMonto,
    sigma_payload: payload,
  });
  if (ins.error) return { ok: false, mensaje: ins.error.message };

  try {
    const r = await sigmaRequest<{ responseText?: string }>("ImportFactura", { method: "POST", body: payload });
    await supabase
      .from("facturas")
      .update({ estado: "enviada", sigma_respuesta: r?.responseText ?? "OK", enviada_at: new Date().toISOString() })
      .eq("id", facturaId);
    await supabase.from("presupuestos").update({ estado: "facturado" }).eq("id", p.id);
    revalidatePath(`/presupuestos/${p.id}`);
    return { ok: true, mensaje: r?.responseText ?? "Factura importada en Sigma" };
  } catch (e) {
    const err = e as Error;
    await supabase
      .from("facturas")
      .update({
        estado: "error",
        sigma_respuesta: err.message,
        sigma_error_kind: e instanceof SigmaError ? e.kind : null,
      })
      .eq("id", facturaId);
    revalidatePath(`/presupuestos/${p.id}`);
    return { ok: false, mensaje: err.message };
  }
}

/* ---------- Horas reales ---------- */

export async function sincronizarHoras(_: Resultado, form: FormData): Promise<Resultado> {
  const desde = String(form.get("desde") ?? "");
  const hasta = String(form.get("hasta") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return { ok: false, mensaje: "Elegí un rango de fechas" };
  }
  const supabase = await db();
  try {
    const n = await sincronizarHorasConnecteam(supabase, desde, hasta);
    revalidatePath("/presupuestos");
    return { ok: true, mensaje: `${n} turnos sincronizados desde Connecteam` };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
