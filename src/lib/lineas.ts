import type { LineaInput } from "@/app/actions";
import type { Linea } from "@/lib/presupuesto-calc";
import type { Concepto } from "@/lib/servicios/datos";

/** Línea del formulario → línea del cálculo. */
export const aLinea = (l: LineaInput): Linea => ({
  rubroId: l.rubro_id,
  precioUnitario: l.precio_unitario,
  cantidad: l.cantidad,
  horas: l.horas,
  dias: l.dias,
  markup: l.markup,
  markupConcepto: l.markup_concepto,
  cotizacionTotal: l.cotizacion_total ?? null,
});

/** Las líneas que se miden por Unidad o por Servicio no llevan horas: solo cantidad y días. */
export const usaHoras = (unidad: string | null | undefined) => !/^(unidad(es)?|servicios?)$/i.test((unidad ?? "").trim());

/** Línea nueva a partir de un concepto del catálogo (origen, proveedor, unidad, tarifa y markup). */
export function lineaDesdeConcepto(c: Concepto, cantidad: number | null = 1): LineaInput {
  return {
    id: crypto.randomUUID(),
    rubro_id: c.rubro_id,
    concepto_id: c.id,
    concepto: c.nombre,
    observaciones: null,
    origen: c.origen,
    proveedor: c.proveedor,
    unidad: c.unidad,
    precio_unitario: c.tarifa,
    cantidad,
    horas: usaHoras(c.unidad) ? c.horas_def : null,
    dias: c.dias_def,
    markup: null,
    markup_concepto: c.markup,
    base: null,
    altura: null,
    cotizacion_total: null,
    markup_ref_presupuesto_id: null,
  };
}

/* ---------- Orden manual de rubros y conceptos ---------- */
// El orden de los rubros en un presupuesto es el de su primera línea; dentro de cada rubro, el de las líneas.

type ConRubro = { id: string; rubro_id: string | null };

/** Rubros en el orden en que aparecen sus líneas (sin repetir). */
export function ordenDeRubros<L extends ConRubro>(lineas: L[]): (string | null)[] {
  return [...new Set(lineas.map((l) => l.rubro_id))];
}

/** Junta las líneas de cada rubro (en el orden de los rubros), sin cambiar el orden dentro de cada uno. */
export function agruparPorRubro<L extends ConRubro>(lineas: L[]): L[] {
  return ordenDeRubros(lineas).flatMap((r) => lineas.filter((l) => l.rubro_id === r));
}

/** Saca el elemento de la posición `de` y lo pone en la posición `a` (la que ocupaba el destino). */
function reubicar<T>(arr: T[], de: number, a: number): T[] {
  const copia = [...arr];
  const [x] = copia.splice(de, 1);
  copia.splice(a, 0, x);
  return copia;
}

/** Arrastrar un rubro (con todas sus líneas) al lugar de otro rubro. */
export function arrastrarRubro<L extends ConRubro>(lineas: L[], rubroId: string | null, destino: string | null): L[] {
  const orden = ordenDeRubros(lineas);
  const de = orden.indexOf(rubroId);
  const a = orden.indexOf(destino);
  if (de < 0 || a < 0 || de === a) return agruparPorRubro(lineas);
  return reubicar(orden, de, a).flatMap((r) => lineas.filter((l) => l.rubro_id === r));
}

/** Arrastrar una línea al lugar de otra del mismo rubro. */
export function arrastrarLinea<L extends ConRubro>(lineas: L[], id: string, destinoId: string): L[] {
  const agrupadas = agruparPorRubro(lineas);
  const de = agrupadas.findIndex((l) => l.id === id);
  const a = agrupadas.findIndex((l) => l.id === destinoId);
  if (de < 0 || a < 0 || de === a || agrupadas[de].rubro_id !== agrupadas[a].rubro_id) return agrupadas;
  return reubicar(agrupadas, de, a);
}
