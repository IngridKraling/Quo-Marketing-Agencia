import { describe, expect, it } from "vitest";
import { alfabetico, opcionesMarca } from "./opciones";

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
