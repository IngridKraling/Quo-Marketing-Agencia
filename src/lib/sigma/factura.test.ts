import { describe, expect, it } from "vitest";
import { construirImportFactura, configFacturacionDesdeEnv, type ConfigFacturacion } from "./factura";

const cfg: ConfigFacturacion = {
  deviceId: "QUO-PRESUPUESTOS",
  empresa: "0001",
  puntoDeVenta: 3,
  letraComprobante: "A",
  codigoComprobante: "FA",
  articuloServicio: "SERV01",
};

const base = {
  id: "8a1f3c1e-0000-4000-8000-000000000001",
  fecha: "2026-11-26",
  numeroComprobante: "123",
  cliente: { sigmaClienteId: "230016", tipoIva: 1, condicionVenta: "00", vendedor: "080" },
  subtotal: 283000,
  ivaPct: 21,
};

describe("construirImportFactura", () => {
  it("arma un cuerpo consistente con un ítem de servicio", () => {
    const b = construirImportFactura(cfg, base);
    expect(b.numeroComprobante).toBe("00000123");
    expect(b.subtotalMonto).toBe(283000);
    expect(b.ivaMonto).toBe(59430);
    expect(b.totalMonto).toBe(342430);
    expect(b.deviceId).toBe("QUO-PRESUPUESTOS");
    expect(b.vendedor).toBe("080");
    expect(b.items).toHaveLength(1);
    expect(b.items[0]).toMatchObject({ articuloId: "SERV01", precio: 283000, cantidad: 1, ivaPorcentual: 21, descuento: 0 });
    expect(b).not.toHaveProperty("caeNumero");
  });

  it("redondea montos con centavos y sigue cuadrando", () => {
    const b = construirImportFactura(cfg, { ...base, subtotal: 1333.333 });
    expect(b.subtotalMonto).toBe(1333.33);
    expect(b.ivaMonto).toBe(280);
    expect(b.totalMonto).toBe(1613.33);
  });

  it("rechaza IVA 0, porque Sigma exige ivaMonto > 0", () => {
    expect(() => construirImportFactura(cfg, { ...base, ivaPct: 0 })).toThrow(/ivaMonto > 0/);
  });

  it("rechaza fechas mal formateadas y subtotales no positivos", () => {
    expect(() => construirImportFactura(cfg, { ...base, fecha: "26/11/2026" })).toThrow(/yyyy-mm-dd/);
    expect(() => construirImportFactura(cfg, { ...base, subtotal: 0 })).toThrow(/mayor que 0/);
  });

  it("incluye el CAE cuando viene completo", () => {
    const b = construirImportFactura(cfg, { ...base, cae: { numero: "74123456789012", vencimiento: "2026-12-06" } });
    expect(b.caeNumero).toBe("74123456789012");
    expect(b.caeVencimiento).toBe("2026-12-06");
  });
});

describe("configFacturacionDesdeEnv", () => {
  it("valida variables obligatorias", () => {
    expect(() => configFacturacionDesdeEnv({} as NodeJS.ProcessEnv)).toThrow(/SIGMA_LETRA_COMPROBANTE/);
  });
});
