/** Cálculo de presupuestos: horas × tarifa + costos externos, cada uno con su markup. */

export type LineaHoras = { horas: number; costoHora: number };
export type LineaExterna = { costo: number; markupPct?: number | null };

export type ParametrosPresupuesto = {
  horas: LineaHoras[];
  externos: LineaExterna[];
  markupHorasPct: number;
  markupExternosPct: number;
  ivaPct: number;
};

export type Totales = {
  horasTotales: number;
  costoHoras: number;
  costoExternos: number;
  costoTotal: number;
  precioHoras: number;
  precioExternos: number;
  subtotal: number; // neto gravado (sin IVA)
  iva: number;
  total: number;
  margen: number; // subtotal - costoTotal
  margenPct: number; // margen / subtotal (0 si subtotal = 0)
};

export const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const conMarkup = (costo: number, pct: number) => costo * (1 + pct / 100);

export function calcularTotales(p: ParametrosPresupuesto): Totales {
  const horasTotales = p.horas.reduce((s, l) => s + l.horas, 0);
  const costoHoras = p.horas.reduce((s, l) => s + l.horas * l.costoHora, 0);
  const costoExternos = p.externos.reduce((s, l) => s + l.costo, 0);
  const precioHoras = conMarkup(costoHoras, p.markupHorasPct);
  const precioExternos = p.externos.reduce(
    (s, l) => s + conMarkup(l.costo, l.markupPct ?? p.markupExternosPct),
    0,
  );

  const subtotal = redondear(precioHoras + precioExternos);
  const iva = redondear((subtotal * p.ivaPct) / 100);
  const costoTotal = redondear(costoHoras + costoExternos);
  const margen = redondear(subtotal - costoTotal);

  return {
    horasTotales: redondear(horasTotales),
    costoHoras: redondear(costoHoras),
    costoExternos: redondear(costoExternos),
    costoTotal,
    precioHoras: redondear(precioHoras),
    precioExternos: redondear(precioExternos),
    subtotal,
    iva,
    total: redondear(subtotal + iva),
    margen,
    margenPct: subtotal === 0 ? 0 : redondear((margen / subtotal) * 100),
  };
}
