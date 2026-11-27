import "server-only";
import { createClient } from "@/lib/supabase/server";
import { numONull, type Estado, type Origen, type Parametros, type RubroInfo, type TramoArea } from "@/lib/presupuesto-calc";
import type { Referencia } from "@/lib/medidas";
import { alfabetico, type Marca } from "@/lib/opciones";

export type Concepto = {
  id: string;
  rubro_id: string;
  nombre: string;
  unidad: string | null;
  origen: Origen;
  tarifa: number | null;
  proveedor: string | null;
  markup: number | null;
  por_defecto: boolean;
  cantidad_def: number | null;
  horas_def: number | null;
  dias_def: number | null;
};
export type Opcion = { id: string; nombre: string };
export type Catalogo = {
  parametros: Parametros & { ivaPct: number };
  rubros: RubroInfo[];
  /** Tramos de markup de todas las áreas (se filtran con paramsDeArea según el área del presupuesto). */
  tramos: TramoArea[];
  conceptos: Concepto[];
  proveedores: string[];
  areas: Opcion[];
  clientes: Opcion[];
  marcas: Marca[];
  responsables: string[];
};


export const UNIDADES = ["Hora", "Unidad", "Día", "Jornada", "Servicio"];

export async function parametros(): Promise<Parametros & { ivaPct: number }> {
  const supabase = await createClient();
  const [{ data: p }, { data: imp }] = await Promise.all([
    supabase.from("parametros").select("*").maybeSingle(),
    supabase.from("impuestos_venta").select("porcentaje").eq("activo", true),
  ]);
  return {
    markupDefault: Number(p?.markup_default ?? 1.4),
    impuestosPct: (imp ?? []).reduce((s, i) => s + Number(i.porcentaje), 0),
    margenMinimoPct: Number(p?.margen_minimo_pct ?? 20),
    ivaPct: Number(p?.iva_pct ?? 21),
  };
}

/** Tramos de markup por área (Trade: según el costo total del presupuesto). */
export async function tramos(): Promise<TramoArea[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("markup_tramos").select("area_id, hasta, markup");
  return (data ?? []).map((t) => ({ areaId: t.area_id, hasta: numONull(t.hasta), markup: Number(t.markup) }));
}

/** Líneas por medida de todos los presupuestos (menos cancelados), para comparar costos y markups. */
export async function referenciasMedidas(): Promise<Referencia[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("presupuesto_lineas")
    .select("concepto_id, concepto, proveedor, base, altura, cantidad, cotizacion_total, markup_aplicado, presupuesto_id, presupuestos!inner(codigo, estado, fecha_elaboracion)")
    .not("cotizacion_total", "is", null)
    .eq("presupuestada", true)
    .neq("presupuestos.estado", "cancelado");
  return (data ?? []).map((l) => {
    const p = l.presupuestos as unknown as { codigo: string | null; estado: Estado; fecha_elaboracion: string | null };
    return {
      conceptoId: l.concepto_id,
      concepto: l.concepto,
      proveedor: l.proveedor,
      base: numONull(l.base),
      altura: numONull(l.altura),
      piezas: numONull(l.cantidad),
      cotizacionTotal: numONull(l.cotizacion_total),
      markupAplicado: numONull(l.markup_aplicado),
      presupuestoId: l.presupuesto_id,
      codigo: p.codigo,
      estado: p.estado,
      fecha: p.fecha_elaboracion,
    };
  });
}

/** Todo lo que necesitan el editor y la carga de costos reales. */
export async function catalogo(): Promise<Catalogo> {
  const supabase = await createClient();
  const [params, listaTramos, rubros, conceptos, proveedores, areas, clientes, marcas, responsables] = await Promise.all([
    parametros(),
    tramos(),
    supabase.from("rubros").select("id, nombre, alerta_sin_cotizar, revisar_si_se_usa, area_id, por_medida").eq("activo", true).order("orden"),
    supabase.from("conceptos").select("*, proveedores(nombre)").eq("activo", true).order("nombre"),
    supabase.from("proveedores").select("nombre").eq("activo", true).order("nombre"),
    supabase.from("areas").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("clientes").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("marcas").select("cliente_id, nombre").eq("activo", true).order("nombre"),
    supabase.from("responsables").select("nombre").eq("activo", true).order("nombre"),
  ]);
  return {
    parametros: params,
    tramos: listaTramos,
    rubros: (rubros.data ?? []).map((r) => ({
      id: r.id,
      nombre: r.nombre,
      alertaSinCotizar: r.alerta_sin_cotizar,
      revisarSiSeUsa: r.revisar_si_se_usa,
      areaId: r.area_id,
      porMedida: r.por_medida,
    })),
    conceptos: (conceptos.data ?? []).map((c) => ({
      id: c.id,
      rubro_id: c.rubro_id,
      nombre: c.nombre,
      unidad: c.unidad,
      origen: c.origen,
      tarifa: numONull(c.tarifa),
      proveedor: (c.proveedores as { nombre: string } | null)?.nombre ?? null,
      markup: numONull(c.markup),
      por_defecto: c.por_defecto,
      cantidad_def: numONull(c.cantidad_def),
      horas_def: numONull(c.horas_def),
      dias_def: numONull(c.dias_def),
    })),
    proveedores: (proveedores.data ?? []).map((p) => p.nombre),
    areas: areas.data ?? [],
    clientes: (clientes.data ?? []).sort((a, b) => alfabetico(a.nombre, b.nombre)),
    marcas: (marcas.data ?? []).sort((a, b) => alfabetico(a.nombre, b.nombre)),
    responsables: (responsables.data ?? []).map((r) => r.nombre).sort(alfabetico),
  };
}
