import { describe, expect, it } from "vitest";
import { usaHoras } from "./lineas";

describe("usaHoras", () => {
  it("Unidad y Servicio no llevan horas", () => {
    for (const u of ["Unidad", "unidades", "Servicio", " servicios "]) expect(usaHoras(u)).toBe(false);
  });
  it("las demás unidades sí", () => {
    for (const u of ["Hora", "Día", "Jornada", "", null]) expect(usaHoras(u)).toBe(true);
  });
});
