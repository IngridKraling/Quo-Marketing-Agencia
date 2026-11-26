import { describe, expect, it } from "vitest";
import { parsearMonto, pesos } from "./formato";

describe("montos", () => {
  it("muestra pesos con puntos de miles y coma decimal", () => {
    expect(pesos(30000).replace(/\s/g, " ")).toBe("$ 30.000,00");
  });

  it("lee lo que se escribe a mano", () => {
    expect(parsearMonto("$ 30.000,50")).toBe(30000.5);
    expect(parsearMonto("30000")).toBe(30000);
    expect(parsearMonto("30.000")).toBe(30000);
    expect(parsearMonto("1.250.000")).toBe(1250000);
    expect(parsearMonto("1,5")).toBe(1.5);
    expect(parsearMonto("30000.5")).toBe(30000.5);
    expect(parsearMonto("")).toBeNull();
    expect(parsearMonto("abc")).toBeNull();
  });

  it("vuelve al mismo número después de formatear", () => {
    for (const n of [0, 6200, 30000, 1234567.89]) expect(parsearMonto(pesos(n))).toBe(n);
  });
});
