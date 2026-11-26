import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { costoReal, lineaDesdeFila, resumenPresupuesto, type Estado } from "@/lib/presupuesto-calc";
import { parametros } from "@/lib/servicios/datos";
import { TablaPresupuestos, type FilaPresupuesto } from "@/components/tabla-presupuestos";

export default function Page() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Presupuestos</h1>
        <Link href="/presupuestos/nuevo" className="btn">Nuevo presupuesto</Link>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
        <Listado />
      </Suspense>
    </div>
  );
}

async function Listado() {
  const supabase = await createClient();
  const [{ data, error }, params] = await Promise.all([
    supabase
      .from("presupuestos")
      .select(
        "id, codigo, titulo, marca, responsable, estado, version, fecha_elaboracion, fecha_evento, clientes(nombre), areas(nombre), presupuesto_lineas(*)",
      )
      .order("created_at", { ascending: false }),
    parametros(),
  ]);
  if (error) return <p className="text-red-700">{error.message}</p>;
  if (!data.length) return <p className="card text-sm text-zinc-500">Todavía no hay presupuestos.</p>;

  // Los totales se calculan acá; filtrar y ordenar se hace en el navegador, sin volver a consultar.
  const filas: FilaPresupuesto[] = data.map((p) => {
    const lineas = (p.presupuesto_lineas as Parameters<typeof lineaDesdeFila>[0][]).map(lineaDesdeFila);
    const r = resumenPresupuesto(lineas, [], params);
    const reales = lineas.map(costoReal).filter((x): x is number => x != null);
    return {
      id: p.id,
      codigo: p.codigo,
      titulo: p.titulo,
      cliente: (p.clientes as unknown as { nombre: string } | null)?.nombre ?? null,
      marca: p.marca,
      responsable: p.responsable,
      area: (p.areas as unknown as { nombre: string } | null)?.nombre ?? null,
      estado: p.estado as Estado,
      version: p.version,
      fechaElaboracion: p.fecha_elaboracion,
      fechaEvento: p.fecha_evento,
      costo: r.costo,
      venta: r.venta,
      margenPct: r.venta ? r.margenPct : null,
      costoReal: reales.length ? reales.reduce((s, x) => s + x, 0) : null,
    };
  });

  return <TablaPresupuestos filas={filas} />;
}
