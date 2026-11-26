import { Suspense } from "react";
import { guardarMiembro, guardarRol, sincronizarHoras } from "@/app/actions";
import { FormAccion } from "@/components/form-accion";
import { createClient } from "@/lib/supabase/server";
import { haceDias, hoy, pesos } from "@/lib/formato";

export default function Page() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Equipo y tarifas</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
        <Contenido />
      </Suspense>
    </div>
  );
}

async function Contenido() {
  const supabase = await createClient();
  const [{ data: roles }, { data: miembros }] = await Promise.all([
    supabase.from("roles").select("*").order("nombre"),
    supabase.from("miembros").select("*, roles(nombre)").order("nombre"),
  ]);
  const haceUnMes = haceDias(30);

  return (
    <>
      <section className="card space-y-3">
        <h2 className="font-medium">Roles y costo hora</h2>
        <table className="w-full">
          <tbody>
            {roles?.map((r) => (
              <tr key={r.id}>
                <td className="td">
                  <FormAccion action={guardarRol} boton="Guardar" className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="nombre" defaultValue={r.nombre} className="input w-48" />
                    <input name="costo_hora" type="number" step="0.01" defaultValue={r.costo_hora} className="input w-32" />
                    <span className="text-xs text-zinc-500">{pesos(Number(r.costo_hora))}/h</span>
                  </FormAccion>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <FormAccion action={guardarRol} boton="Agregar rol" className="flex flex-wrap items-center gap-2">
          <input name="nombre" placeholder="Ej. Diseñador senior" className="input w-48" required />
          <input name="costo_hora" type="number" step="0.01" placeholder="Costo hora" className="input w-32" required />
        </FormAccion>
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Miembros (vinculados a Connecteam)</h2>
        <table className="w-full">
          <thead><tr><th className="th">Nombre</th><th className="th">Rol</th><th className="th">Usuario Connecteam</th></tr></thead>
          <tbody>
            {miembros?.map((m) => (
              <tr key={m.id}>
                <td className="td">{m.nombre}</td>
                <td className="td">{(m.roles as { nombre: string } | null)?.nombre ?? "—"}</td>
                <td className="td text-zinc-500">{m.connecteam_user_id ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <FormAccion action={guardarMiembro} boton="Agregar miembro" className="flex flex-wrap items-center gap-2">
          <input name="nombre" placeholder="Nombre" className="input w-44" required />
          <input name="email" type="email" placeholder="Email" className="input w-52" />
          <select name="rol_id" className="input w-44">
            <option value="">Rol…</option>
            {roles?.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
          <input name="connecteam_user_id" placeholder="ID usuario Connecteam" className="input w-44" />
        </FormAccion>
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Traer horas fichadas de Connecteam</h2>
        <FormAccion action={sincronizarHoras} boton="Sincronizar horas" className="flex flex-wrap items-center gap-2">
          <input type="date" name="desde" defaultValue={haceUnMes} className="input w-40" />
          <input type="date" name="hasta" defaultValue={hoy()} className="input w-40" />
        </FormAccion>
      </section>
    </>
  );
}
