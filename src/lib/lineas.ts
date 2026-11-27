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
  };
}
