/** Subconjunto de campos de ExportClientes que usamos. La API puede agregar campos. */
export type SigmaCliente = {
  id: string;
  nombre: string;
  condicionIva: string | null;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  eMail: string | null;
  suspendido: boolean;
  desactivado: boolean;
  vendedorPredeterminado: string | null;
  vendedores?: { vendedor: string; condicionVenta: string | null }[];
};

export type ImportFacturaItem = {
  articuloId: string;
  precio: number;
  descuentoPorcentaje: number;
  descuento: number;
  ivaPorcentual: number;
  cantidad: number;
  impuestoInternoMonto: number;
  impuestoInternoPorcentual: number;
  comboId: null;
  politicaId: null;
};

export type ImportFacturaBody = {
  id: string;
  deviceId: string;
  fecha: string;
  empresa: string;
  puntoDeVenta: number;
  letraComprobante: "A" | "B" | "C" | "M";
  tipoComprobante: "F" | "C" | "D";
  codigoComprobante: string;
  numeroComprobante: string;
  estado: false;
  tipoIva: number;
  clienteId: string;
  condicionVenta: string;
  subtotalMonto: number;
  ivaMonto: number;
  totalMonto: number;
  observacion: string | null;
  vendedor?: string;
  caeNumero?: string;
  caeVencimiento?: string;
  afipCodigoComprobante?: string;
  items: ImportFacturaItem[];
};
