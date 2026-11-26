import { Suspense } from "react";
import { guardarCliente, guardarDatosFiscales, guardarMarca, sincronizarClientes } from "@/app/actions";
import { FormAccion } from "@/components/form-accion";
import { createClient } from "@/lib/supabase/server";

export default function Page() {
  const sigma = !!process.env.SIGMA_TOKEN;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Clientes</h1>
        {sigma && <FormAccion action={sincronizarClientes} boton="Sincronizar desde Sigma" variante="sec" />}
      </div>
      <p className="text-sm text-zinc-500">
        El código se usa en el ID del proyecto (BTL-<b>CCU</b>-001). Las marcas activas aparecen en el desplegable “Marca / cliente real”,
        siempre con “OTROS” como última opción (no hace falta cargarla).
      </p>
      <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
        <Listado sigma={sigma} />
      </Suspense>
    </div>
  );
}

async function Listado({ sigma }: { sigma: boolean }) {
  const supabase = await createClient();
  const [{ data }, { data: marcas }] = await Promise.all([
    supabase.from("clientes").select("*").order("nombre"),
    supabase.from("marcas").select("*").order("nombre"),
  ]);

  return (
    <div className="space-y-4">
      <section className="card space-y-2">
        <h2 className="font-medium">Nuevo cliente</h2>
        <FormAccion action={guardarCliente} boton="Agregar" className="flex flex-wrap items-center gap-2">
          <input name="nombre" required placeholder="Nombre" className="input w-56" />
          <input name="codigo" required placeholder="Código (ej. CCU)" className="input w-36 uppercase" />
          <input name="numero_documento" placeholder="CUIT" className="input w-40" />
          <input name="email" type="email" placeholder="Email" className="input w-56" />
        </FormAccion>
      </section>

      <section className="card space-y-2">
        {!data?.length && <p className="text-sm text-zinc-500">Todavía no hay clientes.</p>}
        {data?.map((c) => (
          <div key={c.id} className="space-y-2 border-t border-zinc-100 pt-2 first:border-0 first:pt-0">
            <FormAccion action={guardarCliente} boton="Guardar" variante="sec" className={`flex flex-wrap items-center gap-2 ${c.activo ? "" : "opacity-60"}`}>
              <input type="hidden" name="id" value={c.id} />
              <input name="nombre" defaultValue={c.nombre} required className="input w-56" aria-label="Nombre" />
              <input name="codigo" defaultValue={c.codigo ?? ""} required placeholder="Código" className="input w-36 uppercase" aria-label="Código" />
              <input name="numero_documento" defaultValue={c.numero_documento ?? ""} placeholder="CUIT" className="input w-40" aria-label="CUIT" />
              <input name="email" type="email" defaultValue={c.email ?? ""} placeholder="Email" className="input w-56" aria-label="Email" />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="activo" defaultChecked={c.activo} /> Activo</label>
            </FormAccion>
            <div className="space-y-2 pl-4">
              <p className="text-xs font-medium text-zinc-500">Marcas</p>
              {marcas?.filter((m) => m.cliente_id === c.id).map((m) => (
                <FormAccion key={m.id} action={guardarMarca} boton="Guardar" variante="sec" className={`flex flex-wrap items-center gap-2 ${m.activo ? "" : "opacity-60"}`}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="cliente_id" value={c.id} />
                  <input name="nombre" defaultValue={m.nombre} required className="input w-52" aria-label="Marca" />
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="activo" defaultChecked={m.activo} /> Activa</label>
                </FormAccion>
              ))}
              <FormAccion action={guardarMarca} boton="Agregar marca" variante="sec" className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="cliente_id" value={c.id} />
                <input name="nombre" required placeholder="Marca nueva" className="input w-52" />
              </FormAccion>
            </div>
            {sigma && c.sigma_cliente_id && (
              <FormAccion action={guardarDatosFiscales} boton="Guardar datos Sigma" variante="sec" className="flex flex-wrap items-center gap-2 pl-4 text-sm">
                <span className="text-zinc-500">Sigma {c.sigma_cliente_id}</span>
                <input type="hidden" name="id" value={c.id} />
                <input name="sigma_tipo_iva" type="number" defaultValue={c.sigma_tipo_iva ?? ""} placeholder="Tipo IVA" className="input w-24" />
                <input name="sigma_condicion_venta" defaultValue={c.sigma_condicion_venta ?? ""} placeholder="Cond. venta" className="input w-24" />
              </FormAccion>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
