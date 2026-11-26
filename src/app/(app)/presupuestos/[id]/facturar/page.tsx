import { Suspense } from "react";
import { facturarPresupuesto } from "@/app/actions";
import { FormAccion } from "@/components/form-accion";
import { hoy } from "@/lib/formato";

export default function Page({ params }: PageProps<"/presupuestos/[id]/facturar">) {
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Facturar en Sigma</h1>
      <p className="text-sm text-zinc-600">
        Se envía a <code>ImportFactura</code> con el total del presupuesto como un ítem de servicio.
        Sigma registra facturas emitidas por otro sistema: el número de comprobante (y el CAE, si ya lo tenés) son los de AFIP.
      </p>
      <Suspense>
        <Formulario params={params} />
      </Suspense>
    </div>
  );
}

async function Formulario({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <FormAccion action={facturarPresupuesto} boton="Enviar a Sigma" className="card space-y-3">
      <input type="hidden" name="presupuesto_id" value={id} />
      <label className="block text-sm">Fecha<input type="date" name="fecha" required defaultValue={hoy()} className="input mt-1" /></label>
      <label className="block text-sm">Número de comprobante<input name="numero_comprobante" required className="input mt-1" placeholder="00000123" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">CAE (opcional)<input name="cae_numero" className="input mt-1" /></label>
        <label className="block text-sm">Vencimiento CAE<input type="date" name="cae_vencimiento" className="input mt-1" /></label>
      </div>
      <label className="block text-sm">Observación<input name="observacion" maxLength={200} className="input mt-1" /></label>
    </FormAccion>
  );
}
