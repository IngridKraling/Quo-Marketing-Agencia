/**
 * Cálculo de presupuestos, replicando el Excel "Presupuestos y Rentabilidad".
 *
 *   costo        = precio × cantidad × horas × días   (vacío = 1)
 *                  o, en las líneas por medida (Trade), la cotización total del proveedor
 *   markup       = el de la línea › el del tramo (áreas con tramos, según el costo total) › el del concepto › el general
 *                  (multiplicador: 1.4 = +40 %)
 *   venta        = costo × markup
 *   impuestos    = venta × Σ impuestos s/venta activos (IIBB…)
 *   contribución = venta − costo − impuestos;   margen % = contribución / venta
 *
 * Costo real de una línea: monto de factura › "igual a presupuesto" › cambios puntuales
 * (lo que no se carga toma el valor presupuestado) › pendiente.
 */

export type Origen = "propio" | "proveedor" | "personal";

export const ESTADOS = ["borrador", "enviado", "aprobado", "en_ejecucion", "finalizado", "facturado", "rechazado", "cancelado"] as const;
export type Estado = (typeof ESTADOS)[number];
export const ETIQUETA_ESTADO: Record<Estado, string> = {
  borrador: "Borrador",
  enviado: "Enviado",
  aprobado: "Aprobado",
  en_ejecucion: "En ejecución",
  finalizado: "Finalizado",
  facturado: "Facturado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};
/** Estados en los que el presupuesto quedó congelado (solo se cargan costos reales). */
export const estaCongelado = (e: Estado) => e === "aprobado" || e === "en_ejecucion" || e === "finalizado" || e === "facturado";

export type Parametros = {
  markupDefault: number;
  /** Suma de los impuestos s/venta activos, en %. */
  impuestosPct: number;
  margenMinimoPct: number;
  /** Tramos de markup del área del presupuesto (vacío = el área no usa tramos). */
  tramos?: Tramo[];
  /** Markup del tramo que corresponde al costo total. Lo completa `conTramo`. */
  markupTramo?: number | null;
};

/** "Hasta" incluye el monto; hasta = null es el último tramo, sin tope. */
export type Tramo = { hasta: number | null; markup: number };
export type TramoArea = Tramo & { areaId: string };

/** Parámetros con los tramos del área del presupuesto (si el área no tiene, queda sin tramos). */
export const paramsDeArea = <P extends Parametros>(p: P, tramos: TramoArea[], areaId: string | null | undefined): P => ({
  ...p,
  tramos: tramos.filter((t) => t.areaId === areaId).map(({ hasta, markup }) => ({ hasta, markup })),
});

export type Real = {
  igual: boolean;
  precio: number | null;
  cantidad: number | null;
  horas: number | null;
  dias: number | null;
  monto: number | null;
};

export type Linea = {
  rubroId: string | null;
  precioUnitario: number | null;
  cantidad: number | null;
  horas: number | null;
  dias: number | null;
  markup: number | null;
  markupConcepto: number | null;
  /** Líneas por medida (Trade): el costo es la cotización total del proveedor. */
  cotizacionTotal?: number | null;
  /** false = gasto no presupuestado: no suma costo ni venta, solo costo real. */
  presupuestada?: boolean;
  real?: Real;
};

export const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const uno = (v: number | null | undefined) => (v == null ? 1 : v);
const pct = (parte: number, total: number) => (total === 0 ? 0 : redondear((parte / total) * 100));

export function costoLinea(l: Linea): number {
  if (l.presupuestada === false) return 0;
  if (l.cotizacionTotal != null) return redondear(l.cotizacionTotal);
  if (l.precioUnitario == null) return 0;
  return redondear(l.precioUnitario * uno(l.cantidad) * uno(l.horas) * uno(l.dias));
}

export const markupAplicado = (l: Linea, p: Parametros) => l.markup ?? p.markupTramo ?? l.markupConcepto ?? p.markupDefault;

/** Markup del tramo para un costo total: el primero cuyo "hasta" lo incluye (o el sin tope). */
export function markupDeTramo(costoTotal: number, tramos: Tramo[]): number | null {
  const orden = [...tramos].sort((a, b) => (a.hasta ?? Infinity) - (b.hasta ?? Infinity));
  return orden.find((t) => t.hasta == null || costoTotal <= t.hasta)?.markup ?? null;
}

/** Parámetros con el markup del tramo resuelto según el costo total de las líneas presupuestadas. */
export function conTramo<P extends Parametros>(lineas: Linea[], p: P): P {
  if (!p.tramos?.length) return { ...p, markupTramo: null };
  const costoTotal = redondear(lineas.reduce((s, l) => s + costoLinea(l), 0));
  return { ...p, markupTramo: markupDeTramo(costoTotal, p.tramos) };
}

export type Resultado = { costo: number; venta: number; impuestos: number; contribucion: number; margenPct: number };

export function calcularLinea(l: Linea, p: Parametros): Resultado & { markup: number } {
  const costo = costoLinea(l);
  const markup = markupAplicado(l, p);
  const venta = l.presupuestada === false ? 0 : redondear(costo * markup);
  const impuestos = redondear((venta * p.impuestosPct) / 100);
  const contribucion = redondear(venta - costo - impuestos);
  return { costo, markup, venta, impuestos, contribucion, margenPct: pct(contribucion, venta) };
}

function sumar(rs: Resultado[]): Resultado {
  const t = rs.reduce(
    (a, r) => ({ costo: a.costo + r.costo, venta: a.venta + r.venta, impuestos: a.impuestos + r.impuestos, contribucion: a.contribucion + r.contribucion }),
    { costo: 0, venta: 0, impuestos: 0, contribucion: 0 },
  );
  const r = { costo: redondear(t.costo), venta: redondear(t.venta), impuestos: redondear(t.impuestos), contribucion: redondear(t.contribucion) };
  return { ...r, margenPct: pct(r.contribucion, r.venta) };
}

export type RubroInfo = {
  id: string;
  nombre: string;
  alertaSinCotizar: boolean;
  revisarSiSeUsa: boolean;
  areaId?: string | null;
  /** Rubro que se cotiza por medida (Trade): base × altura, piezas y cotización total. */
  porMedida?: boolean;
};

export function alertaRubro(rubro: RubroInfo, r: Resultado, p: Parametros): string | null {
  if (rubro.alertaSinCotizar) return r.costo === 0 ? "Sin cotizar: confirmar si corresponde" : null;
  if (rubro.revisarSiSeUsa) return r.costo > 0 ? "Revisar: ¿falta un rubro?" : null;
  if (r.venta > 0 && r.margenPct < p.margenMinimoPct) return "Margen bajo";
  return null;
}

export function resumenPresupuesto(lineas: Linea[], rubros: RubroInfo[], params: Parametros) {
  const p = conTramo(lineas, params);
  const calc = lineas.filter((l) => l.presupuestada !== false).map((l) => ({ l, r: calcularLinea(l, p) }));
  const total = sumar(calc.map((c) => c.r));
  const porRubro = rubros.map((rubro) => {
    const r = sumar(calc.filter((c) => c.l.rubroId === rubro.id).map((c) => c.r));
    return { rubro, ...r, alerta: alertaRubro(rubro, r, p) };
  });
  const sinRubro = calc.filter((c) => !c.l.rubroId || !rubros.some((r) => r.id === c.l.rubroId));
  return {
    ...total,
    markupPromedio: total.costo === 0 ? 0 : redondear(total.venta / total.costo),
    markupTramo: p.markupTramo ?? null,
    porRubro,
    lineasSinRubro: sinRubro.length,
  };
}

/** Problemas que impiden aprobar (igual que el Excel). */
export function erroresParaAprobar(lineas: (Linea & { concepto: string; proveedor?: string | null; porMedida?: boolean })[]): string[] {
  const presup = lineas.filter((l) => l.presupuestada !== false);
  const errores: string[] = [];
  if (!presup.length) errores.push("El presupuesto no tiene líneas");
  const sinRubro = presup.filter((l) => !l.rubroId).length;
  if (sinRubro) errores.push(`Hay ${sinRubro} línea(s) sin rubro`);
  const enCero = presup.filter((l) => l.cantidad === 0).map((l) => l.concepto);
  if (enCero.length) errores.push(`Líneas con cantidad 0 (completalas o borralas): ${enCero.join(", ")}`);
  const sinPrecio = presup.filter((l) => l.precioUnitario == null && l.cotizacionTotal == null).map((l) => l.concepto);
  if (sinPrecio.length) errores.push(`Líneas sin precio: ${sinPrecio.join(", ")}`);
  const sinProveedor = presup.filter((l) => l.porMedida && !l.proveedor?.trim()).map((l) => l.concepto);
  if (sinProveedor.length) errores.push(`Líneas de Trade sin proveedor: ${sinProveedor.join(", ")}`);
  return errores;
}

/* ---------- Costos reales ---------- */

export type EstadoReal = "pendiente" | "ok" | "excedido" | "ahorro" | "no_presupuestado" | "quitada";
export const ETIQUETA_ESTADO_REAL: Record<EstadoReal, string> = {
  pendiente: "Pendiente",
  ok: "OK",
  excedido: "Excedido",
  ahorro: "Ahorro",
  no_presupuestado: "No presupuestado",
  quitada: "Quitada del presupuesto",
};

/** Costo real de la línea, o null si todavía no se cargó nada. */
export function costoReal(l: Linea): number | null {
  const r = l.real;
  if (!r) return null;
  if (r.monto != null) return r.monto;
  if (r.igual) return l.presupuestada === false ? null : costoLinea(l);
  // Línea por medida: el "precio real" es la cotización total real.
  if (l.cotizacionTotal != null) return r.precio;
  if (r.precio == null && r.cantidad == null && r.horas == null && r.dias == null) return null;
  return redondear(
    (r.precio ?? l.precioUnitario ?? 0) * uno(r.cantidad ?? l.cantidad) * uno(r.horas ?? l.horas) * uno(r.dias ?? l.dias),
  );
}

export function estadoReal(l: Linea): EstadoReal {
  const real = costoReal(l);
  if (l.presupuestada === false) return real == null ? "pendiente" : "no_presupuestado";
  if (real == null) return "pendiente";
  const costo = costoLinea(l);
  if (costo === 0) return "quitada";
  if (real > costo) return "excedido";
  if (real < costo) return "ahorro";
  return "ok";
}

/** Control del proyecto: presupuestado vs. real por rubro y resultado (hoja Control_Proyecto). */
export function controlProyecto(lineas: Linea[], rubros: RubroInfo[], p: Parametros, facturado: number) {
  const porRubro = rubros.map((rubro) => {
    const ls = lineas.filter((l) => l.rubroId === rubro.id);
    const presupuestado = redondear(ls.reduce((s, l) => s + costoLinea(l), 0));
    const real = redondear(ls.reduce((s, l) => s + (costoReal(l) ?? 0), 0));
    const pendientes = ls.filter((l) => estadoReal(l) === "pendiente").length;
    const control = presupuestado === 0 && real > 0 ? "No presupuestado" : null;
    return { rubro, presupuestado, real, desvio: redondear(real - presupuestado), desvioPct: presupuestado === 0 ? null : pct(real - presupuestado, presupuestado), pendientes, control };
  });
  const costoPresup = redondear(porRubro.reduce((s, r) => s + r.presupuestado, 0));
  const costoRealTotal = redondear(porRubro.reduce((s, r) => s + r.real, 0));
  const resumen = resumenPresupuesto(lineas, rubros, p);
  const impReal = redondear((facturado * p.impuestosPct) / 100);
  const contribReal = redondear(facturado - costoRealTotal - impReal);
  return {
    porRubro,
    /** Desvío total de costos: real − presupuestado (positivo = se gastó de más). */
    desvio: {
      costo: redondear(costoRealTotal - costoPresup),
      costoPct: costoPresup === 0 ? null : pct(costoRealTotal - costoPresup, costoPresup),
    },
    pendientes: lineas.filter((l) => estadoReal(l) === "pendiente").length,
    presupuestado: { venta: resumen.venta, costo: costoPresup, impuestos: resumen.impuestos, contribucion: resumen.contribucion, margenPct: resumen.margenPct },
    real: { venta: redondear(facturado), costo: costoRealTotal, impuestos: impReal, contribucion: contribReal, margenPct: pct(contribReal, facturado) },
  };
}

/* ---------- Conversión desde la base (Postgres devuelve numeric como string) ---------- */

type Num = number | string | null | undefined;
export const numONull = (v: Num) => (v == null || v === "" ? null : Number(v));

export type FilaLinea = {
  rubro_id: string | null;
  precio_unitario: Num;
  cantidad: Num;
  horas: Num;
  dias: Num;
  markup: Num;
  markup_concepto: Num;
  cotizacion_total?: Num;
  presupuestada: boolean;
  real_igual?: boolean;
  real_precio?: Num;
  real_cantidad?: Num;
  real_horas?: Num;
  real_dias?: Num;
  real_monto?: Num;
};

export const lineaDesdeFila = (f: FilaLinea): Linea => ({
  rubroId: f.rubro_id,
  precioUnitario: numONull(f.precio_unitario),
  cantidad: numONull(f.cantidad),
  horas: numONull(f.horas),
  dias: numONull(f.dias),
  markup: numONull(f.markup),
  markupConcepto: numONull(f.markup_concepto),
  cotizacionTotal: numONull(f.cotizacion_total),
  presupuestada: f.presupuestada,
  real: {
    igual: !!f.real_igual,
    precio: numONull(f.real_precio),
    cantidad: numONull(f.real_cantidad),
    horas: numONull(f.real_horas),
    dias: numONull(f.real_dias),
    monto: numONull(f.real_monto),
  },
});
