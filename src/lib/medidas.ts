/**
 * Líneas por medida (Trade): cálculo de m² y costo unitario, y comparación con presupuestos anteriores.
 *
 *   m²       = base × altura × piezas
 *   $/m²     = cotización total / m²          (si la línea tiene medidas)
 *   $/pieza  = cotización total / piezas      (si no las tiene: pintor, letrista…)
 *
 * Comparaciones (se excluyen el presupuesto actual y los cancelados):
 *   · Mismo proveedor: la última cotización de ese proveedor para ese concepto.
 *   · Otro proveedor más barato: la cotización más baja de OTRO proveedor para ese concepto en los últimos 6 meses.
 *   · Markup a respetar: el último presupuesto ENVIADO (enviado en adelante, rechazados incluidos) con el
 *     mismo concepto, proveedor, medidas y costo por pieza. Si lo hay, la línea mantiene ese markup
 *     para no cambiarle el precio al cliente.
 */

import { redondear, type Estado } from "@/lib/presupuesto-calc";

/** Estados en los que el presupuesto ya llegó al cliente. */
export const ESTADOS_ENVIADOS: readonly Estado[] = ["enviado", "aprobado", "en_ejecucion", "finalizado", "facturado", "rechazado"];

export type Medida = {
  conceptoId: string | null;
  concepto: string;
  proveedor: string | null;
  base: number | null;
  altura: number | null;
  piezas: number | null;
  cotizacionTotal: number | null;
};

/** Una línea por medida de otro presupuesto, para comparar. */
export type Referencia = Medida & {
  presupuestoId: string;
  codigo: string | null;
  estado: Estado;
  fecha: string | null; // fecha de elaboración (AAAA-MM-DD)
  markupAplicado: number | null;
};

const piezasDe = (m: Medida) => (m.piezas == null || m.piezas <= 0 ? 1 : m.piezas);

export function metros2(m: Medida): number | null {
  if (m.base == null || m.altura == null) return null;
  return redondear(m.base * m.altura * piezasDe(m));
}

/** Costo unitario para comparar: $/m² si tiene medidas, si no $/pieza. */
export function costoUnitario(m: Medida): { valor: number; por: "m2" | "pieza" } | null {
  if (m.cotizacionTotal == null) return null;
  const m2 = metros2(m);
  if (m2) return { valor: redondear(m.cotizacionTotal / m2), por: "m2" };
  return { valor: redondear(m.cotizacionTotal / piezasDe(m)), por: "pieza" };
}

const normalizar = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

const mismoConcepto = (a: Medida, b: Medida) =>
  a.conceptoId && b.conceptoId ? a.conceptoId === b.conceptoId : normalizar(a.concepto) === normalizar(b.concepto);
const mismoProveedor = (a: Medida, b: Medida) => !!normalizar(a.proveedor) && normalizar(a.proveedor) === normalizar(b.proveedor);
const mismasMedidas = (a: Medida, b: Medida) => (a.base ?? null) === (b.base ?? null) && (a.altura ?? null) === (b.altura ?? null);
const masReciente = (a: Referencia, b: Referencia) => (b.fecha ?? "").localeCompare(a.fecha ?? "");

/** Resta meses a una fecha AAAA-MM-DD. */
function mesesAntes(hoy: string, meses: number) {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString().slice(0, 10);
}

export type Comparacion = {
  unitario: { valor: number; por: "m2" | "pieza" } | null;
  /** Última cotización del mismo proveedor (mismo tipo de unidad). */
  ultimaDelProveedor: { valor: number; fecha: string | null; codigo: string | null; presupuestoId: string; difPct: number } | null;
  /** La cotización más baja de otro proveedor en los últimos 6 meses (difPct: cuánto más caro/barato está esta). */
  otroMasBarato: { proveedor: string; valor: number; fecha: string | null; codigo: string | null; presupuestoId: string; difPct: number } | null;
  /** Último presupuesto enviado con el mismo concepto, proveedor y medidas. */
  anterior: {
    presupuestoId: string;
    codigo: string | null;
    fecha: string | null;
    markup: number;
    costoPieza: number;
    mismoCosto: boolean;
  } | null;
};

const dif = (actual: number, ref: number) => (ref === 0 ? 0 : redondear((actual / ref - 1) * 100));

export function comparar(linea: Medida, refs: Referencia[], presupuestoId: string | null, hoy: string): Comparacion {
  const candidatas = refs.filter((r) => r.presupuestoId !== presupuestoId && r.estado !== "cancelado" && mismoConcepto(linea, r));
  const unitario = costoUnitario(linea);

  let ultimaDelProveedor: Comparacion["ultimaDelProveedor"] = null;
  let otroMasBarato: Comparacion["otroMasBarato"] = null;
  if (unitario) {
    const delMismoTipo = candidatas
      .map((r) => ({ r, u: costoUnitario(r) }))
      .filter((x): x is { r: Referencia; u: NonNullable<ReturnType<typeof costoUnitario>> } => x.u?.por === unitario.por);
    const prov = delMismoTipo.filter((x) => mismoProveedor(linea, x.r)).sort((a, b) => masReciente(a.r, b.r))[0];
    if (prov) {
      ultimaDelProveedor = { valor: prov.u.valor, fecha: prov.r.fecha, codigo: prov.r.codigo, presupuestoId: prov.r.presupuestoId, difPct: dif(unitario.valor, prov.u.valor) };
    }
    const desde = mesesAntes(hoy, 6);
    const otro = delMismoTipo
      .filter((x) => (x.r.fecha ?? "") >= desde && !!normalizar(x.r.proveedor) && !mismoProveedor(linea, x.r))
      .sort((a, b) => a.u.valor - b.u.valor || masReciente(a.r, b.r))[0];
    if (otro) {
      otroMasBarato = {
        proveedor: otro.r.proveedor!,
        valor: otro.u.valor,
        fecha: otro.r.fecha,
        codigo: otro.r.codigo,
        presupuestoId: otro.r.presupuestoId,
        difPct: dif(unitario.valor, otro.u.valor),
      };
    }
  }

  let anterior: Comparacion["anterior"] = null;
  const enviada = candidatas
    .filter((r) => ESTADOS_ENVIADOS.includes(r.estado) && r.markupAplicado != null && r.cotizacionTotal != null)
    .filter((r) => mismoProveedor(linea, r) && mismasMedidas(linea, r))
    .sort(masReciente)[0];
  if (enviada) {
    const costoPieza = redondear(enviada.cotizacionTotal! / piezasDe(enviada));
    const actual = linea.cotizacionTotal == null ? null : redondear(linea.cotizacionTotal / piezasDe(linea));
    anterior = {
      presupuestoId: enviada.presupuestoId,
      codigo: enviada.codigo,
      fecha: enviada.fecha,
      markup: enviada.markupAplicado!,
      costoPieza,
      mismoCosto: actual != null && actual === costoPieza,
    };
  }

  return { unitario, ultimaDelProveedor, otroMasBarato, anterior };
}
