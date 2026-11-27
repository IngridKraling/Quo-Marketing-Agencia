import { describe, expect, it } from "vitest";
import { comparar, costoUnitario, metros2, type Medida, type Referencia } from "./medidas";

const saliente: Medida = { conceptoId: "sal", concepto: "Saliente circular", proveedor: "Publisite", base: 0.6, altura: 0.6, piezas: 2, cotizacionTotal: 200000 };
const ref = (r: Partial<Referencia>): Referencia => ({
  ...saliente,
  presupuestoId: "p1",
  codigo: "TM-ARCA-001",
  estado: "enviado",
  fecha: "2026-11-10",
  markupAplicado: 1.55,
  ...r,
});
const HOY = "2026-11-27";

describe("medidas", () => {
  it("m² = base × altura × piezas y costo por m² o por pieza", () => {
    expect(metros2(saliente)).toBe(0.72);
    expect(costoUnitario(saliente)).toEqual({ valor: 277777.78, por: "m2" });
    expect(costoUnitario({ ...saliente, base: null, altura: null })).toEqual({ valor: 100000, por: "pieza" });
    expect(costoUnitario({ ...saliente, cotizacionTotal: null })).toBeNull();
  });
});

describe("comparar", () => {
  it("respeta el markup del último presupuesto enviado con mismo concepto, proveedor, medidas y costo", () => {
    const c = comparar(saliente, [ref({ fecha: "2026-10-01", markupAplicado: 1.6, presupuestoId: "viejo" }), ref({})], "actual", HOY);
    expect(c.anterior).toMatchObject({ presupuestoId: "p1", codigo: "TM-ARCA-001", markup: 1.55, mismoCosto: true });
  });

  it("si cambió el costo lo informa pero no lo marca como mismo costo", () => {
    const c = comparar({ ...saliente, cotizacionTotal: 220000 }, [ref({})], "actual", HOY);
    expect(c.anterior).toMatchObject({ mismoCosto: false, costoPieza: 100000 });
  });

  it("no toma borradores, cancelados, otro proveedor, otras medidas ni el mismo presupuesto", () => {
    const refs = [
      ref({ estado: "borrador" }),
      ref({ estado: "cancelado" }),
      ref({ proveedor: "MG Grafica" }),
      ref({ base: 0.8 }),
      ref({ presupuestoId: "actual" }),
    ];
    expect(comparar(saliente, refs, "actual", HOY).anterior).toBeNull();
  });

  it("los rechazados cuentan como enviados (el cliente vio el precio)", () => {
    expect(comparar(saliente, [ref({ estado: "rechazado" })], "actual", HOY).anterior?.markup).toBe(1.55);
  });

  it("última del mismo proveedor y promedio de todos en los últimos 6 meses", () => {
    const refs = [
      ref({ presupuestoId: "a", fecha: "2026-09-01", cotizacionTotal: 180000 }), // 250.000/m²
      ref({ presupuestoId: "b", fecha: "2026-11-01", cotizacionTotal: 216000 }), // 300.000/m²  ← última de Publisite
      ref({ presupuestoId: "c", fecha: "2026-10-15", proveedor: "Otro", cotizacionTotal: 144000 }), // 200.000/m²
      ref({ presupuestoId: "d", fecha: "2026-01-10", proveedor: "Otro", cotizacionTotal: 72000 }), // fuera de los 6 meses
      ref({ presupuestoId: "e", base: null, altura: null }), // por pieza: no se mezcla con $/m²
    ];
    const c = comparar(saliente, refs, "actual", HOY);
    expect(c.ultimaDelProveedor).toMatchObject({ presupuestoId: "b", valor: 300000, difPct: -7.41 });
    expect(c.promedio).toMatchObject({ valor: 250000, cantidad: 3, difPct: 11.11 });
  });

  it("compara por nombre si la línea no viene del catálogo, sin importar mayúsculas ni acentos", () => {
    const libre = { ...saliente, conceptoId: null, concepto: "SALIENTE CÍRCULAR" };
    expect(comparar(libre, [ref({ conceptoId: null, concepto: "Saliente circular" })], "actual", HOY).anterior).not.toBeNull();
  });
});
