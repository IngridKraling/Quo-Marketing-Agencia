import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { calcularTotales } from "@/lib/presupuesto-calc";
import { pesos } from "@/lib/formato";

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
  const { data, error } = await supabase
    .from("presupuestos")
    .select("id, numero, titulo, estado, markup_horas_pct, markup_externos_pct, iva_pct, created_at, clientes(nombre), presupuesto_horas(horas, costo_hora), presupuesto_externos(costo, markup_pct)")
    .order("numero", { ascending: false });
  if (error) return <p className="text-red-700">{error.message}</p>;
  if (!data.length) return <p className="card text-sm text-zinc-500">Todavía no hay presupuestos.</p>;

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[640px]">
        <thead><tr><th className="th">#</th><th className="th">Título</th><th className="th">Cliente</th><th className="th">Estado</th><th className="th text-right">Total</th><th className="th text-right">Margen</th></tr></thead>
        <tbody>
          {data.map((p) => {
            const t = calcularTotales({
              horas: p.presupuesto_horas.map((h) => ({ horas: Number(h.horas), costoHora: Number(h.costo_hora) })),
              externos: p.presupuesto_externos.map((e) => ({ costo: Number(e.costo), markupPct: e.markup_pct == null ? null : Number(e.markup_pct) })),
              markupHorasPct: Number(p.markup_horas_pct),
              markupExternosPct: Number(p.markup_externos_pct),
              ivaPct: Number(p.iva_pct),
            });
            const cliente = p.clientes as unknown as { nombre: string } | null;
            return (
              <tr key={p.id} className="hover:bg-zinc-50">
                <td className="td text-zinc-500">{p.numero}</td>
                <td className="td"><Link className="font-medium hover:underline" href={`/presupuestos/${p.id}`}>{p.titulo}</Link></td>
                <td className="td">{cliente?.nombre ?? "—"}</td>
                <td className="td"><span className="rounded bg-zinc-100 px-2 py-0.5 text-xs">{p.estado}</span></td>
                <td className="td text-right tabular-nums">{pesos(t.total)}</td>
                <td className="td text-right tabular-nums">{t.margenPct}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
