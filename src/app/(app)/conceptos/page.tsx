import Link from "next/link";
import { Suspense } from "react";
import { guardarConcepto } from "@/app/actions";
import { CampoPesosForm } from "@/components/campo-pesos-form";
import { FormAccion } from "@/components/form-accion";
import { createClient } from "@/lib/supabase/server";
import { UNIDADES } from "@/lib/servicios/datos";
import { numONull } from "@/lib/presupuesto-calc";

export default function Page({ searchParams }: PageProps<"/conceptos">) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Conceptos</h1>
        <p className="text-sm text-zinc-500">
          La base de todo lo que se presupuesta. La tarifa es el costo neto (vacía = se cotiza en cada presupuesto); el markup es un
          multiplicador (1,4 = +40 %) y si queda vacío se usa el general. Los marcados “Por defecto” se cargan solos en cada presupuesto nuevo.
          Cada rubro es de un área (se cambia en Configuración); los <b>comunes</b> aparecen en todas. En Trade el markup sale del tramo
          según el costo total del presupuesto. Para algo que no está en la lista, usá <b>OTROS</b> (rubro Otros) y escribí encima el concepto.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
        <Listado searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

type Opc = { id: string; nombre: string };

function Campos({ c, rubros, proveedores, porTramo }: { c?: Record<string, unknown>; rubros: Opc[]; proveedores: Opc[]; porTramo?: boolean }) {
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
      <CampoPesosForm name="tarifa" defaultValue={numONull(c?.tarifa as string | null)} placeholder="A cotizar" etiqueta="Tarifa (costo neto)" className="input w-36" />
      <select name="proveedor_id" defaultValue={v("proveedor_id")} className="input w-36" aria-label="Proveedor habitual">
        <option value="">Proveedor…</option>
        {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      <input name="markup" type="number" step="any" min="0" defaultValue={v("markup")} placeholder={porTramo ? "Tramo" : "Markup"} title={porTramo ? "Vacío: se usa el markup por tramo del presupuesto" : undefined} className="input w-20" aria-label="Markup propio" />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="por_defecto" defaultChecked={c?.por_defecto === true} /> Por defecto</label>
      {c && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="activo" defaultChecked={c.activo === true} /> Activo</label>}
    </>
  );
}

type Rubro = Opc & { area_id: string | null };

async function Listado({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filtro = String((await searchParams).area ?? "");
  const supabase = await createClient();
  const [{ data: conceptos }, { data: rubros }, { data: proveedores }, { data: areas }, { data: tramos }] = await Promise.all([
    supabase.from("conceptos").select("*").order("nombre"),
    supabase.from("rubros").select("id, nombre, area_id").order("orden"),
    supabase.from("proveedores").select("id, nombre").order("nombre"),
    supabase.from("areas").select("id, nombre").order("orden"),
    supabase.from("markup_tramos").select("area_id"),
  ]);
  const r = (rubros ?? []) as Rubro[];
  const p = proveedores ?? [];
  const nombreArea = new Map((areas ?? []).map((a) => [a.id, a.nombre as string]));
  const areasConTramos = new Set((tramos ?? []).map((t) => t.area_id));
  // Solo las áreas que tienen rubros propios aparecen como filtro.
  const areasConRubros = (areas ?? []).filter((a) => r.some((x) => x.area_id === a.id));
  const visible = (rubro: Rubro) =>
    !filtro || (filtro === "comunes" ? !rubro.area_id : !rubro.area_id || rubro.area_id === filtro);
  const chip = (rubro: Rubro) =>
    rubro.area_id ? (
      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800">{nombreArea.get(rubro.area_id)}</span>
    ) : (
      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">Común</span>
    );
  const opciones = [{ id: "", nombre: "Todas" }, ...areasConRubros.map((a) => ({ id: a.id, nombre: `${a.nombre} + comunes` })), { id: "comunes", nombre: "Solo comunes" }];

  return (
    <div className="space-y-4">
      <datalist id="unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
      <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Filtrar por área">
        <span className="text-zinc-500">Área:</span>
        {opciones.map((o) => (
          <Link
            key={o.id || "todas"}
            href={o.id ? `/conceptos?area=${o.id}` : "/conceptos"}
            className={filtro === o.id ? "btn" : "btn-sec"}
            aria-current={filtro === o.id ? "page" : undefined}
          >
            {o.nombre}
          </Link>
        ))}
      </nav>
      <section className="card space-y-2">
        <h2 className="font-medium">Nuevo concepto</h2>
        <FormAccion action={guardarConcepto} boton="Agregar" className="flex flex-wrap items-center gap-2">
          <Campos rubros={r} proveedores={p} />
        </FormAccion>
      </section>
      {r.filter(visible).map((rubro) => {
        const lista = (conceptos ?? []).filter((c) => c.rubro_id === rubro.id);
        if (!lista.length) return null;
        const porTramo = !!rubro.area_id && areasConTramos.has(rubro.area_id);
        return (
          <section key={rubro.id} className="card space-y-2">
            <h2 className="flex flex-wrap items-center gap-2 font-medium">
              {rubro.nombre} {chip(rubro)} <span className="text-sm font-normal text-zinc-500">({lista.length})</span>
            </h2>
            {lista.map((c) => (
              <FormAccion key={c.id} action={guardarConcepto} boton="Guardar" variante="sec" className={`flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2 ${c.activo ? "" : "opacity-60"}`}>
                <Campos c={c} rubros={r} proveedores={p} porTramo={porTramo} />
              </FormAccion>
            ))}
          </section>
        );
      })}
    </div>
  );
}
