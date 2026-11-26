import { redondear } from "@/lib/presupuesto-calc";
import type { ImportFacturaBody } from "./types";

/** Datos fijos de facturación de la agencia en Sigma (vienen de variables de entorno). */
export type ConfigFacturacion = {
  deviceId: string;
  empresa: string;
  puntoDeVenta: number;
  letraComprobante: "A" | "B" | "C" | "M";
  codigoComprobante: string;
  /** Artículo de servicio genérico en Sigma con el que se factura el presupuesto. */
  articuloServicio: string;
  afipCodigoComprobante?: string;
};

export type DatosFactura = {
  /** Id único (usamos el uuid de la fila `facturas`): Sigma lo usa con deviceId para idempotencia. */
  id: string;
  fecha: string; // yyyy-mm-dd
  numeroComprobante: string;
  cliente: { sigmaClienteId: string; tipoIva: number; condicionVenta: string; vendedor?: string | null };
  subtotal: number;
  ivaPct: number;
  observacion?: string | null;
  cae?: { numero: string; vencimiento: string } | null;
};

export function configFacturacionDesdeEnv(env: NodeJS.ProcessEnv = process.env): ConfigFacturacion {
  const req = (k: string) => {
    const v = env[k];
    if (!v) throw new Error(`Falta la variable de entorno ${k}`);
    return v;
  };
  const letra = req("SIGMA_LETRA_COMPROBANTE");
  if (!["A", "B", "C", "M"].includes(letra)) throw new Error("SIGMA_LETRA_COMPROBANTE debe ser A, B, C o M");
  return {
    deviceId: env.SIGMA_DEVICE_ID || "QUO-PRESUPUESTOS",
    empresa: req("SIGMA_EMPRESA"),
    puntoDeVenta: Number(req("SIGMA_PUNTO_DE_VENTA")),
    letraComprobante: letra as ConfigFacturacion["letraComprobante"],
    codigoComprobante: req("SIGMA_CODIGO_COMPROBANTE"),
    articuloServicio: req("SIGMA_ARTICULO_SERVICIO"),
    afipCodigoComprobante: env.SIGMA_AFIP_CODIGO_COMPROBANTE || undefined,
  };
}

/**
 * Arma el cuerpo de ImportFactura para una factura (tipo F) de un solo ítem de servicio.
 * Replica las validaciones de consistencia de Sigma para fallar antes de enviar:
 *  - subtotal + iva (+ percepciones/imp. internos, acá 0) = total
 *  - Σ IVA por ítem difiere a lo sumo ±1 de ivaMonto
 */
export function construirImportFactura(cfg: ConfigFacturacion, d: DatosFactura): ImportFacturaBody {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) throw new Error("fecha debe tener formato yyyy-mm-dd");
  if (!d.numeroComprobante.trim()) throw new Error("numeroComprobante obligatorio");
  if (!(d.subtotal > 0)) throw new Error("El subtotal debe ser mayor que 0");
  if (!(d.ivaPct > 0)) throw new Error("Sigma exige ivaMonto > 0: el IVA del presupuesto debe ser mayor que 0");
  if (d.cae && (!d.cae.numero || !d.cae.vencimiento)) throw new Error("caeNumero y caeVencimiento van juntos");

  const subtotal = redondear(d.subtotal);
  const iva = redondear((subtotal * d.ivaPct) / 100);
  const total = redondear(subtotal + iva);

  const body: ImportFacturaBody = {
    id: d.id,
    deviceId: cfg.deviceId,
    fecha: d.fecha,
    empresa: cfg.empresa,
    puntoDeVenta: cfg.puntoDeVenta,
    letraComprobante: cfg.letraComprobante,
    tipoComprobante: "F",
    codigoComprobante: cfg.codigoComprobante,
    numeroComprobante: d.numeroComprobante.trim().padStart(8, "0"),
    estado: false,
    tipoIva: d.cliente.tipoIva,
    clienteId: d.cliente.sigmaClienteId,
    condicionVenta: d.cliente.condicionVenta,
    subtotalMonto: subtotal,
    ivaMonto: iva,
    totalMonto: total,
    observacion: d.observacion?.trim() || null,
    ...(d.cliente.vendedor ? { vendedor: d.cliente.vendedor } : {}),
    ...(d.cae ? { caeNumero: d.cae.numero, caeVencimiento: d.cae.vencimiento } : {}),
    ...(cfg.afipCodigoComprobante ? { afipCodigoComprobante: cfg.afipCodigoComprobante } : {}),
    items: [
      {
        articuloId: cfg.articuloServicio,
        precio: subtotal,
        cantidad: 1,
        descuentoPorcentaje: 0,
        // Se envía explícito: sin `descuento`, Sigma no valida el IVA por ítem.
        descuento: 0,
        ivaPorcentual: d.ivaPct,
        impuestoInternoMonto: 0,
        impuestoInternoPorcentual: 0,
        comboId: null,
        politicaId: null,
      },
    ],
  };

  validarConsistencia(body);
  return body;
}

export function validarConsistencia(b: ImportFacturaBody) {
  if (Math.abs(b.subtotalMonto + b.ivaMonto - b.totalMonto) > 0.005) {
    throw new Error("subtotalMonto + ivaMonto no coincide con totalMonto");
  }
  const ivaItems = b.items.reduce(
    (s, it) => s + (it.precio * it.cantidad * (1 - it.descuento / 100) * it.ivaPorcentual) / 100,
    0,
  );
  if (Math.abs(ivaItems - b.ivaMonto) > 1) throw new Error("La sumatoria del IVA de los ítems difiere en más de ±1");
}
