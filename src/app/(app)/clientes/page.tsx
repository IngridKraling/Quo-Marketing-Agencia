import { Suspense } from "react";
import { guardarDatosFiscales, sincronizarClientes } from "@/app/actions";
import { FormAccion } from "@/components/form-accion";
import { createClient } from "@/lib/supabase/server";

export default function Page() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Clientes</h1>
        <FormAccion action={sincronizarClientes} boton="Sincronizar desde Sigma" />
      </div>
      <p className="text-sm text-zinc-600">
        Para facturar, cada cliente necesita el <b>tipo de IVA</b> (código numérico de Sigma) y la <b>condición de venta</b>.
      </p>
      <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
        <Listado />
      </Suspense>
    </div>
  );
}

async function Listado() {
  const supabase = await createClient();
  const { data } = await supabase.from("clientes").select("*").order("nombre");
  if (!data?.length) return <p className="card text-sm text-zinc-500">Sin clientes. Sincronizá desde Sigma.</p>;
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[760px]">
        <thead><tr><th className="th">Código Sigma</th><th className="th">Nombre</th><th className="th">Documento</th><th className="th">Cond. IVA</th><th className="th">Datos de facturación</th></tr></thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.id}>
              <td className="td text-zinc-500">{c.sigma_cliente_id}</td>
              <td className="td">{c.nombre}{!c.activo && <span className="ml-2 text-xs text-zinc-400">(inactivo)</span>}</td>
              <td className="td">{c.numero_documento}</td>
              <td className="td">{c.condicion_iva}</td>
              <td className="td">
                <FormAccion action={guardarDatosFiscales} boton="Guardar" className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="sigma_tipo_iva" type="number" defaultValue={c.sigma_tipo_iva ?? ""} placeholder="Tipo IVA" className="input w-24" />
                  <input name="sigma_condicion_venta" defaultValue={c.sigma_condicion_venta ?? ""} placeholder="Cond. venta" className="input w-24" />
                </FormAccion>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
