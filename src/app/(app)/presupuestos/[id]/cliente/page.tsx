import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, Suspense } from "react";
import { BotonImprimir } from "@/components/boton-imprimir";
import { createClient } from "@/lib/supabase/server";
import { calcularLinea, lineaDesdeFila, type Parametros } from "@/lib/presupuesto-calc";
import { parametros } from "@/lib/servicios/datos";
import { decimal, fecha, pesos } from "@/lib/formato";

export default function Page({ params, searchParams }: PageProps<"/presupuestos/[id]/cliente">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
      <Vista params={params} searchParams={searchParams} />
    </Suspense>
  );
}

type Fila = Parameters<typeof lineaDesdeFila>[0] & { concepto: string; orden: number; unidad: string | null };

/** Lo que ve el cliente: rubros y conceptos con precio de venta. Sin costos, markup ni observaciones internas. */
async function Vista({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const version = Number((await searchParams).version) || null;
  const supabase = await createClient();
  const [{ data: p }, paramsActuales, { data: rubros }] = await Promise.all([
    supabase.from("presupuestos").select("*, clientes(nombre), presupuesto_lineas(*)").eq("id", id).maybeSingle(),
    parametros(),
    supabase.from("rubros").select("id, nombre, orden").order("orden"),
  ]);
  if (!p) notFound();

  let filas = (p.presupuesto_lineas as Fila[]).filter((l) => l.presupuestada);
  let cab = p;
  let params_: Parametros & { ivaPct: number } = paramsActuales;
  if (version) {
    const { data: v } = await supabase.from("presupuesto_versiones").select("datos").eq("presupuesto_id", id).eq("version", version).maybeSingle();
    if (!v) notFound();
    const datos = v.datos as { cabecera: typeof p; lineas: Fila[]; parametros: Parametros & { ivaPct: number } };
    filas = datos.lineas;
    cab = { ...p, ...datos.cabecera };
    params_ = datos.parametros;
  }

  const lineas = filas.sort((a, b) => a.orden - b.orden).map((f) => ({ f, r: calcularLinea(lineaDesdeFila(f), params_) }));
  const grupos = (rubros ?? [])
    .map((rubro) => ({ rubro, items: lineas.filter((x) => x.f.rubro_id === rubro.id) }))
    .filter((g) => g.items.length);
  const sinRubro = lineas.filter((x) => !(rubros ?? []).some((r) => r.id === x.f.rubro_id));
  if (sinRubro.length) grupos.push({ rubro: { id: "otros", nombre: "Otros", orden: 999 }, items: sinRubro });

  const subtotal = Math.round(lineas.reduce((s, x) => s + x.r.venta, 0) * 100) / 100;
  const iva = Math.round(subtotal * params_.ivaPct) / 100;
  const cliente = (p.clientes as { nombre: string } | null)?.nombre;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link className="text-sm underline" href={`/presupuestos/${id}`}>← Volver al presupuesto</Link>
        <BotonImprimir />
      </div>

      <article className="card space-y-6 p-8 print:border-0 print:p-0">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Presupuesto</h1>
          {cab.fecha_elaboracion && <p className="text-sm">Fecha: <b>{fecha(cab.fecha_elaboracion)}</b></p>}
          <p className="text-sm">Cliente: <b>{cliente}{cab.marca ? ` · ${cab.marca}` : ""}</b></p>
          <p className="text-sm">Proyecto: <b>{cab.titulo}</b>{cab.fecha_evento && <> · {fecha(cab.fecha_evento)}</>}</p>
          <p className="text-xs text-zinc-500">Referencia: {cab.codigo} · versión {version ?? cab.version}</p>
        </header>

        <table className="w-full text-sm">
          <thead>
            <tr><th className="th">Rubro / concepto</th><th className="th w-28 text-right">Cantidad</th><th className="th w-36 text-right">Precio (neto)</th></tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <Fragment key={g.rubro.id}>
                <tr className="bg-zinc-50 font-medium">
                  <td className="td">{g.rubro.nombre}</td>
                  <td className="td" />
                  <td className="td text-right tabular-nums">{pesos(g.items.reduce((s, x) => s + x.r.venta, 0))}</td>
                </tr>
                {g.items.map(({ f, r }, i) => (
                  <tr key={`${g.rubro.id}-${i}`}>
                    <td className="td pl-6">{f.concepto}</td>
                    <td className="td text-right tabular-nums">{f.cantidad != null ? decimal(Number(f.cantidad)) : ""}</td>
                    <td className="td text-right tabular-nums">{pesos(r.venta)}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr><td className="td" /><td className="td text-right">Subtotal</td><td className="td text-right tabular-nums">{pesos(subtotal)}</td></tr>
            <tr><td className="td" /><td className="td text-right">IVA {decimal(params_.ivaPct)} %</td><td className="td text-right tabular-nums">{pesos(iva)}</td></tr>
            <tr className="font-semibold"><td className="td" /><td className="td text-right">Total</td><td className="td text-right tabular-nums">{pesos(subtotal + iva)}</td></tr>
          </tfoot>
        </table>
      </article>
    </div>
  );
}
