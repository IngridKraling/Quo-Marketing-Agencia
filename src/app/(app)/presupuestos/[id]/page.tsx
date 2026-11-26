import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditorPresupuesto } from "@/components/editor-presupuesto";
import { createClient } from "@/lib/supabase/server";
import { numONull } from "@/lib/presupuesto-calc";
import { catalogo } from "@/lib/servicios/datos";
import { fecha, pesos } from "@/lib/formato";

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
  const [{ data: p }, cat, { data: versiones }] = await Promise.all([
    supabase.from("presupuestos").select("*, presupuesto_lineas(*)").eq("id", id).maybeSingle(),
    catalogo(),
    supabase.from("presupuesto_versiones").select("id, version, aprobado_at, datos->totales").eq("presupuesto_id", id).order("version", { ascending: false }),
  ]);
  if (!p) notFound();

  const sigmaConfigurado = !!process.env.SIGMA_TOKEN;
  type Fila = Record<string, unknown> & { id: string; orden: number; presupuestada: boolean };
  const lineas = (p.presupuesto_lineas as Fila[]).filter((l) => l.presupuestada).sort((a, b) => a.orden - b.orden);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{p.codigo} · {p.titulo}</h1>
        {sigmaConfigurado && p.estado !== "facturado" && (
          <Link className="btn-sec" href={`/presupuestos/${id}/facturar`}>Facturar en Sigma</Link>
        )}
      </div>

      <EditorPresupuesto
        key={`${p.updated_at}-${p.estado}-${p.version}`}
        cat={cat}
        estado={p.estado}
        version={p.version}
        codigo={p.codigo}
        inicial={{
          id: p.id,
          cliente_id: p.cliente_id,
          marca: p.marca,
          titulo: p.titulo,
          area_id: p.area_id,
          responsable: p.responsable,
          fecha_elaboracion: p.fecha_elaboracion,
          fecha_evento: p.fecha_evento,
          notas: p.notas,
          lineas: lineas.map((l) => ({
            id: l.id,
            rubro_id: l.rubro_id as string | null,
            concepto_id: l.concepto_id as string | null,
            concepto: l.concepto as string,
            observaciones: l.observaciones as string | null,
            origen: l.origen as "propio" | "proveedor" | "personal",
            proveedor: l.proveedor as string | null,
            unidad: l.unidad as string | null,
            precio_unitario: numONull(l.precio_unitario as string),
            cantidad: numONull(l.cantidad as string),
            horas: numONull(l.horas as string),
            dias: numONull(l.dias as string),
            markup: numONull(l.markup as string),
            markup_concepto: numONull(l.markup_concepto as string),
          })),
        }}
      />

      {!!versiones?.length && (
        <section className="card overflow-x-auto">
          <h2 className="mb-2 font-medium">Versiones aprobadas</h2>
          <table className="w-full min-w-[480px]">
            <thead><tr><th className="th">Versión</th><th className="th">Aprobada</th><th className="th text-right">Costo</th><th className="th text-right">Venta</th><th className="th" /></tr></thead>
            <tbody>
              {versiones.map((v) => {
                const t = v.totales as { costo: number; venta: number } | null;
                return (
                  <tr key={v.id}>
                    <td className="td">{v.version}</td>
                    <td className="td">{fecha(v.aprobado_at)}</td>
                    <td className="td text-right tabular-nums">{t ? pesos(t.costo) : "—"}</td>
                    <td className="td text-right tabular-nums">{t ? pesos(t.venta) : "—"}</td>
                    <td className="td"><Link className="underline" href={`/presupuestos/${id}/cliente?version=${v.version}`}>Ver</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
