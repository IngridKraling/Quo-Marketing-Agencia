import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eliminarFactura, registrarFactura } from "@/app/actions";
import { EditorCostos, type FilaCosto } from "@/components/editor-costos";
import { FormAccion } from "@/components/form-accion";
import { createClient } from "@/lib/supabase/server";
import { ETIQUETA_ESTADO, estaCongelado, lineaDesdeFila, numONull, resumenPresupuesto, type Estado } from "@/lib/presupuesto-calc";
import { catalogo } from "@/lib/servicios/datos";
import { fecha, hoy, pesos } from "@/lib/formato";

export default function Page({ params }: PageProps<"/presupuestos/[id]/costos">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
      <Contenido params={params} />
    </Suspense>
  );
}

type Fila = Parameters<typeof lineaDesdeFila>[0] & Record<string, unknown> & { id: string; orden: number; concepto: string };

async function Contenido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: p }, cat, { data: facturas }] = await Promise.all([
    supabase.from("presupuestos").select("id, codigo, titulo, estado, version, presupuesto_lineas(*)").eq("id", id).maybeSingle(),
    catalogo(),
    supabase.from("facturacion").select("*").eq("presupuesto_id", id).order("fecha"),
  ]);
  if (!p) notFound();

  const filas = (p.presupuesto_lineas as Fila[]).sort((a, b) => Number(!a.presupuestada) - Number(!b.presupuestada) || a.orden - b.orden);
  const resumen = resumenPresupuesto(filas.map(lineaDesdeFila), cat.rubros, cat.parametros);
  const facturado = (facturas ?? []).reduce((s, f) => s + Number(f.monto_neto), 0);
  const s = (v: unknown) => (v == null ? null : String(v));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Costos reales · {p.codigo}</h1>
          <p className="text-sm text-zinc-500">{p.titulo} · {ETIQUETA_ESTADO[p.estado as Estado]} · versión {p.version}</p>
        </div>
        <Link className="btn-sec" href={`/presupuestos/${id}`}>Volver al presupuesto</Link>
      </div>

      {!estaCongelado(p.estado as Estado) && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Este presupuesto todavía no está aprobado: los costos reales se cargan normalmente después de aprobarlo.
        </p>
      )}

      <EditorCostos
        presupuestoId={id}
        rubros={cat.rubros}
        params={cat.parametros}
        facturado={facturado}
        ventaPresupuestada={resumen.venta}
        impuestosPresupuestados={resumen.impuestos}
        filasIniciales={filas.map(
          (f): FilaCosto => ({
            id: f.id,
            presupuestada: f.presupuestada,
            rubro_id: f.rubro_id,
            concepto: f.concepto,
            proveedor: s(f.proveedor),
            precio_unitario: numONull(f.precio_unitario),
            cantidad: numONull(f.cantidad),
            horas: numONull(f.horas),
            dias: numONull(f.dias),
            real_igual: !!f.real_igual,
            real_precio: numONull(f.real_precio),
            real_cantidad: numONull(f.real_cantidad),
            real_horas: numONull(f.real_horas),
            real_dias: numONull(f.real_dias),
            real_monto: numONull(f.real_monto),
            real_fuente: (f.real_fuente as FilaCosto["real_fuente"]) ?? null,
            real_comprobante: s(f.real_comprobante),
            real_fecha: s(f.real_fecha),
            real_observaciones: s(f.real_observaciones),
          }),
        )}
      />

      <section className="card space-y-3">
        <h2 className="font-medium">Facturación del proyecto</h2>
        {!!facturas?.length && (
          <table className="w-full text-sm">
            <thead><tr><th className="th">Fecha</th><th className="th">N° factura (SIGMA)</th><th className="th text-right">Monto neto</th><th className="th">Observaciones</th><th className="th" /></tr></thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id}>
                  <td className="td">{fecha(f.fecha)}</td>
                  <td className="td">{f.numero}</td>
                  <td className="td text-right tabular-nums">{pesos(Number(f.monto_neto))}</td>
                  <td className="td">{f.observaciones}</td>
                  <td className="td">
                    <FormAccion action={eliminarFactura} boton="Eliminar" variante="sec">
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="presupuesto_id" value={id} />
                    </FormAccion>
                  </td>
                </tr>
              ))}
              <tr className="font-semibold"><td className="td" colSpan={2}>Total facturado</td><td className="td text-right tabular-nums">{pesos(facturado)}</td><td className="td" colSpan={2} /></tr>
            </tbody>
          </table>
        )}
        <FormAccion action={registrarFactura} boton="Registrar factura" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="presupuesto_id" value={id} />
          <label className="text-sm">Fecha<input type="date" name="fecha" defaultValue={hoy()} required className="input mt-1 w-40" /></label>
          <label className="text-sm">N° factura<input name="numero" required className="input mt-1 w-36" placeholder="0001-00001234" /></label>
          <label className="text-sm">Monto neto (sin IVA)<input name="monto_neto" type="number" step="any" min="0" required className="input mt-1 w-40" /></label>
          <label className="text-sm">Observaciones<input name="observaciones" className="input mt-1 w-56" /></label>
        </FormAccion>
      </section>
    </div>
  );
}
