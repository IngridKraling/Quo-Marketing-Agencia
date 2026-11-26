import { Suspense } from "react";
import { guardarArea, guardarImpuesto, guardarParametros, guardarProveedor, guardarRubro } from "@/app/actions";
import { FormAccion } from "@/components/form-accion";
import { createClient } from "@/lib/supabase/server";

export default function Page() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Configuración</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
        <Contenido />
      </Suspense>
    </div>
  );
}

const Activo = ({ valor }: { valor: boolean }) => (
  <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="activo" defaultChecked={valor} /> Activo</label>
);

async function Contenido() {
  const supabase = await createClient();
  const [{ data: par }, { data: impuestos }, { data: rubros }, { data: areas }, { data: proveedores }] = await Promise.all([
    supabase.from("parametros").select("*").maybeSingle(),
    supabase.from("impuestos_venta").select("*").order("orden"),
    supabase.from("rubros").select("*").order("orden"),
    supabase.from("areas").select("*").order("orden"),
    supabase.from("proveedores").select("*").order("nombre"),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card space-y-3">
        <h2 className="font-medium">Parámetros</h2>
        <FormAccion action={guardarParametros} boton="Guardar parámetros" className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Markup general (si el concepto no tiene)
            <input name="markup_default" type="number" step="any" min="0" defaultValue={par?.markup_default} className="input mt-1" />
          </label>
          <label className="text-sm">Margen de contribución mínimo %
            <input name="margen_minimo_pct" type="number" step="any" min="0" defaultValue={par?.margen_minimo_pct} className="input mt-1" />
          </label>
          <label className="text-sm">IVA % (vista cliente)
            <input name="iva_pct" type="number" step="any" min="0" defaultValue={par?.iva_pct} className="input mt-1" />
          </label>
        </FormAccion>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-medium">Impuestos sobre la venta</h2>
          <p className="text-sm text-zinc-500">Se suman los activos y se descuentan de la venta para calcular la contribución.</p>
        </div>
        {impuestos?.map((i) => (
          <FormAccion key={i.id} action={guardarImpuesto} boton="Guardar" variante="sec" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={i.id} />
            <input name="nombre" defaultValue={i.nombre} className="input w-44" aria-label="Nombre" />
            <input name="porcentaje" type="number" step="any" min="0" defaultValue={i.porcentaje} className="input w-20" aria-label="Porcentaje" /> %
            <Activo valor={i.activo} />
          </FormAccion>
        ))}
        <FormAccion action={guardarImpuesto} boton="Agregar" className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3">
          <input name="nombre" placeholder="Impuesto" required className="input w-44" />
          <input name="porcentaje" type="number" step="any" min="0" placeholder="%" required className="input w-20" />
        </FormAccion>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-medium">Rubros</h2>
          <p className="text-sm text-zinc-500">
            <b>Sin cotizar</b>: avisa si el rubro queda en 0 (logística, viáticos…). <b>Revisar si se usa</b>: avisa si tiene costo (ej. Otros).
          </p>
        </div>
        {rubros?.map((r) => (
          <FormAccion key={r.id} action={guardarRubro} boton="Guardar" variante="sec" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={r.id} />
            <input name="nombre" defaultValue={r.nombre} className="input w-44" aria-label="Nombre" />
            <input name="orden" type="number" defaultValue={r.orden} className="input w-16" aria-label="Orden" />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="alerta_sin_cotizar" defaultChecked={r.alerta_sin_cotizar} /> Sin cotizar</label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="revisar_si_se_usa" defaultChecked={r.revisar_si_se_usa} /> Revisar si se usa</label>
            <Activo valor={r.activo} />
          </FormAccion>
        ))}
        <FormAccion action={guardarRubro} boton="Agregar" className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3">
          <input name="nombre" placeholder="Rubro nuevo" required className="input w-44" />
          <input name="orden" type="number" defaultValue={200} className="input w-16" aria-label="Orden" />
        </FormAccion>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-medium">Áreas</h2>
          <p className="text-sm text-zinc-500">El prefijo arma el ID del proyecto: BTL-CCU-001.</p>
        </div>
        {areas?.map((a) => (
          <FormAccion key={a.id} action={guardarArea} boton="Guardar" variante="sec" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={a.id} />
            <input name="nombre" defaultValue={a.nombre} className="input w-44" aria-label="Nombre" />
            <input name="prefijo" defaultValue={a.prefijo} className="input w-20" aria-label="Prefijo" />
            <input name="orden" type="number" defaultValue={a.orden} className="input w-16" aria-label="Orden" />
            <Activo valor={a.activo} />
          </FormAccion>
        ))}
        <FormAccion action={guardarArea} boton="Agregar" className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3">
          <input name="nombre" placeholder="Área" required className="input w-44" />
          <input name="prefijo" placeholder="Prefijo" required className="input w-20" />
          <input name="orden" type="number" defaultValue={50} className="input w-16" aria-label="Orden" />
        </FormAccion>
      </section>

      <section className="card space-y-3 lg:col-span-2">
        <h2 className="font-medium">Proveedores</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {proveedores?.map((p) => (
            <FormAccion key={p.id} action={guardarProveedor} boton="Guardar" variante="sec" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={p.id} />
              <input name="nombre" defaultValue={p.nombre} className="input w-52" aria-label="Nombre" />
              <Activo valor={p.activo} />
            </FormAccion>
          ))}
        </div>
        <FormAccion action={guardarProveedor} boton="Agregar" className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3">
          <input name="nombre" placeholder="Proveedor nuevo" required className="input w-52" />
        </FormAccion>
      </section>
    </div>
  );
}
