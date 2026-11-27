import { describe, expect, it } from "vitest";
import { agruparPorRubro, arrastrarLinea, arrastrarRubro, ordenDeRubros, usaHoras } from "./lineas";

describe("usaHoras", () => {
  it("Unidad y Servicio no llevan horas", () => {
    for (const u of ["Unidad", "unidades", "Servicio", " servicios "]) expect(usaHoras(u)).toBe(false);
  });
  it("las demás unidades sí", () => {
    for (const u of ["Hora", "Día", "Jornada", "", null]) expect(usaHoras(u)).toBe(true);
  });
});

describe("orden manual", () => {
  const l = (id: string, rubro_id: string | null) => ({ id, rubro_id });
  const base = [l("a1", "A"), l("b1", "B"), l("a2", "A"), l("c1", "C"), l("b2", "B")];
  const ids = (x: { id: string }[]) => x.map((y) => y.id).join(",");

  it("los rubros van en el orden de su primera línea y las líneas quedan juntas", () => {
    expect(ordenDeRubros(base)).toEqual(["A", "B", "C"]);
    expect(ids(agruparPorRubro(base))).toBe("a1,a2,b1,b2,c1");
  });
});

describe("arrastrar", () => {
  const l = (id: string, rubro_id: string | null) => ({ id, rubro_id });
  const base = [l("a1", "A"), l("a2", "A"), l("a3", "A"), l("b1", "B"), l("c1", "C")];
  const ids = (x: { id: string }[]) => x.map((y) => y.id).join(",");
  it("un rubro arrastrado ocupa el lugar del destino", () => {
    expect(ids(arrastrarRubro(base, "C", "A"))).toBe("c1,a1,a2,a3,b1");
    expect(ids(arrastrarRubro(base, "A", "C"))).toBe("b1,c1,a1,a2,a3");
  });
  it("una línea arrastrada ocupa el lugar de otra del mismo rubro, nunca de otro", () => {
    expect(ids(arrastrarLinea(base, "a3", "a1"))).toBe("a3,a1,a2,b1,c1");
    expect(ids(arrastrarLinea(base, "a1", "a3"))).toBe("a2,a3,a1,b1,c1");
    expect(ids(arrastrarLinea(base, "a1", "b1"))).toBe("a1,a2,a3,b1,c1");
  });
});
