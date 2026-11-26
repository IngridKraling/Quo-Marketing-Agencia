"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  ESTADOS,
  erroresParaAprobar,
  estaCongelado,
  lineaDesdeFila,
  resumenPresupuesto,
  type Estado,
} from "@/lib/presupuesto-calc";
import { catalogo, parametros } from "@/lib/servicios/datos";
import { construirImportFactura, configFacturacionDesdeEnv } from "@/lib/sigma/factura";
import { SigmaError, sigmaRequest } from "@/lib/sigma/client";
import { sincronizarClientesSigma } from "@/lib/servicios/sync";

export type Resultado = { ok: boolean; mensaje: string } | null;

async function db() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return supabase;
}

const num = z.coerce.number().finite();
/** Número opcional: "" o null → null. */
const numOpc = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().finite().nullable());
const textoOpc = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().nullable());
const uuidOpc = z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable());
/** Checkbox: en un form de edición, si no viene es false; en uno de alta (sin id), true. */
const activoDe = (form: FormData) => (form.get("activo") != null ? true : !form.get("id"));
const error = (mensaje: string) => ({ ok: false, mensaje });

/* ======================= Presupuestos ======================= */

const lineaSchema = z.object({
  id: z.string().uuid(),
  rubro_id: uuidOpc,
  concepto_id: uuidOpc,
  concepto: z.string().trim().min(1, "Cada línea necesita un concepto"),
  observaciones: textoOpc,
  origen: z.enum(["propio", "proveedor", "personal"]),
  proveedor: textoOpc,
  unidad: textoOpc,
  precio_unitario: numOpc.refine((v) => v == null || v >= 0, "Los precios no pueden ser negativos"),
  cantidad: numOpc.refine((v) => v == null || v >= 0, "Las cantidades no pueden ser negativas"),
  horas: numOpc.refine((v) => v == null || v >= 0, "Las horas no pueden ser negativas"),
  dias: numOpc.refine((v) => v == null || v >= 0, "Los días no pueden ser negativos"),
  markup: numOpc.refine((v) => v == null || v > 0, "El markup tiene que ser mayor que 0"),
  markup_concepto: numOpc,
});
export type LineaInput = z.infer<typeof lineaSchema>;

const presupuestoSchema = z.object({
  id: z.string().uuid().optional(),
  cliente_id: uuidOpc,
  marca: textoOpc,
  titulo: z.string().trim().min(1, "Completá el proyecto / evento"),
  area_id: uuidOpc,
  responsable: textoOpc,
  fecha_elaboracion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Completá la fecha de elaboración"),
  fecha_evento: textoOpc,
  notas: textoOpc,
  lineas: z.array(lineaSchema),
});
export type PresupuestoInput = z.infer<typeof presupuestoSchema>;

export async function guardarPresupuesto(input: PresupuestoInput): Promise<{ ok: boolean; mensaje: string; id?: string }> {
  const parsed = presupuestoSchema.safeParse(input);
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Datos inválidos");
  const { id, lineas, ...cabecera } = parsed.data;
  const supabase = await db();

  let presupuestoId = id;
  if (presupuestoId) {
    const { data: actual } = await supabase.from("presupuestos").select("estado").eq("id", presupuestoId).single();
    if (actual && estaCongelado(actual.estado)) return error("La versión está aprobada: creá una nueva versión para cambiarla");
    const { error: e } = await supabase.from("presupuestos").update(cabecera).eq("id", presupuestoId);
    if (e) return error(e.message);
  } else {
    if (!cabecera.cliente_id || !cabecera.area_id) return error("Elegí cliente y área: se usan para el ID del proyecto");
    const { data, error: e } = await supabase.from("presupuestos").insert({ ...cabecera, estado: "borrador" }).select("id").single();
    if (e) return error(e.message);
    presupuestoId = data.id as string;
  }

  // Las líneas presupuestadas se reemplazan; los gastos no presupuestados no se tocan desde acá.
  const ids = lineas.map((l) => l.id);
  let borrar = supabase.from("presupuesto_lineas").delete().eq("presupuesto_id", presupuestoId).eq("presupuestada", true);
  if (ids.length) borrar = borrar.not("id", "in", `(${ids.join(",")})`);
  const del = await borrar;
  if (del.error) return error(del.error.message);
  if (lineas.length) {
    const up = await supabase
      .from("presupuesto_lineas")
      .upsert(lineas.map((l, orden) => ({ ...l, orden, presupuesto_id: presupuestoId, presupuestada: true })));
    if (up.error) return error(up.error.message);
  }

  revalidatePath("/presupuestos");
  revalidatePath(`/presupuestos/${presupuestoId}`);
  return { ok: true, mensaje: "Presupuesto guardado", id: presupuestoId };
}

export async function aprobarPresupuesto(id: string): Promise<Resultado> {
  const supabase = await db();
  const [{ data: p }, cat] = await Promise.all([
    supabase.from("presupuestos").select("*, presupuesto_lineas(*)").eq("id", id).single(),
    catalogo(),
  ]);
  if (!p) return error("Presupuesto no encontrado");
  if (estaCongelado(p.estado)) return error("Esta versión ya está aprobada");
  const filas = p.presupuesto_lineas as (Parameters<typeof lineaDesdeFila>[0] & { concepto: string; orden: number })[];
  const lineas = filas.map((f) => ({ ...lineaDesdeFila(f), concepto: f.concepto }));
  const errores = erroresParaAprobar(lineas);
  if (errores.length) return error(`No se puede aprobar: ${errores.join(" · ")}`);

  const resumen = resumenPresupuesto(lineas, cat.rubros, cat.parametros);
  const { presupuesto_lineas, ...cabecera } = p;
  const ahora = new Date().toISOString();
  const v = await supabase.from("presupuesto_versiones").upsert(
    {
      presupuesto_id: id,
      version: p.version,
      aprobado_at: ahora,
      datos: {
        cabecera,
        lineas: [...presupuesto_lineas].filter((l: { presupuestada: boolean }) => l.presupuestada).sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden),
        totales: { costo: resumen.costo, venta: resumen.venta, impuestos: resumen.impuestos, contribucion: resumen.contribucion, margenPct: resumen.margenPct },
        parametros: cat.parametros,
      },
    },
    { onConflict: "presupuesto_id,version" },
  );
  if (v.error) return error(v.error.message);
  const u = await supabase.from("presupuestos").update({ estado: "aprobado", aprobado_at: ahora }).eq("id", id);
  if (u.error) return error(u.error.message);
  revalidatePath("/presupuestos");
  revalidatePath(`/presupuestos/${id}`);
  return { ok: true, mensaje: `Versión ${p.version} aprobada y congelada` };
}

export async function crearNuevaVersion(id: string): Promise<Resultado> {
  const supabase = await db();
  const { data: p } = await supabase.from("presupuestos").select("estado, version").eq("id", id).single();
  if (!p) return error("Presupuesto no encontrado");
  if (!estaCongelado(p.estado)) return error("El presupuesto no está aprobado: se puede editar directamente");
  if (p.estado === "facturado") return error("El presupuesto ya está facturado");
  const { error: e } = await supabase.from("presupuestos").update({ estado: "borrador", version: p.version + 1 }).eq("id", id);
  if (e) return error(e.message);
  revalidatePath(`/presupuestos/${id}`);
  return { ok: true, mensaje: `Versión ${p.version + 1} en borrador. Los costos reales cargados se mantienen.` };
}

/** Cambios de estado que no son aprobar ni crear versión. */
export async function cambiarEstado(id: string, estado: Estado): Promise<Resultado> {
  if (!ESTADOS.includes(estado)) return error("Estado inválido");
  if (estado === "aprobado") return error("Para aprobar usá el botón Aprobar y congelar");
  const supabase = await db();
  const { data: p } = await supabase.from("presupuestos").select("estado").eq("id", id).single();
  if (!p) return error("Presupuesto no encontrado");
  const congelado = estaCongelado(p.estado);
  if (congelado && (estado === "borrador" || estado === "enviado")) return error("Para volver a editar, creá una nueva versión");
  if (!congelado && (estado === "en_ejecucion" || estado === "finalizado" || estado === "facturado")) {
    return error("Primero hay que aprobar el presupuesto");
  }
  const { error: e } = await supabase.from("presupuestos").update({ estado }).eq("id", id);
  if (e) return error(e.message);
  revalidatePath("/presupuestos");
  revalidatePath(`/presupuestos/${id}`);
  return { ok: true, mensaje: "Estado actualizado" };
}

/* ======================= Costos reales ======================= */

const realSchema = z.object({
  id: z.string().uuid(),
  presupuestada: z.boolean(),
  // Solo para gastos no presupuestados:
  rubro_id: uuidOpc.optional(),
  concepto: z.string().trim().min(1, "Cada gasto necesita un concepto"),
  proveedor: textoOpc.optional(),
  real_igual: z.boolean(),
  real_precio: numOpc,
  real_cantidad: numOpc,
  real_horas: numOpc,
  real_dias: numOpc,
  real_monto: numOpc,
  real_fuente: z.enum(["sigma", "manual", "caja_chica", "connecteam"]).nullable(),
  real_comprobante: textoOpc,
  real_fecha: textoOpc,
  real_observaciones: textoOpc,
});
export type RealInput = z.infer<typeof realSchema>;

export async function guardarCostosReales(presupuestoId: string, filas: RealInput[]): Promise<Resultado> {
  const parsed = z.array(realSchema).safeParse(filas);
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Datos inválidos");
  const negativos = parsed.data.some((f) => [f.real_precio, f.real_cantidad, f.real_horas, f.real_dias, f.real_monto].some((v) => v != null && v < 0));
  if (negativos) return error("Los valores reales no pueden ser negativos");
  const supabase = await db();

  // Gastos no presupuestados que se quitaron.
  const extras = parsed.data.filter((f) => !f.presupuestada).map((f) => f.id);
  let borrar = supabase.from("presupuesto_lineas").delete().eq("presupuesto_id", presupuestoId).eq("presupuestada", false);
  if (extras.length) borrar = borrar.not("id", "in", `(${extras.join(",")})`);
  const del = await borrar;
  if (del.error) return error(del.error.message);

  for (const f of parsed.data) {
    const real = {
      real_igual: f.real_igual,
      real_precio: f.real_precio,
      real_cantidad: f.real_cantidad,
      real_horas: f.real_horas,
      real_dias: f.real_dias,
      real_monto: f.real_monto,
      real_fuente: f.real_fuente,
      real_comprobante: f.real_comprobante,
      real_fecha: f.real_fecha,
      real_observaciones: f.real_observaciones,
    };
    const r = f.presupuestada
      ? await supabase.from("presupuesto_lineas").update(real).eq("id", f.id).eq("presupuesto_id", presupuestoId)
      : await supabase.from("presupuesto_lineas").upsert({
          id: f.id,
          presupuesto_id: presupuestoId,
          presupuestada: false,
          rubro_id: f.rubro_id ?? null,
          concepto: f.concepto,
          proveedor: f.proveedor ?? null,
          orden: 10000,
          ...real,
        });
    if (r.error) return error(r.error.message);
  }
  revalidatePath(`/presupuestos/${presupuestoId}/costos`);
  revalidatePath("/presupuestos");
  return { ok: true, mensaje: "Costos reales guardados" };
}

export async function registrarFactura(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z
    .object({
      presupuesto_id: z.string().uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      numero: z.string().trim().min(1),
      monto_neto: num.positive(),
      observaciones: textoOpc,
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return error("Completá fecha, número y monto neto (mayor que 0)");
  const supabase = await db();
  const { error: e } = await supabase.from("facturacion").insert(parsed.data);
  if (e) return error(e.message);
  revalidatePath(`/presupuestos/${parsed.data.presupuesto_id}/costos`);
  return { ok: true, mensaje: "Factura registrada" };
}

export async function eliminarFactura(_: Resultado, form: FormData): Promise<Resultado> {
  const id = String(form.get("id") ?? "");
  const presupuestoId = String(form.get("presupuesto_id") ?? "");
  const supabase = await db();
  const { error: e } = await supabase.from("facturacion").delete().eq("id", id);
  if (e) return error(e.message);
  revalidatePath(`/presupuestos/${presupuestoId}/costos`);
  return { ok: true, mensaje: "Factura eliminada" };
}

/* ======================= Catálogo y configuración ======================= */

async function guardarFila(tabla: string, id: string | undefined, fila: Record<string, unknown>, ruta: string, mensaje: string): Promise<Resultado> {
  const supabase = await db();
  const { error: e } = id ? await supabase.from(tabla).update(fila).eq("id", id) : await supabase.from(tabla).insert(fila);
  if (e) return error(e.code === "23505" ? "Ya existe uno con ese nombre" : e.message);
  revalidatePath(ruta);
  return { ok: true, mensaje };
}

export async function guardarConcepto(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z
    .object({
      id: z.string().uuid().optional(),
      rubro_id: z.string().uuid(),
      nombre: z.string().trim().min(1),
      unidad: textoOpc,
      origen: z.enum(["propio", "proveedor", "personal"]),
      tarifa: numOpc,
      proveedor_id: uuidOpc,
      markup: numOpc,
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return error("Revisá rubro, nombre y números");
  const { id, ...fila } = parsed.data;
  if (fila.markup != null && fila.markup <= 0) return error("El markup es un multiplicador (ej. 1.4)");
  return guardarFila("conceptos", id, { ...fila, por_defecto: form.get("por_defecto") != null, activo: activoDe(form) }, "/conceptos", "Concepto guardado");
}

export async function guardarRubro(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z
    .object({ id: z.string().uuid().optional(), nombre: z.string().trim().min(1), orden: z.coerce.number().int() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return error("Revisá nombre y orden");
  const { id, ...fila } = parsed.data;
  return guardarFila(
    "rubros",
    id,
    { ...fila, alerta_sin_cotizar: form.get("alerta_sin_cotizar") != null, revisar_si_se_usa: form.get("revisar_si_se_usa") != null, activo: activoDe(form) },
    "/configuracion",
    "Rubro guardado",
  );
}

export async function guardarProveedor(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z.object({ id: z.string().uuid().optional(), nombre: z.string().trim().min(1) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return error("Completá el nombre");
  const { id, ...fila } = parsed.data;
  return guardarFila("proveedores", id, { ...fila, activo: activoDe(form) }, "/configuracion", "Proveedor guardado");
}

export async function guardarResponsable(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z.object({ id: z.string().uuid().optional(), nombre: z.string().trim().min(1) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return error("Completá el nombre");
  const { id, ...fila } = parsed.data;
  return guardarFila("responsables", id, { ...fila, activo: activoDe(form) }, "/configuracion", "Responsable guardado");
}

export async function guardarArea(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z
    .object({
      id: z.string().uuid().optional(),
      nombre: z.string().trim().min(1),
      prefijo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,6}$/, "Prefijo: hasta 6 letras o números"),
      orden: z.coerce.number().int(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Revisá los datos");
  const { id, ...fila } = parsed.data;
  return guardarFila("areas", id, { ...fila, activo: activoDe(form) }, "/configuracion", "Área guardada");
}

export async function guardarImpuesto(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z
    .object({ id: z.string().uuid().optional(), nombre: z.string().trim().min(1), porcentaje: num.min(0).max(100) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return error("Revisá nombre y porcentaje");
  const { id, ...fila } = parsed.data;
  return guardarFila("impuestos_venta", id, { ...fila, activo: activoDe(form) }, "/configuracion", "Impuesto guardado");
}

export async function guardarParametros(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z
    .object({
      markup_default: num.positive(),
      margen_minimo_pct: num.min(0).max(100),
      iva_pct: num.min(0).max(100),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return error("Revisá los valores");
  const supabase = await db();
  const { error: e } = await supabase.from("parametros").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", true);
  if (e) return error(e.message);
  revalidatePath("/configuracion");
  return { ok: true, mensaje: "Parámetros guardados" };
}

/* ======================= Clientes ======================= */

export async function guardarCliente(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z
    .object({
      id: z.string().uuid().optional(),
      nombre: z.string().trim().min(1),
      codigo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,12}$/, "Código: hasta 12 letras o números, sin espacios"),
      numero_documento: textoOpc,
      email: textoOpc,
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Revisá los datos");
  const { id, ...fila } = parsed.data;
  return guardarFila(
    "clientes",
    id,
    { ...fila, tipo_documento: fila.numero_documento ? "CUIT" : null, activo: activoDe(form) },
    "/clientes",
    "Cliente guardado",
  );
}

export async function guardarMarca(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z
    .object({ id: z.string().uuid().optional(), cliente_id: z.string().uuid(), nombre: z.string().trim().min(1, "Completá el nombre de la marca") })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Revisá los datos");
  const { id, ...fila } = parsed.data;
  return guardarFila("marcas", id, { ...fila, activo: activoDe(form) }, "/clientes", "Marca guardada");
}

export async function sincronizarClientes(): Promise<Resultado> {
  const supabase = await db();
  try {
    const n = await sincronizarClientesSigma(supabase);
    revalidatePath("/clientes");
    return { ok: true, mensaje: `${n} clientes sincronizados desde Sigma` };
  } catch (e) {
    return error((e as Error).message);
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
  if (!parsed.success) return error("Datos inválidos");
  const { id, ...fila } = parsed.data;
  const supabase = await db();
  const { error: e } = await supabase.from("clientes").update(fila).eq("id", id);
  if (e) return error(e.message);
  revalidatePath("/clientes");
  return { ok: true, mensaje: "Guardado" };
}

/* ======================= Facturación en Sigma (opcional) ======================= */

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
  if (!parsed.success) return error("Completá fecha y número de comprobante");
  const d = parsed.data;
  const supabase = await db();

  const [{ data: p }, params] = await Promise.all([
    supabase.from("presupuestos").select("*, clientes(*), presupuesto_lineas(*)").eq("id", d.presupuesto_id).single(),
    parametros(),
  ]);
  if (!p) return error("Presupuesto no encontrado");
  if (p.estado === "facturado") return error("El presupuesto ya está facturado");
  const c = p.clientes;
  if (!c?.sigma_cliente_id) return error("El cliente no está vinculado a Sigma");
  if (c.sigma_tipo_iva == null || !c.sigma_condicion_venta) {
    return error("Completá tipo de IVA y condición de venta del cliente en Clientes");
  }

  const venta = resumenPresupuesto(p.presupuesto_lineas.map(lineaDesdeFila), [], params).venta;
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
      subtotal: venta,
      ivaPct: params.ivaPct,
      observacion: d.observacion || `${p.codigo ?? ""} - ${p.titulo}`.slice(0, 200),
      cae: d.cae_numero ? { numero: d.cae_numero, vencimiento: d.cae_vencimiento ?? "" } : null,
    });
  } catch (e) {
    return error((e as Error).message);
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
  if (ins.error) return error(ins.error.message);

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
      .update({ estado: "error", sigma_respuesta: err.message, sigma_error_kind: e instanceof SigmaError ? e.kind : null })
      .eq("id", facturaId);
    revalidatePath(`/presupuestos/${p.id}`);
    return error(err.message);
  }
}

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
