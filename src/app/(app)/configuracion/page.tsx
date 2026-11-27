import { Suspense } from "react";
import {
  eliminarTramo,
  guardarArea,
  guardarImpuesto,
  guardarParametros,
  guardarProveedor,
  guardarResponsable,
  guardarRubro,
  guardarTramo,
} from "@/app/actions";
import { CampoPesosForm } from "@/components/campo-pesos-form";
import { decimal, pesos } from "@/lib/formato";
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
  const [{ data: par }, { data: impuestos }, { data: rubros }, { data: areas }, { data: proveedores }, { data: responsables }, { data: tramos }] = await Promise.all([
    supabase.from("parametros").select("*").maybeSingle(),
    supabase.from("impuestos_venta").select("*").order("orden"),
    supabase.from("rubros").select("*").order("orden"),
    supabase.from("areas").select("*").order("orden"),
    supabase.from("proveedores").select("*, proveedor_rubros(rubro_id)").order("nombre"),
    supabase.from("responsables").select("*").order("nombre"),
    supabase.from("markup_tramos").select("*"),
  ]);
  // Tramos ordenados por tope (el "sin tope" al final), agrupados por área.
  const tramosDe = (areaId: string) =>
    (tramos ?? [])
      .filter((t) => t.area_id === areaId)
      .sort((a, b) => (a.hasta == null ? Infinity : Number(a.hasta)) - (b.hasta == null ? Infinity : Number(b.hasta)));
  // Rubros agrupados por área, para tildar en cada proveedor.
  const gruposRubros = [
    { titulo: "Comunes", rubros: (rubros ?? []).filter((r) => !r.area_id) },
    ...(areas ?? []).map((a) => ({ titulo: a.nombre as string, rubros: (rubros ?? []).filter((r) => r.area_id === a.id) })),
  ].filter((g) => g.rubros.length);
  const rubrosProveedor = (marcados: string[]) => (
    <details className="text-xs">
      <summary className="cursor-pointer text-zinc-600">
        Rubros: {marcados.length ? (rubros ?? []).filter((r) => marcados.includes(r.id)).map((r) => r.nombre).join(", ") : <i>sin asignar</i>}
      </summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {gruposRubros.map((g) => (
          <fieldset key={g.titulo} className="space-y-1">
            <legend className="font-semibold text-zinc-700">{g.titulo}</legend>
            {g.rubros.map((r) => (
              <label key={r.id} className="flex items-center gap-1">
                <input type="checkbox" name="rubros" value={r.id} defaultChecked={marcados.includes(r.id)} /> {r.nombre}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </details>
  );
  const areaSelect = (valor: string | null) => (
    <select name="area_id" defaultValue={valor ?? ""} className="input w-40" aria-label="Área">
      <option value="">Común (todas)</option>
      {areas?.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
    </select>
  );

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
            El <b>área</b> define en qué presupuestos aparece; “Común” aparece en todos. <b>Por medida</b>: las líneas se cargan con base × altura,
            piezas y cotización total, y se compara el $/m² (Trade).
          </p>
        </div>
        {rubros?.map((r) => (
          <FormAccion key={r.id} action={guardarRubro} boton="Guardar" variante="sec" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={r.id} />
            <input name="nombre" defaultValue={r.nombre} className="input w-44" aria-label="Nombre" />
            <input name="orden" type="number" defaultValue={r.orden} className="input w-16" aria-label="Orden" />
            {areaSelect(r.area_id)}
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="alerta_sin_cotizar" defaultChecked={r.alerta_sin_cotizar} /> Sin cotizar</label>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="revisar_si_se_usa" defaultChecked={r.revisar_si_se_usa} /> Revisar si se usa</label>
            <label className="flex items-center gap-1 text-xs" title="Se cotiza con base × altura, piezas y cotización total (Trade)"><input type="checkbox" name="por_medida" defaultChecked={r.por_medida} /> Por medida</label>
            <Activo valor={r.activo} />
          </FormAccion>
        ))}
        <FormAccion action={guardarRubro} boton="Agregar" className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3">
          <input name="nombre" placeholder="Rubro nuevo" required className="input w-44" />
          <input name="orden" type="number" defaultValue={200} className="input w-16" aria-label="Orden" />
          {areaSelect(null)}
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
        <div>
          <h2 className="font-medium">Markup por tramo</h2>
          <p className="text-sm text-zinc-500">
            En las áreas con tramos, el markup de cada línea sale del <b>costo total</b> del presupuesto. “Hasta” incluye el monto; el
            tramo sin tope es para todo lo que supere el último. Si una línea tiene markup cargado a mano, ese manda. Un área sin tramos usa el
            markup de cada concepto.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {areas?.map((a) => {
            const lista = tramosDe(a.id);
            return (
              <div key={a.id} className="space-y-2 rounded-md border border-zinc-200 p-3">
                <h3 className="text-sm font-medium">{a.nombre} {!lista.length && <span className="font-normal text-zinc-500">· sin tramos</span>}</h3>
                {lista.map((t, i) => {
                  const desde = i > 0 ? lista[i - 1].hasta : null;
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-2">
                      <FormAccion action={guardarTramo} boton="Guardar" variante="sec" className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="area_id" value={a.id} />
                        <span className="w-24 text-xs text-zinc-500">{desde == null ? "Desde $ 0" : `Más de ${pesos(Number(desde))}`}</span>
                        <span className="text-xs text-zinc-500">hasta</span>
                        <CampoPesosForm name="hasta" defaultValue={t.hasta == null ? null : Number(t.hasta)} placeholder="Sin tope" etiqueta="Hasta (incluido)" className="input w-36" />
                        <span className="text-xs text-zinc-500">markup ×</span>
                        <input name="markup" type="number" step="any" min="0" defaultValue={t.markup} required className="input w-20" aria-label="Markup" />
                        <span className="w-12 text-xs text-zinc-500">+{decimal(Math.round((Number(t.markup) - 1) * 100))} %</span>
                      </FormAccion>
                      <FormAccion action={eliminarTramo} boton="Quitar" variante="sec">
                        <input type="hidden" name="id" value={t.id} />
                      </FormAccion>
                    </div>
                  );
                })}
                <FormAccion action={guardarTramo} boton="Agregar tramo" className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2">
                  <input type="hidden" name="area_id" value={a.id} />
                  <span className="text-xs text-zinc-500">hasta</span>
                  <CampoPesosForm name="hasta" placeholder="Sin tope" etiqueta="Hasta (incluido)" className="input w-36" />
                  <span className="text-xs text-zinc-500">markup ×</span>
                  <input name="markup" type="number" step="any" min="0" required placeholder="1,6" className="input w-20" aria-label="Markup" />
                </FormAccion>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card space-y-3 lg:col-span-2">
        <div>
          <h2 className="font-medium">Responsables</h2>
          <p className="text-sm text-zinc-500">Aparecen en el desplegable “Responsable” del presupuesto. Destildá Activo para ocultar a alguien sin perder sus presupuestos.</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {responsables?.map((r) => (
            <FormAccion key={r.id} action={guardarResponsable} boton="Guardar" variante="sec" className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={r.id} />
              <input name="nombre" defaultValue={r.nombre} className="input w-52" aria-label="Nombre" />
              <Activo valor={r.activo} />
            </FormAccion>
          ))}
        </div>
        <FormAccion action={guardarResponsable} boton="Agregar" className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-3">
          <input name="nombre" placeholder="Responsable nuevo" required className="input w-52" />
        </FormAccion>
      </section>

      <section className="card space-y-3 lg:col-span-2">
        <div>
          <h2 className="font-medium">Proveedores</h2>
          <p className="text-sm text-zinc-500">
            Tildá los rubros en los que trabaja cada proveedor (puede ser de varias áreas). En un presupuesto, cada línea muestra solo los
            proveedores de su rubro y, aparte, los que todavía no tienen rubros asignados.
          </p>
        </div>
        <div className="space-y-2">
          {proveedores?.map((p) => (
            <FormAccion key={p.id} action={guardarProveedor} boton="Guardar" variante="sec" className="space-y-2 rounded-md border border-zinc-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input name="nombre" defaultValue={p.nombre} className="input w-52" aria-label="Nombre" />
                <Activo valor={p.activo} />
              </div>
              {rubrosProveedor(((p.proveedor_rubros as { rubro_id: string }[] | null) ?? []).map((r) => r.rubro_id))}
            </FormAccion>
          ))}
        </div>
        <FormAccion action={guardarProveedor} boton="Agregar" className="space-y-2 border-t border-zinc-200 pt-3">
          <input name="nombre" placeholder="Proveedor nuevo" required className="input w-52" />
          {rubrosProveedor([])}
        </FormAccion>
      </section>
    </div>
  );
}
