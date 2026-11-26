import { describe, expect, it } from "vitest";
import { calcularTotales } from "./presupuesto-calc";

describe("calcularTotales", () => {
  it("aplica markup a horas y externos, y suma IVA sobre el neto", () => {
    const t = calcularTotales({
      horas: [
        { horas: 10, costoHora: 5000 },
        { horas: 4, costoHora: 8000 },
      ],
      externos: [{ costo: 100000 }, { costo: 50000, markupPct: 0 }],
      markupHorasPct: 50,
      markupExternosPct: 10,
      ivaPct: 21,
    });
    expect(t.horasTotales).toBe(14);
    expect(t.costoHoras).toBe(82000);
    expect(t.precioHoras).toBe(123000);
    expect(t.costoExternos).toBe(150000);
    expect(t.precioExternos).toBe(160000);
    expect(t.subtotal).toBe(283000);
    expect(t.iva).toBe(59430);
    expect(t.total).toBe(342430);
    expect(t.costoTotal).toBe(232000);
    expect(t.margen).toBe(51000);
    expect(t.margenPct).toBe(18.02);
  });

  it("devuelve ceros con un presupuesto vacío", () => {
    const t = calcularTotales({ horas: [], externos: [], markupHorasPct: 30, markupExternosPct: 0, ivaPct: 21 });
    expect(t.total).toBe(0);
    expect(t.margenPct).toBe(0);
  });

  it("redondea a centavos", () => {
    const t = calcularTotales({
      horas: [{ horas: 1.333, costoHora: 1000 }],
      externos: [],
      markupHorasPct: 0,
      markupExternosPct: 0,
      ivaPct: 21,
    });
    expect(t.subtotal).toBe(1333);
    expect(t.iva).toBe(279.93);
    expect(t.total).toBe(1612.93);
  });
});
