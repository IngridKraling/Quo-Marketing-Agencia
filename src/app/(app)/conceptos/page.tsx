import { Suspense } from "react";
import { guardarConcepto } from "@/app/actions";
import { FormAccion } from "@/components/form-accion";
import { createClient } from "@/lib/supabase/server";
import { UNIDADES } from "@/lib/servicios/datos";

export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Conceptos</h1>
        <p className="text-sm text-zinc-500">
          La base de todo lo que se presupuesta. La tarifa es el costo neto (vacía = se cotiza en cada presupuesto); el markup es un
          multiplicador (1,4 = +40 %) y si queda vacío se usa el general. Los marcados “Por defecto” se cargan solos en cada presupuesto nuevo.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
        <Listado />
      </Suspense>
    </div>
  );
}

type Opc = { id: string; nombre: string };

function Campos({ c, rubros, proveedores }: { c?: Record<string, unknown>; rubros: Opc[]; proveedores: Opc[] }) {
  const v = (k: string) => (c?.[k] == null ? "" : String(c[k]));
  return (
    <>
      {c && <input type="hidden" name="id" value={v("id")} />}
      <select name="rubro_id" defaultValue={v("rubro_id")} required className="input w-40" aria-label="Rubro">
        <option value="">Rubro…</option>
        {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
      </select>
      <input name="nombre" defaultValue={v("nombre")} required placeholder="Concepto" className="input w-56" aria-label="Concepto" />
      <input name="unidad" defaultValue={v("unidad")} list="unidades" placeholder="Unidad" className="input w-24" aria-label="Unidad" />
      <select name="origen" defaultValue={v("origen") || "proveedor"} className="input w-28" aria-label="Origen">
        <option value="proveedor">Proveedor</option>
        <option value="propio">Propio</option>
        <option value="personal">Personal</option>
      </select>
      <input name="tarifa" type="number" step="any" min="0" defaultValue={v("tarifa")} placeholder="Tarifa" className="input w-28" aria-label="Tarifa (costo neto)" />
      <select name="proveedor_id" defaultValue={v("proveedor_id")} className="input w-36" aria-label="Proveedor habitual">
        <option value="">Proveedor…</option>
        {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      <input name="markup" type="number" step="any" min="0" defaultValue={v("markup")} placeholder="Markup" className="input w-20" aria-label="Markup propio" />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="por_defecto" defaultChecked={c?.por_defecto === true} /> Por defecto</label>
      {c && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="activo" defaultChecked={c.activo === true} /> Activo</label>}
    </>
  );
}

async function Listado() {
  const supabase = await createClient();
  const [{ data: conceptos }, { data: rubros }, { data: proveedores }] = await Promise.all([
    supabase.from("conceptos").select("*").order("nombre"),
    supabase.from("rubros").select("id, nombre").order("orden"),
    supabase.from("proveedores").select("id, nombre").order("nombre"),
  ]);
  const r = rubros ?? [];
  const p = proveedores ?? [];

  return (
    <div className="space-y-4">
      <datalist id="unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
      <section className="card space-y-2">
        <h2 className="font-medium">Nuevo concepto</h2>
        <FormAccion action={guardarConcepto} boton="Agregar" className="flex flex-wrap items-center gap-2">
          <Campos rubros={r} proveedores={p} />
        </FormAccion>
      </section>
      {r.map((rubro) => {
        const lista = (conceptos ?? []).filter((c) => c.rubro_id === rubro.id);
        if (!lista.length) return null;
        return (
          <section key={rubro.id} className="card space-y-2">
            <h2 className="font-medium">{rubro.nombre} <span className="text-sm font-normal text-zinc-500">({lista.length})</span></h2>
            {lista.map((c) => (
              <FormAccion key={c.id} action={guardarConcepto} boton="Guardar" variante="sec" className={`flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2 ${c.activo ? "" : "opacity-60"}`}>
                <Campos c={c} rubros={r} proveedores={p} />
              </FormAccion>
            ))}
          </section>
        );
      })}
    </div>
  );
}
