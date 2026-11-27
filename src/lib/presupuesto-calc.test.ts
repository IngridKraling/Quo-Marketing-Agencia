import { describe, expect, it } from "vitest";
import {
  calcularLinea,
  conTramo,
  estadoComercial,
  lineaVacia,
  markupDeTramo,
  opcionesComerciales,
  controlProyecto,
  costoReal,
  erroresParaAprobar,
  estadoReal,
  resumenPresupuesto,
  type Linea,
  type Parametros,
  type RubroInfo,
} from "./presupuesto-calc";

const P: Parametros = { markupDefault: 1.4, impuestosPct: 5, margenMinimoPct: 20 };

const rubro = (id: string, extra: Partial<RubroInfo> = {}): RubroInfo => ({ id, nombre: id, alertaSinCotizar: false, revisarSiSeUsa: false, ...extra });
const RUBROS = [rubro("Personal"), rubro("Logística y flete", { alertaSinCotizar: true }), rubro("Viaticos", { alertaSinCotizar: true }), rubro("Juegos"), rubro("Otros", { revisarSiSeUsa: true })];

const linea = (rubroId: string, precio: number, cant: number | null, horas: number | null, dias: number | null, markupConcepto: number | null): Linea => ({
  rubroId, precioUnitario: precio, cantidad: cant, horas, dias, markup: null, markupConcepto,
});

// Proyecto real del Excel: BTL-ROLCAR-001 (BYD · Lanzamiento).
const ROLCAR: Linea[] = [
  linea("Personal", 10000, 1, 5, null, 1.6), // Supervisor
  linea("Personal", 6200, 2, 4, null, 1.6), // Ayudante armado/desarme
  linea("Personal", 6200, 1, 6, null, 1.6), // Ayudante evento
  linea("Personal", 9300, 1, 6, null, 1.6), // Promotoras
  linea("Logística y flete", 100000, 1, null, null, 1.4), // Camioneta para evento
  linea("Viaticos", 20000, 4, null, 2, 1.4), // Viáticos ayudantes
  linea("Juegos", 30000, 1, null, null, 1.4), // Dado
];

describe("calcularLinea (fórmulas del Excel)", () => {
  it("costo = precio × cantidad × horas × días, con vacío = 1", () => {
    expect(calcularLinea(ROLCAR[1], P)).toMatchObject({ costo: 49600, markup: 1.6, venta: 79360, impuestos: 3968, contribucion: 25792, margenPct: 32.5 });
    expect(calcularLinea(ROLCAR[5], P)).toMatchObject({ costo: 160000, venta: 224000, impuestos: 11200, contribucion: 52800, margenPct: 23.57 });
  });

  it("markup: el de la línea › el del concepto › el general", () => {
    const base = linea("Juegos", 1000, 1, null, null, 1.6);
    expect(calcularLinea(base, P).markup).toBe(1.6);
    expect(calcularLinea({ ...base, markup: 2 }, P).markup).toBe(2);
    expect(calcularLinea({ ...base, markupConcepto: null }, P).markup).toBe(1.4);
  });

  it("línea de Plan de medios con markup manual (PE-CCU-008)", () => {
    const r = calcularLinea({ ...linea("Plan de medios", 3480195.65, 1, null, null, 1.4), markup: 1.460240349 }, P);
    expect(r.venta).toBe(5081922.11);
    expect(r.impuestos).toBe(254096.11);
    expect(r.contribucion).toBe(1347630.35);
  });
});

describe("resumenPresupuesto", () => {
  it("da los mismos totales que el Excel para BTL-ROLCAR-001", () => {
    const r = resumenPresupuesto(ROLCAR, RUBROS, P);
    expect(r.costo).toBe(482600);
    expect(r.venta).toBe(714160);
    expect(r.contribucion).toBe(195852);
    expect(r.margenPct).toBe(27.42);
    expect(r.markupPromedio).toBe(1.48);
  });

  it("alertas por rubro: sin cotizar, revisar Otros y margen bajo", () => {
    const sinLogistica = ROLCAR.filter((l) => l.rubroId !== "Logística y flete");
    const conOtros = [...sinLogistica, linea("Otros", 5000, 1, null, null, null)];
    const r = resumenPresupuesto(conOtros, RUBROS, { ...P, margenMinimoPct: 25 });
    const alerta = (id: string) => r.porRubro.find((x) => x.rubro.id === id)?.alerta;
    expect(alerta("Logística y flete")).toBe("Sin cotizar: confirmar si corresponde");
    expect(alerta("Viaticos")).toBeNull();
    expect(alerta("Otros")).toBe("Revisar: ¿falta un rubro?");
    expect(alerta("Juegos")).toBe("Margen bajo"); // 23,57 % < 25 %
    expect(alerta("Personal")).toBeNull(); // 32,5 %
  });

  it("los gastos no presupuestados no suman costo ni venta", () => {
    const r = resumenPresupuesto([...ROLCAR, { ...linea("Otros", 0, null, null, null, null), presupuestada: false, precioUnitario: null }], RUBROS, P);
    expect(r.costo).toBe(482600);
  });
});

describe("erroresParaAprobar", () => {
  it("no deja aprobar con cantidad 0, sin rubro o sin precio", () => {
    const errores = erroresParaAprobar([
      { ...linea("Personal", 1000, 0, 8, 1, 1.6), concepto: "Promotoras" },
      { ...linea("", 1000, 1, null, null, null), rubroId: null, concepto: "X" },
      { ...linea("Tecnica", 0, 1, null, null, null), precioUnitario: null, concepto: "Sonido" },
    ]);
    expect(errores).toHaveLength(3);
    expect(errores[1]).toContain("Promotoras");
    expect(erroresParaAprobar(ROLCAR.map((l) => ({ ...l, concepto: "c" })))).toEqual([]);
  });
});

describe("costos reales", () => {
  const presup = linea("Personal", 6200, 2, 4, 1, 1.6); // 49.600
  const real = (r: Partial<NonNullable<Linea["real"]>>) => ({ igual: false, precio: null, cantidad: null, horas: null, dias: null, monto: null, ...r });

  it("pendiente si no se cargó nada", () => {
    expect(costoReal({ ...presup, real: real({}) })).toBeNull();
    expect(estadoReal({ ...presup, real: real({}) })).toBe("pendiente");
  });
  it("igual a presupuesto", () => {
    expect(costoReal({ ...presup, real: real({ igual: true }) })).toBe(49600);
    expect(estadoReal({ ...presup, real: real({ igual: true }) })).toBe("ok");
  });
  it("cambios puntuales: lo vacío toma el valor presupuestado", () => {
    expect(costoReal({ ...presup, real: real({ horas: 6 }) })).toBe(74400);
    expect(estadoReal({ ...presup, real: real({ horas: 6 }) })).toBe("excedido");
    expect(costoReal({ ...presup, real: real({ cantidad: 1 }) })).toBe(24800);
    expect(estadoReal({ ...presup, real: real({ cantidad: 1 }) })).toBe("ahorro");
  });
  it("el monto de factura pisa todo", () => {
    expect(costoReal({ ...presup, real: real({ igual: true, horas: 10, monto: 50000 }) })).toBe(50000);
    expect(estadoReal({ ...presup, real: real({ monto: 50000 }) })).toBe("excedido"); // sin tolerancia: cualquier diferencia cuenta
    expect(estadoReal({ ...presup, real: real({ monto: 49600 }) })).toBe("ok");
  });
  it("gasto no presupuestado y línea quitada", () => {
    const extra: Linea = { rubroId: "Otros", precioUnitario: null, cantidad: null, horas: null, dias: null, markup: null, markupConcepto: null, presupuestada: false };
    expect(estadoReal({ ...extra, real: real({}) })).toBe("pendiente");
    expect(estadoReal({ ...extra, real: real({ monto: 15000 }) })).toBe("no_presupuestado");
    expect(estadoReal({ ...presup, precioUnitario: 0, real: real({ monto: 100 }) })).toBe("quitada");
  });
});

describe("controlProyecto", () => {
  it("compara por rubro y arma el resultado con lo facturado", () => {
    const real = (r: Partial<NonNullable<Linea["real"]>>) => ({ igual: false, precio: null, cantidad: null, horas: null, dias: null, monto: null, ...r });
    const lineas: Linea[] = [
      { ...ROLCAR[0], real: real({ igual: true }) }, // 50.000
      { ...ROLCAR[4], real: real({ monto: 130000 }) }, // flete 100.000 → 130.000: excedido
      { ...ROLCAR[6], real: real({}) }, // pendiente
      { rubroId: "Otros", precioUnitario: null, cantidad: null, horas: null, dias: null, markup: null, markupConcepto: null, presupuestada: false, real: real({ monto: 20000 }) },
    ];
    const c = controlProyecto(lineas, RUBROS, P, 300000);
    const r = (id: string) => c.porRubro.find((x) => x.rubro.id === id)!;
    expect(r("Logística y flete")).toMatchObject({ presupuestado: 100000, real: 130000, desvio: 30000, desvioPct: 30, control: null });
    expect(r("Otros")).toMatchObject({ presupuestado: 0, real: 20000, control: "No presupuestado" });
    expect(r("Juegos").pendientes).toBe(1);
    expect(c.pendientes).toBe(1);
    expect(c.real).toMatchObject({ venta: 300000, costo: 200000, impuestos: 15000, contribucion: 85000, margenPct: 28.33 });
    expect(c.presupuestado.costo).toBe(180000);
    // Desvío total de costos: 200.000 real vs. 180.000 presupuestado.
    expect(c.desvio).toEqual({ costo: 20000, costoPct: 11.11 });
  });
});

describe("markup por tramo (Trade)", () => {
  const TRAMOS = [
    { hasta: 2000000, markup: 1.6 },
    { hasta: null, markup: 1.5 },
    { hasta: 1000000, markup: 1.7 },
    { hasta: 3500000, markup: 1.55 },
  ];
  const linea = (costo: number, extra: Partial<Linea> = {}): Linea => ({
    rubroId: "Carteles", precioUnitario: costo, cantidad: 1, horas: null, dias: null, markup: null, markupConcepto: 1.4, ...extra,
  });

  it("'hasta' incluye el monto y el último tramo no tiene tope", () => {
    expect(markupDeTramo(0, TRAMOS)).toBe(1.7);
    expect(markupDeTramo(1000000, TRAMOS)).toBe(1.7);
    expect(markupDeTramo(1000000.01, TRAMOS)).toBe(1.6);
    expect(markupDeTramo(2000000, TRAMOS)).toBe(1.6);
    expect(markupDeTramo(3500000, TRAMOS)).toBe(1.55);
    expect(markupDeTramo(9000000, TRAMOS)).toBe(1.5);
    expect(markupDeTramo(500, [])).toBeNull();
  });

  it("el tramo sale del costo total y pisa el markup del concepto", () => {
    const r = resumenPresupuesto([linea(600000), linea(600000)], [], { ...P, tramos: TRAMOS });
    expect(r.costo).toBe(1200000);
    expect(r.markupTramo).toBe(1.6);
    expect(r.venta).toBe(1920000);
  });

  it("el markup cargado a mano en la línea sigue mandando", () => {
    const r = resumenPresupuesto([linea(600000, { markup: 2 }), linea(400000)], [], { ...P, tramos: TRAMOS });
    expect(r.markupTramo).toBe(1.7);
    expect(r.venta).toBe(600000 * 2 + 400000 * 1.7);
  });

  it("sin tramos se usa el markup del concepto, como siempre", () => {
    const r = resumenPresupuesto([linea(600000)], [], P);
    expect(r.markupTramo).toBeNull();
    expect(r.venta).toBe(840000);
    expect(conTramo([linea(1)], P).markupTramo).toBeNull();
  });
});

describe("estado en dos partes", () => {
  it("lo aprobado y sus etapas se ven como Aprobado en la columna Estado", () => {
    expect(["aprobado", "en_ejecucion", "finalizado", "facturado"].map((e) => estadoComercial(e as never))).toEqual(["aprobado", "aprobado", "aprobado", "aprobado"]);
    expect(estadoComercial("enviado")).toBe("enviado");
  });
  it("una vez aprobado, el Estado solo se puede cancelar", () => {
    expect(opcionesComerciales("en_ejecucion")).toEqual(["aprobado", "cancelado"]);
    expect(opcionesComerciales("borrador")).toEqual(["borrador", "enviado", "aprobado", "rechazado", "cancelado"]);
  });
});

describe("lineaVacia", () => {
  const l = (x: Partial<Linea>): Linea => ({ rubroId: "r", precioUnitario: 1000, cantidad: 1, horas: null, dias: null, markup: null, markupConcepto: null, ...x });
  it("cantidad 0 o sin precio ni cotización se quita al aprobar", () => {
    expect(lineaVacia(l({ cantidad: 0 }))).toBe(true);
    expect(lineaVacia(l({ precioUnitario: null }))).toBe(true);
    expect(lineaVacia(l({ precioUnitario: null, cotizacionTotal: 50000 }))).toBe(false);
    expect(lineaVacia(l({}))).toBe(false);
    expect(lineaVacia(l({ cantidad: 0, presupuestada: false }))).toBe(false); // gastos no presupuestados no se tocan
  });
});
