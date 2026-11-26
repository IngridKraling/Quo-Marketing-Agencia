import "server-only";
import { createClient } from "@/lib/supabase/server";
import { numONull, type Origen, type Parametros, type RubroInfo } from "@/lib/presupuesto-calc";

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
  conceptos: Concepto[];
  proveedores: string[];
  areas: Opcion[];
  clientes: Opcion[];
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

/** Todo lo que necesitan el editor y la carga de costos reales. */
export async function catalogo(): Promise<Catalogo> {
  const supabase = await createClient();
  const [params, rubros, conceptos, proveedores, areas, clientes] = await Promise.all([
    parametros(),
    supabase.from("rubros").select("id, nombre, alerta_sin_cotizar, revisar_si_se_usa").eq("activo", true).order("orden"),
    supabase.from("conceptos").select("*, proveedores(nombre)").eq("activo", true).order("nombre"),
    supabase.from("proveedores").select("nombre").eq("activo", true).order("nombre"),
    supabase.from("areas").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("clientes").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  return {
    parametros: params,
    rubros: (rubros.data ?? []).map((r) => ({ id: r.id, nombre: r.nombre, alertaSinCotizar: r.alerta_sin_cotizar, revisarSiSeUsa: r.revisar_si_se_usa })),
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
    clientes: clientes.data ?? [],
  };
}
