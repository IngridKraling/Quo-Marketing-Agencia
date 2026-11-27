"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarCostosReales, type RealInput } from "@/app/actions";
import {
  ETIQUETA_ESTADO_REAL,
  controlProyecto,
  costoLinea,
  costoReal,
  estadoReal,
  type EstadoReal,
  type Linea,
  type Parametros,
  type RubroInfo,
} from "@/lib/presupuesto-calc";
import { CampoNumero } from "@/components/campo-numero";
import { CampoPesos } from "@/components/campo-pesos";
import { decimal, pesos, porcentaje } from "@/lib/formato";

/** Línea con lo presupuestado (solo lectura) y los campos de costo real (editables). */
export type FilaCosto = RealInput & {
  precio_unitario: number | null;
  cantidad: number | null;
  horas: number | null;
  dias: number | null;
  /** Línea por medida (Trade): el costo presupuestado es la cotización total. */
  cotizacion_total?: number | null;
  rubro_id?: string | null;
};

const FUENTES = [
  { valor: "sigma", etiqueta: "SIGMA" },
  { valor: "manual", etiqueta: "Manual" },
  { valor: "caja_chica", etiqueta: "Caja chica" },
  { valor: "connecteam", etiqueta: "Connecteam" },
] as const;

const COLOR_ESTADO: Record<EstadoReal, string> = {
  pendiente: "text-zinc-500",
  ok: "text-green-700",
  excedido: "text-red-700",
  ahorro: "text-blue-700",
  no_presupuestado: "text-amber-700",
  quitada: "text-amber-700",
};

const signo = (n: number) => (n > 0 ? "+" : "");

const aLinea = (f: FilaCosto): Linea => ({
  rubroId: f.rubro_id ?? null,
  precioUnitario: f.precio_unitario,
  cantidad: f.cantidad,
  horas: f.horas,
  dias: f.dias,
  cotizacionTotal: f.cotizacion_total ?? null,
  markup: null,
  markupConcepto: null,
  presupuestada: f.presupuestada,
  real: { igual: f.real_igual, precio: f.real_precio, cantidad: f.real_cantidad, horas: f.real_horas, dias: f.real_dias, monto: f.real_monto },
});

export function EditorCostos({
  presupuestoId,
  filasIniciales,
  rubros,
  params,
  facturado,
  ventaPresupuestada,
  impuestosPresupuestados,
}: {
  presupuestoId: string;
  filasIniciales: FilaCosto[];
  rubros: RubroInfo[];
  params: Parametros;
  facturado: number;
  ventaPresupuestada: number;
  impuestosPresupuestados: number;
}) {
  const [filas, setFilas] = useState(filasIniciales);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  const set = (id: string, c: Partial<FilaCosto>) => setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...c } : f)));
  const rubroNombre = new Map(rubros.map((r) => [r.id, r.nombre]));

  const lineas = filas.map(aLinea);
  const control = controlProyecto(lineas, rubros, params, facturado);
  // La venta e impuestos presupuestados vienen del presupuesto (con markup), no de esta tabla.
  const presup = { ...control.presupuestado, venta: ventaPresupuestada, impuestos: impuestosPresupuestados };
  presup.contribucion = presup.venta - presup.costo - presup.impuestos;
  presup.margenPct = presup.venta ? Math.round((presup.contribucion / presup.venta) * 10000) / 100 : 0;

  function agregarGasto() {
    setFilas((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(), presupuestada: false, rubro_id: rubros[0]?.id ?? null, concepto: "", proveedor: null,
        precio_unitario: null, cantidad: null, horas: null, dias: null,
        real_igual: false, real_precio: null, real_cantidad: null, real_horas: null, real_dias: null, real_monto: null,
        real_fuente: "manual", real_comprobante: null, real_fecha: null, real_observaciones: null,
      },
    ]);
  }

  function guardar() {
    startTransition(async () => {
      const r = await guardarCostosReales(presupuestoId, filas);
      setMensaje(r ? { ok: r.ok, texto: r.mensaje } : null);
      if (r?.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <div>
          <h2 className="font-medium">Costos reales por línea</h2>
          <p className="text-sm text-zinc-500">
            Para cada línea: tildá <b>Igual</b> si no hubo cambios, cargá solo lo que cambió (lo vacío toma lo presupuestado) o el <b>monto de la factura</b>.
          </p>
        </div>
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[1700px]">
            <thead>
              <tr>
                <th className="th">Rubro · concepto</th>
                <th className="th">Presupuestado</th>
                <th className="th w-28 text-right">Costo presup.</th>
                <th className="th w-12">Igual</th>
                <th className="th w-16">Cant.</th>
                <th className="th w-16">Horas</th>
                <th className="th w-16">Días</th>
                <th className="th w-28">Precio real</th>
                <th className="th w-32">Monto factura</th>
                <th className="th w-28 text-right">Costo real</th>
                <th className="th w-28 text-right">Desvío</th>
                <th className="th w-28">Estado</th>
                <th className="th w-28">Fuente</th>
                <th className="th w-28">Comprobante</th>
                <th className="th w-36">Fecha</th>
                <th className="th">Observaciones</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const l = lineas[i];
                const presupuestado = costoLinea(l);
                const real = costoReal(l);
                const estado = estadoReal(l);
                return (
                  <tr key={f.id} className={f.presupuestada ? "" : "bg-amber-50/60"}>
                    <td className="td">
                      {f.presupuestada ? (
                        <>
                          <div className="text-xs text-zinc-500">{rubroNombre.get(f.rubro_id ?? "") ?? "Sin rubro"}</div>
                          <div>{f.concepto}</div>
                        </>
                      ) : (
                        <div className="flex min-w-56 flex-col gap-1">
                          <select className="input" value={f.rubro_id ?? ""} aria-label="Rubro" onChange={(e) => set(f.id, { rubro_id: e.target.value || null })}>
                            {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                          </select>
                          <input className="input" value={f.concepto} placeholder="Gasto no presupuestado" aria-label="Concepto" onChange={(e) => set(f.id, { concepto: e.target.value })} />
                        </div>
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-xs text-zinc-500">
                      {f.presupuestada
                        ? f.cotizacion_total != null
                          ? `Cotización ${pesos(f.cotizacion_total)}${f.cantidad != null ? ` · ${decimal(f.cantidad)} pza` : ""}`
                          : [f.precio_unitario != null && pesos(f.precio_unitario), f.cantidad != null && `× ${decimal(f.cantidad)}`, f.horas != null && `× ${decimal(f.horas)} h`, f.dias != null && `× ${decimal(f.dias)} d`].filter(Boolean).join(" ")
                        : "No presupuestado"}
                    </td>
                    <td className="td text-right tabular-nums">{f.presupuestada ? pesos(presupuestado) : "—"}</td>
                    <td className="td text-center">
                      {f.presupuestada && <input type="checkbox" aria-label="Igual a presupuesto" checked={f.real_igual} onChange={(e) => set(f.id, { real_igual: e.target.checked })} />}
                    </td>
                    {f.presupuestada ? (
                      <>
                        <td className="td"><CampoNumero valor={f.real_cantidad} etiqueta="Cantidad real" className="input min-w-16" placeholder={f.cantidad != null ? decimal(f.cantidad) : ""} onCambio={(v) => set(f.id, { real_cantidad: v })} /></td>
                        <td className="td"><CampoNumero valor={f.real_horas} etiqueta="Horas reales" className="input min-w-16" placeholder={f.horas != null ? decimal(f.horas) : ""} onCambio={(v) => set(f.id, { real_horas: v })} /></td>
                        <td className="td"><CampoNumero valor={f.real_dias} etiqueta="Días reales" className="input min-w-16" placeholder={f.dias != null ? decimal(f.dias) : ""} onCambio={(v) => set(f.id, { real_dias: v })} /></td>
                        <td className="td"><CampoPesos valor={f.real_precio} etiqueta="Precio real" className="input min-w-32" placeholder={f.cotizacion_total != null ? pesos(f.cotizacion_total) : f.precio_unitario != null ? pesos(f.precio_unitario) : ""} onCambio={(v) => set(f.id, { real_precio: v })} /></td>
                      </>
                    ) : (
                      <td className="td" colSpan={4} />
                    )}
                    <td className="td"><CampoPesos valor={f.real_monto} etiqueta="Monto real (factura)" className="input min-w-32" onCambio={(v) => set(f.id, { real_monto: v })} /></td>
                    <td className="td text-right font-medium tabular-nums">{real == null ? "—" : pesos(real)}</td>
                    <td className={`td text-right tabular-nums ${real != null && real - presupuestado > 0 ? "text-red-700" : "text-green-700"}`}>
                      {real == null ? "" : `${real - presupuestado > 0 ? "+" : ""}${pesos(real - presupuestado)}`}
                    </td>
                    <td className={`td text-sm ${COLOR_ESTADO[estado]}`}>{ETIQUETA_ESTADO_REAL[estado]}</td>
                    <td className="td">
                      <select className="input min-w-28" value={f.real_fuente ?? ""} aria-label="Fuente" onChange={(e) => set(f.id, { real_fuente: (e.target.value || null) as FilaCosto["real_fuente"] })}>
                        <option value="">—</option>
                        {FUENTES.map((x) => <option key={x.valor} value={x.valor}>{x.etiqueta}</option>)}
                      </select>
                    </td>
                    <td className="td"><input className="input min-w-28" value={f.real_comprobante ?? ""} aria-label="Comprobante" onChange={(e) => set(f.id, { real_comprobante: e.target.value })} /></td>
                    <td className="td"><input type="date" className="input min-w-36" value={f.real_fecha ?? ""} aria-label="Fecha" onChange={(e) => set(f.id, { real_fecha: e.target.value || null })} /></td>
                    <td className="td"><input className="input min-w-40" value={f.real_observaciones ?? ""} aria-label="Observaciones" onChange={(e) => set(f.id, { real_observaciones: e.target.value })} /></td>
                    <td className="td">
                      {!f.presupuestada && (
                        <button type="button" className="text-zinc-400 hover:text-red-600" aria-label="Quitar gasto" onClick={() => setFilas((prev) => prev.filter((x) => x.id !== f.id))}>✕</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" onClick={guardar} disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar costos reales"}</button>
          <button type="button" className="btn-sec" onClick={agregarGasto}>+ Agregar gasto no presupuestado</button>
          {mensaje && <span className={`text-sm ${mensaje.ok ? "text-green-700" : "text-red-700"}`}>{mensaje.texto}</span>}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-x-auto">
          <h2 className="mb-2 font-medium">Control por rubro · presupuestado vs. real</h2>
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr><th className="th">Rubro</th><th className="th text-right">Presupuestado</th><th className="th text-right">Real</th><th className="th text-right">Desvío</th><th className="th text-right">Pend.</th><th className="th">Control</th></tr></thead>
            <tbody>
              {control.porRubro.filter((r) => r.presupuestado || r.real || r.pendientes).map((r) => (
                <tr key={r.rubro.id}>
                  <td className="td">{r.rubro.nombre}</td>
                  <td className="td text-right tabular-nums">{pesos(r.presupuestado)}</td>
                  <td className="td text-right tabular-nums">{pesos(r.real)}</td>
                  <td className={`td text-right tabular-nums ${r.desvio > 0 ? "text-red-700" : ""}`}>{pesos(r.desvio)}{r.desvioPct != null && <span className="text-xs text-zinc-500"> ({porcentaje(r.desvioPct)})</span>}</td>
                  <td className="td text-right">{r.pendientes || ""}</td>
                  <td className="td text-red-700">{r.control}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="td">Total costos</td>
                <td className="td text-right tabular-nums">{pesos(control.presupuestado.costo)}</td>
                <td className="td text-right tabular-nums">{pesos(control.real.costo)}</td>
                <td className={`td text-right tabular-nums ${control.desvio.costo > 0 ? "text-red-700" : control.desvio.costo < 0 ? "text-green-700" : ""}`}>
                  {signo(control.desvio.costo)}{pesos(control.desvio.costo)}
                  {control.desvio.costoPct != null && <span className="text-xs"> ({signo(control.desvio.costoPct)}{porcentaje(control.desvio.costoPct)})</span>}
                </td>
                <td className="td text-right">{control.pendientes || ""}</td>
                <td className="td" />
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="card overflow-x-auto">
          <h2 className="mb-2 font-medium">Resultado del proyecto</h2>
          <table className="w-full min-w-[420px] text-sm">
            <thead><tr><th className="th" /><th className="th text-right">Presupuestado</th><th className="th text-right">Real</th><th className="th text-right">Desvío</th><th className="th text-right">Desvío %</th></tr></thead>
            <tbody>
              {([
                ["Venta / facturación", presup.venta, control.real.venta],
                ["Costos directos", presup.costo, control.real.costo],
                ["Impuestos s/venta", presup.impuestos, control.real.impuestos],
                ["Contribución", presup.contribucion, control.real.contribucion],
              ] as const).map(([label, a, b]) => (
                <tr key={label}>
                  <td className="td">{label}</td>
                  <td className="td text-right tabular-nums">{pesos(a)}</td>
                  <td className="td text-right tabular-nums">{pesos(b)}</td>
                  <td className="td text-right tabular-nums">{signo(b - a)}{pesos(b - a)}</td>
                  <td className="td text-right tabular-nums">{a ? `${signo(b - a)}${porcentaje(Math.round(((b - a) / Math.abs(a)) * 10000) / 100)}` : "—"}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="td">Margen de contribución</td>
                <td className="td text-right">{porcentaje(presup.margenPct)}</td>
                <td className="td text-right">{facturado ? porcentaje(control.real.margenPct) : "—"}</td>
                <td className="td text-right">{facturado ? `${signo(control.real.margenPct - presup.margenPct)}${decimal(control.real.margenPct - presup.margenPct)} pp` : ""}</td>
                <td className="td" />
              </tr>
            </tbody>
          </table>
          <div className={`mt-3 rounded-md p-3 ${control.desvio.costo > 0 ? "bg-red-50" : "bg-green-50"}`}>
            <div className="text-sm text-zinc-600">Desvío total de costos (real vs. presupuestado)</div>
            <div className={`text-2xl font-semibold tabular-nums ${control.desvio.costo > 0 ? "text-red-700" : "text-green-700"}`}>
              {control.desvio.costoPct == null ? "—" : `${signo(control.desvio.costoPct)}${porcentaje(control.desvio.costoPct)}`}
              <span className="ml-2 text-base font-normal">({signo(control.desvio.costo)}{pesos(control.desvio.costo)})</span>
            </div>
            <div className="text-xs text-zinc-500">{control.desvio.costo > 0 ? "Se gastó más de lo presupuestado" : control.desvio.costo < 0 ? "Se gastó menos de lo presupuestado" : "Igual a lo presupuestado"}</div>
          </div>
          {control.pendientes > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              Hay {control.pendientes} línea(s) pendientes: mientras tanto el costo real está incompleto y la contribución real se ve mejor de lo que es.
            </p>
          )}
          {!facturado && <p className="mt-2 text-xs text-zinc-500">La venta real sale de las facturas registradas abajo.</p>}
        </section>
      </div>
    </div>
  );
}
