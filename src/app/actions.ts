"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  ESTADOS,
  MODOS_RUBRO,
  conTramo,
  erroresParaAprobar,
  lineaVacia,
  estaCongelado,
  lineaDesdeFila,
  markupAplicado,
  paramsDeArea,
  resumenPresupuesto,
  type Estado,
} from "@/lib/presupuesto-calc";
import { catalogo, parametros, tramos } from "@/lib/servicios/datos";
import { construirImportFactura, configFacturacionDesdeEnv } from "@/lib/sigma/factura";
import { SigmaError, sigmaRequest } from "@/lib/sigma/client";
import { sincronizarClientesSigma } from "@/lib/servicios/sync";
import { aLinea } from "@/lib/lineas";

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
  // Líneas por medida (Trade)
  base: numOpc.refine((v) => v == null || v > 0, "La base tiene que ser mayor que 0").optional(),
  altura: numOpc.refine((v) => v == null || v > 0, "La altura tiene que ser mayor que 0").optional(),
  cotizacion_total: numOpc.refine((v) => v == null || v >= 0, "La cotización no puede ser negativa").optional(),
  markup_ref_presupuesto_id: uuidOpc.optional(),
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
  const { id, lineas: lineasRecibidas, ...cabecera } = parsed.data;
  // Un presupuesto nuevo nunca reutiliza ids de línea: si no, el upsert movería líneas de otro presupuesto.
  const lineas = id ? lineasRecibidas : lineasRecibidas.map((l) => ({ ...l, id: crypto.randomUUID() }));
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
  if (id && ids.length) {
    const { data: ajenas } = await supabase.from("presupuesto_lineas").select("id").in("id", ids).neq("presupuesto_id", id).limit(1);
    if (ajenas?.length) return error("Hay líneas que pertenecen a otro presupuesto. Recargá la página y volvé a intentar.");
  }
  let borrar = supabase.from("presupuesto_lineas").delete().eq("presupuesto_id", presupuestoId).eq("presupuestada", true);
  if (ids.length) borrar = borrar.not("id", "in", `(${ids.join(",")})`);
  const del = await borrar;
  if (del.error) return error(del.error.message);
  if (lineas.length) {
    // Se guarda el markup con el que quedó cada línea (tramo incluido) para compararlo en presupuestos futuros.
    const [paramsBase, listaTramos] = await Promise.all([parametros(), tramos()]);
    const pCalc = conTramo(lineas.map(aLinea), paramsDeArea(paramsBase, listaTramos, cabecera.area_id));
    const up = await supabase.from("presupuesto_lineas").upsert(
      lineas.map((l, orden) => ({
        ...l,
        orden,
        presupuesto_id: presupuestoId,
        presupuestada: true,
        markup_aplicado: markupAplicado(aLinea(l), pCalc),
      })),
    );
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
  const todas = p.presupuesto_lineas as (Parameters<typeof lineaDesdeFila>[0] & { id: string; concepto: string; orden: number })[];
  // Las líneas que quedaron vacías (cantidad 0 o sin precio) se quitan en vez de frenar la aprobación.
  const vacias = todas.filter((f) => lineaVacia(lineaDesdeFila(f)));
  const filas = todas.filter((f) => !vacias.includes(f));
  if (!filas.some((f) => f.presupuestada)) return error("No se puede aprobar: el presupuesto no tiene líneas completas");
  const porMedida = new Set(cat.rubros.filter((r) => r.porMedida).map((r) => r.id));
  const lineas = filas.map((f) => ({
    ...lineaDesdeFila(f),
    concepto: f.concepto,
    proveedor: (f as { proveedor?: string | null }).proveedor ?? null,
    porMedida: !!f.rubro_id && porMedida.has(f.rubro_id),
  }));
  const errores = erroresParaAprobar(lineas);
  if (errores.length) return error(`No se puede aprobar: ${errores.join(" · ")}`);

  // Se guardan los parámetros con el tramo ya resuelto, para que la versión aprobada no cambie después.
  const params = conTramo(lineas, paramsDeArea(cat.parametros, cat.tramos, p.area_id));
  const resumen = resumenPresupuesto(lineas, cat.rubros, params);
  if (vacias.length) {
    const d = await supabase.from("presupuesto_lineas").delete().in("id", vacias.map((f) => f.id));
    if (d.error) return error(d.error.message);
  }
  // Cabecera sin las líneas (la versión guarda solo las líneas que quedaron).
  const cabecera = Object.fromEntries(Object.entries(p).filter(([k]) => k !== "presupuesto_lineas"));
  const presupuesto_lineas = filas;
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
        parametros: params,
      },
    },
    { onConflict: "presupuesto_id,version" },
  );
  if (v.error) return error(v.error.message);
  const u = await supabase.from("presupuestos").update({ estado: "aprobado", aprobado_at: ahora }).eq("id", id);
  if (u.error) return error(u.error.message);

  // Pasa a Facturación: una fila con el importe neto. Si ya había (nueva versión) y todavía no se facturó
  // ni se dividió, se actualiza el importe.
  const { data: filas_fc } = await supabase.from("presupuesto_facturas").select("id, fc_numero").eq("presupuesto_id", id);
  if (!filas_fc?.length) {
    await supabase.from("presupuesto_facturas").insert({ presupuesto_id: id, importe_neto: resumen.venta });
  } else if (filas_fc.length === 1 && !filas_fc[0].fc_numero) {
    await supabase.from("presupuesto_facturas").update({ importe_neto: resumen.venta }).eq("id", filas_fc[0].id);
  }
  revalidatePath("/facturacion");
  revalidatePath("/presupuestos");
  revalidatePath(`/presupuestos/${id}`);
  const quitadas = vacias.length ? ` · se quitaron ${vacias.length} línea(s) vacía(s): ${[...new Set(vacias.map((f) => f.concepto))].join(", ")}` : "";
  return { ok: true, mensaje: `Versión ${p.version} aprobada y congelada${quitadas}` };
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
  const supabase = await db();
  const { data: p } = await supabase.from("presupuestos").select("estado").eq("id", id).single();
  if (!p) return error("Presupuesto no encontrado");
  const congelado = estaCongelado(p.estado);
  // Volver a "Aprobado · Sin empezar" desde una etapa de ejecución está bien; aprobar uno sin aprobar, no (hay que validar).
  if (estado === "aprobado" && !congelado) return error("Para aprobar usá Aprobar y congelar (valida el presupuesto)");
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

/* ======================= Facturación ======================= */

/**
 * Ejecución automática: si todas las filas de facturación del presupuesto tienen FC N°, pasa a "Facturado";
 * si estaba en "Facturado" y ya no, vuelve a "Finalizado".
 */
async function sincronizarFacturado(supabase: Awaited<ReturnType<typeof db>>, presupuestoId: string) {
  const [{ data: p }, { data: filas }] = await Promise.all([
    supabase.from("presupuestos").select("estado").eq("id", presupuestoId).single(),
    supabase.from("presupuesto_facturas").select("fc_numero").eq("presupuesto_id", presupuestoId),
  ]);
  if (!p || !estaCongelado(p.estado) || !filas?.length) return;
  const todas = filas.every((f) => !!f.fc_numero?.trim());
  if (todas && p.estado !== "facturado") await supabase.from("presupuestos").update({ estado: "facturado" }).eq("id", presupuestoId);
  if (!todas && p.estado === "facturado") await supabase.from("presupuestos").update({ estado: "finalizado" }).eq("id", presupuestoId);
}

const facturaSchema = z.object({
  importe_neto: num.min(0, "El importe no puede ser negativo"),
  periodo: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}$/).nullable()),
  oc_numero: textoOpc,
  fc_numero: textoOpc,
  fc_enviada: z.boolean(),
  pagada: z.boolean(),
  comentarios: textoOpc,
});
export type FacturaInput = z.infer<typeof facturaSchema>;

/** Guarda una fila de Facturación (se llama al salir de cada campo). */
export async function guardarFacturaPresupuesto(id: string, datos: FacturaInput): Promise<Resultado> {
  const parsed = facturaSchema.safeParse(datos);
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Revisá los datos");
  const { periodo, ...resto } = parsed.data;
  const supabase = await db();
  const { data, error: e } = await supabase
    .from("presupuesto_facturas")
    .update({ ...resto, periodo: periodo ? `${periodo}-01` : null })
    .eq("id", id)
    .select("presupuesto_id")
    .single();
  if (e) return error(e.message);
  await sincronizarFacturado(supabase, data.presupuesto_id);
  revalidatePath("/facturacion");
  revalidatePath("/presupuestos");
  return { ok: true, mensaje: "Guardado" };
}

/** Divide una fila en dos (OC en partes): la nueva arranca con la mitad del importe de la original. */
export async function dividirFacturaPresupuesto(id: string): Promise<Resultado> {
  const supabase = await db();
  const { data: f } = await supabase.from("presupuesto_facturas").select("presupuesto_id, importe_neto, orden").eq("id", id).single();
  if (!f) return error("Fila no encontrada");
  const total = Number(f.importe_neto);
  const mitad = Math.round((total / 2) * 100) / 100;
  const u = await supabase.from("presupuesto_facturas").update({ importe_neto: total - mitad }).eq("id", id);
  if (u.error) return error(u.error.message);
  const ins = await supabase.from("presupuesto_facturas").insert({ presupuesto_id: f.presupuesto_id, importe_neto: mitad, orden: (f.orden ?? 0) + 1 });
  if (ins.error) return error(ins.error.message);
  await sincronizarFacturado(supabase, f.presupuesto_id);
  revalidatePath("/facturacion");
  revalidatePath("/presupuestos");
  return { ok: true, mensaje: "Dividido en dos partes: ajustá los importes" };
}

/** Quita una parte; su importe se suma a otra parte del mismo presupuesto (siempre queda al menos una). */
export async function quitarParteFacturaPresupuesto(id: string): Promise<Resultado> {
  const supabase = await db();
  const { data: f } = await supabase.from("presupuesto_facturas").select("presupuesto_id, importe_neto, fc_numero").eq("id", id).single();
  if (!f) return error("Fila no encontrada");
  if (f.fc_numero) return error("Esta parte ya tiene FC N°: borralo primero si querés quitarla");
  const { data: otras } = await supabase
    .from("presupuesto_facturas")
    .select("id, importe_neto")
    .eq("presupuesto_id", f.presupuesto_id)
    .neq("id", id)
    .order("orden");
  if (!otras?.length) return error("Es la única fila del presupuesto");
  const destino = otras[0];
  const u = await supabase.from("presupuesto_facturas").update({ importe_neto: Number(destino.importe_neto) + Number(f.importe_neto) }).eq("id", destino.id);
  if (u.error) return error(u.error.message);
  const d = await supabase.from("presupuesto_facturas").delete().eq("id", id);
  if (d.error) return error(d.error.message);
  await sincronizarFacturado(supabase, f.presupuesto_id);
  revalidatePath("/facturacion");
  revalidatePath("/presupuestos");
  return { ok: true, mensaje: "Parte quitada" };
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
  const ocultas = z.array(z.string().uuid()).safeParse(form.getAll("areas_ocultas"));
  if (!ocultas.success) return error("Revisá las áreas donde se oculta");
  const porDefecto = z.array(z.string().uuid()).safeParse(form.getAll("por_defecto_areas"));
  if (!porDefecto.success) return error("Revisá las áreas por defecto");
  return guardarFila(
    "conceptos",
    id,
    { ...fila, por_defecto_areas: porDefecto.data, areas_ocultas: ocultas.data, activo: activoDe(form) },
    "/conceptos",
    "Concepto guardado",
  );
}

export async function guardarRubro(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z
    .object({
      id: z.string().uuid().optional(),
      nombre: z.string().trim().min(1),
      orden: z.coerce.number().int(),
      area_id: uuidOpc,
      modo: z.enum(MODOS_RUBRO).default("estandar"),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return error("Revisá nombre y orden");
  const { id, ...fila } = parsed.data;
  return guardarFila(
    "rubros",
    id,
    {
      ...fila,
      alerta_sin_cotizar: form.get("alerta_sin_cotizar") != null,
      revisar_si_se_usa: form.get("revisar_si_se_usa") != null,
      // por_medida se mantiene por compatibilidad: las líneas que se cotizan con la cotización del proveedor.
      por_medida: fila.modo === "medida" || fila.modo === "unidad",
      activo: activoDe(form),
    },
    "/configuracion",
    "Rubro guardado",
  );
}

export async function guardarProveedor(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z.object({ id: z.string().uuid().optional(), nombre: z.string().trim().min(1) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return error("Completá el nombre");
  const rubros = z.array(z.string().uuid()).safeParse(form.getAll("rubros"));
  if (!rubros.success) return error("Revisá los rubros");
  const { id, ...datos } = parsed.data;
  const fila = { ...datos, activo: activoDe(form) };
  const supabase = await db();

  let proveedorId = id;
  if (id) {
    const { error: e } = await supabase.from("proveedores").update(fila).eq("id", id);
    if (e) return error(e.code === "23505" ? "Ya existe un proveedor con ese nombre" : e.message);
  } else {
    const { data, error: e } = await supabase.from("proveedores").insert(fila).select("id").single();
    if (e) return error(e.code === "23505" ? "Ya existe un proveedor con ese nombre" : e.message);
    proveedorId = data.id as string;
  }

  // Rubros en los que trabaja: se reemplazan por los tildados.
  const del = await supabase.from("proveedor_rubros").delete().eq("proveedor_id", proveedorId);
  if (del.error) return error(del.error.message);
  if (rubros.data.length) {
    const ins = await supabase.from("proveedor_rubros").insert(rubros.data.map((rubro_id) => ({ proveedor_id: proveedorId, rubro_id })));
    if (ins.error) return error(ins.error.message);
  }
  revalidatePath("/configuracion");
  return { ok: true, mensaje: "Proveedor guardado" };
}

export async function guardarResponsable(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z.object({ id: z.string().uuid().optional(), nombre: z.string().trim().min(1) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return error("Completá el nombre");
  const { id, ...fila } = parsed.data;
  return guardarFila("responsables", id, { ...fila, activo: activoDe(form) }, "/configuracion", "Responsable guardado");
}

/** Tramo de markup por costo total. "Hasta" vacío = último tramo, sin tope. */
export async function guardarTramo(_: Resultado, form: FormData): Promise<Resultado> {
  const parsed = z
    .object({
      id: z.string().uuid().optional(),
      area_id: z.string().uuid(),
      hasta: numOpc.refine((v) => v == null || v > 0, "El tope tiene que ser mayor que 0"),
      markup: num.positive("El markup es un multiplicador mayor que 0 (ej. 1,6)"),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return error(parsed.error.issues[0]?.message ?? "Revisá tope y markup");
  const { id, ...fila } = parsed.data;
  const supabase = await db();
  const { error: e } = id ? await supabase.from("markup_tramos").update(fila).eq("id", id) : await supabase.from("markup_tramos").insert(fila);
  if (e) return error(e.code === "23505" ? "Ya hay un tramo con ese tope (o ya existe el tramo sin tope)" : e.message);
  revalidatePath("/configuracion");
  return { ok: true, mensaje: "Tramo guardado" };
}

export async function eliminarTramo(_: Resultado, form: FormData): Promise<Resultado> {
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) return error("Tramo inválido");
  const supabase = await db();
  const { error: e } = await supabase.from("markup_tramos").delete().eq("id", id.data);
  if (e) return error(e.message);
  revalidatePath("/configuracion");
  return { ok: true, mensaje: "Tramo eliminado" };
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
  return guardarFila(
    "areas",
    id,
    // En el alta (sin id) el checkbox arranca tildado.
    { ...fila, activo: activoDe(form) },
    "/configuracion",
    "Área guardada",
  );
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

  const [{ data: p }, paramsBase, listaTramos] = await Promise.all([
    supabase.from("presupuestos").select("*, clientes(*), presupuesto_lineas(*)").eq("id", d.presupuesto_id).single(),
    parametros(),
    tramos(),
  ]);
  if (!p) return error("Presupuesto no encontrado");
  if (p.estado === "facturado") return error("El presupuesto ya está facturado");
  const c = p.clientes;
  if (!c?.sigma_cliente_id) return error("El cliente no está vinculado a Sigma");
  if (c.sigma_tipo_iva == null || !c.sigma_condicion_venta) {
    return error("Completá tipo de IVA y condición de venta del cliente en Clientes");
  }

  const params = paramsDeArea(paramsBase, listaTramos, p.area_id);
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
