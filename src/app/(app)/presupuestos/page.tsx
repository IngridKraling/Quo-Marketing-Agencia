import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { ETIQUETA_ESTADO, costoReal, lineaDesdeFila, resumenPresupuesto, type Estado } from "@/lib/presupuesto-calc";
import { parametros } from "@/lib/servicios/datos";
import { fecha, pesos, porcentaje } from "@/lib/formato";

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

const COLOR: Partial<Record<Estado, string>> = {
  aprobado: "bg-green-100 text-green-800",
  en_ejecucion: "bg-blue-100 text-blue-800",
  finalizado: "bg-indigo-100 text-indigo-800",
  facturado: "bg-zinc-800 text-white",
  rechazado: "bg-red-100 text-red-800",
  cancelado: "bg-red-100 text-red-800",
};

async function Listado() {
  const supabase = await createClient();
  const [{ data, error }, params] = await Promise.all([
    supabase
      .from("presupuestos")
      .select("id, codigo, titulo, marca, estado, version, fecha_evento, clientes(nombre), areas(nombre), presupuesto_lineas(*)")
      .order("created_at", { ascending: false }),
    parametros(),
  ]);
  if (error) return <p className="text-red-700">{error.message}</p>;
  if (!data.length) return <p className="card text-sm text-zinc-500">Todavía no hay presupuestos.</p>;

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[900px]">
        <thead>
          <tr>
            <th className="th">ID</th><th className="th">Cliente / marca</th><th className="th">Proyecto</th><th className="th">Área</th>
            <th className="th">Evento</th><th className="th">Estado</th><th className="th text-right">Costo</th><th className="th text-right">Venta</th>
            <th className="th text-right">Margen</th><th className="th text-right">Costo real</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => {
            const lineas = (p.presupuesto_lineas as Parameters<typeof lineaDesdeFila>[0][]).map(lineaDesdeFila);
            const r = resumenPresupuesto(lineas, [], params);
            const reales = lineas.map(costoReal).filter((x): x is number => x != null);
            const cliente = p.clientes as unknown as { nombre: string } | null;
            const area = p.areas as unknown as { nombre: string } | null;
            return (
              <tr key={p.id} className="hover:bg-zinc-50">
                <td className="td whitespace-nowrap font-mono text-xs"><Link className="hover:underline" href={`/presupuestos/${p.id}`}>{p.codigo}</Link></td>
                <td className="td">{cliente?.nombre ?? "—"}{p.marca && <span className="text-zinc-500"> · {p.marca}</span>}</td>
                <td className="td"><Link className="font-medium hover:underline" href={`/presupuestos/${p.id}`}>{p.titulo}</Link></td>
                <td className="td">{area?.nombre ?? "—"}</td>
                <td className="td whitespace-nowrap">{fecha(p.fecha_evento)}</td>
                <td className="td whitespace-nowrap">
                  <span className={`rounded px-2 py-0.5 text-xs ${COLOR[p.estado as Estado] ?? "bg-zinc-100"}`}>{ETIQUETA_ESTADO[p.estado as Estado]}</span>
                  {p.version > 1 && <span className="ml-1 text-xs text-zinc-500">v{p.version}</span>}
                </td>
                <td className="td text-right tabular-nums">{pesos(r.costo)}</td>
                <td className="td text-right tabular-nums">{pesos(r.venta)}</td>
                <td className="td text-right tabular-nums">{r.venta ? porcentaje(r.margenPct) : "—"}</td>
                <td className="td text-right tabular-nums">
                  {reales.length ? <Link className="hover:underline" href={`/presupuestos/${p.id}/costos`}>{pesos(reales.reduce((s, x) => s + x, 0))}</Link> : <span className="text-zinc-400">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
