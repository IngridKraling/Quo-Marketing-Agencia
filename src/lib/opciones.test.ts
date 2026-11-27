import { describe, expect, it } from "vitest";
import { alfabetico, conceptosParaArea, opcionesMarca, rubrosParaArea } from "./opciones";

describe("desplegables", () => {
  it("ordena A → Z con OTROS al final", () => {
    expect(["ROMAR", "OTROS", "CCU", "AGUAS DE ORIGEN", "ARCA CONTINENTAL"].sort(alfabetico)).toEqual([
      "AGUAS DE ORIGEN",
      "ARCA CONTINENTAL",
      "CCU",
      "ROMAR",
      "OTROS",
    ]);
  });

  it("las marcas del cliente terminan siempre en OTROS, sin repetirla", () => {
    const marcas = [
      { cliente_id: "ccu", nombre: "CERVEZA SALTA" },
      { cliente_id: "ccu", nombre: "otros" },
      { cliente_id: "ccu", nombre: "CERVEZA NORTE" },
      { cliente_id: "arca", nombre: "FANTA" },
    ];
    expect(opcionesMarca(marcas, "ccu")).toEqual(["CERVEZA NORTE", "CERVEZA SALTA", "OTROS"]);
    expect(opcionesMarca(marcas, "sin-marcas")).toEqual(["OTROS"]);
  });
});

describe("rubrosParaArea", () => {
  const rubros = [
    { id: "personal", areaId: null },
    { id: "tecnica", areaId: "btl" },
    { id: "carteles", areaId: "trade" },
    { id: "otros" },
  ];
  it("el área ve sus rubros y los comunes", () => {
    expect(rubrosParaArea(rubros, "trade").map((r) => r.id)).toEqual(["personal", "carteles", "otros"]);
    expect(rubrosParaArea(rubros, "btl").map((r) => r.id)).toEqual(["personal", "tecnica", "otros"]);
  });
  it("un área sin rubros propios, o sin área elegida, ve todo", () => {
    expect(rubrosParaArea(rubros, "proyectos-especiales")).toHaveLength(4);
    expect(rubrosParaArea(rubros, null)).toHaveLength(4);
  });
});

describe("conceptosParaArea", () => {
  const conceptos = [{ n: "Supervisor", areas_ocultas: [] }, { n: "Promotoras", areas_ocultas: ["trade"] }, { n: "Flete" }];
  it("saca los conceptos ocultos en el área", () => {
    expect(conceptosParaArea(conceptos, "trade").map((c) => c.n)).toEqual(["Supervisor", "Flete"]);
    expect(conceptosParaArea(conceptos, "btl")).toHaveLength(3);
    expect(conceptosParaArea(conceptos, null)).toHaveLength(3);
  });
});
