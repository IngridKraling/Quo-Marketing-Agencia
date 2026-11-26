import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditorPresupuesto } from "@/components/editor-presupuesto";
import { createClient } from "@/lib/supabase/server";
import { rolesYClientes } from "@/lib/servicios/datos";
import { pesos } from "@/lib/formato";

export default function Page({ params }: PageProps<"/presupuestos/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
      <Detalle params={params} />
    </Suspense>
  );
}

async function Detalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: p }, { roles, clientes }, { data: reales }, { data: facturas }] = await Promise.all([
    supabase.from("presupuestos").select("*, presupuesto_horas(*), presupuesto_externos(*)").eq("id", id).maybeSingle(),
    rolesYClientes(),
    supabase.from("horas_reales").select("horas, miembros(nombre, roles(costo_hora), costo_hora)").eq("presupuesto_id", id),
    supabase.from("facturas").select("*").eq("presupuesto_id", id).order("created_at", { ascending: false }),
  ]);
  if (!p) notFound();

  type Linea = { orden: number };
  const orden = (a: Linea, b: Linea) => a.orden - b.orden;
  const horasEstimadas = p.presupuesto_horas.reduce((s: number, h: { horas: number }) => s + Number(h.horas), 0);
  const horasReales = (reales ?? []).reduce((s, r) => s + Number(r.horas), 0);
  const costoReal = (reales ?? []).reduce((s, r) => {
    const m = r.miembros as unknown as { costo_hora: number | null; roles: { costo_hora: number } | null } | null;
    return s + Number(r.horas) * Number(m?.costo_hora ?? m?.roles?.costo_hora ?? 0);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Presupuesto #{p.numero}</h1>
        {p.estado !== "facturado" && <Link className="btn" href={`/presupuestos/${id}/facturar`}>Facturar en Sigma</Link>}
      </div>

      <EditorPresupuesto
        key={p.updated_at}
        roles={roles}
        clientes={clientes}
        inicial={{
          id: p.id,
          cliente_id: p.cliente_id,
          titulo: p.titulo,
          estado: p.estado,
          markup_horas_pct: Number(p.markup_horas_pct),
          markup_externos_pct: Number(p.markup_externos_pct),
          iva_pct: Number(p.iva_pct),
          valido_hasta: p.valido_hasta,
          notas: p.notas,
          connecteam_job_id: p.connecteam_job_id,
          horas: [...p.presupuesto_horas].sort(orden).map((h) => ({ descripcion: h.descripcion, rol_id: h.rol_id, horas: Number(h.horas), costo_hora: Number(h.costo_hora) })),
          externos: [...p.presupuesto_externos].sort(orden).map((e) => ({ descripcion: e.descripcion, costo: Number(e.costo), markup_pct: e.markup_pct == null ? null : Number(e.markup_pct) })),
        }}
      />

      <section className="card space-y-2">
        <h2 className="font-medium">Estimado vs. real (Connecteam)</h2>
        {!p.connecteam_job_id ? (
          <p className="text-sm text-zinc-500">Cargá el Job de Connecteam para comparar con las horas fichadas.</p>
        ) : (
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div>Horas estimadas: <b>{horasEstimadas}</b></div>
            <div>Horas reales: <b className={horasReales > horasEstimadas ? "text-red-700" : ""}>{Math.round(horasReales * 100) / 100}</b></div>
            <div>Costo real del equipo: <b>{pesos(costoReal)}</b></div>
          </div>
        )}
      </section>

      {!!facturas?.length && (
        <section className="card overflow-x-auto">
          <h2 className="mb-2 font-medium">Facturas enviadas a Sigma</h2>
          <table className="w-full min-w-[560px]">
            <thead><tr><th className="th">Fecha</th><th className="th">Número</th><th className="th text-right">Total</th><th className="th">Estado</th><th className="th">Respuesta</th></tr></thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id}>
                  <td className="td">{f.fecha}</td>
                  <td className="td">{f.numero_comprobante}</td>
                  <td className="td text-right tabular-nums">{pesos(Number(f.total))}</td>
                  <td className="td">{f.estado}</td>
                  <td className="td text-xs text-zinc-600">{f.sigma_respuesta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
