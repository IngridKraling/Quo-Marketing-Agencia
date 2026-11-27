"use client";

import Link from "next/link";
import { Fragment } from "react";
import type { LineaInput } from "@/app/actions";
import { CampoNumero } from "@/components/campo-numero";
import { CampoPesos } from "@/components/campo-pesos";
import { decimal, fecha, pesos, porcentaje } from "@/lib/formato";
import { metros2, type Comparacion } from "@/lib/medidas";
import type { Parametros, Resultado } from "@/lib/presupuesto-calc";

/** Medida de una línea del editor, para calcular y comparar. */
export const medidaDe = (l: LineaInput) => ({
  conceptoId: l.concepto_id,
  concepto: l.concepto,
  proveedor: l.proveedor,
  base: l.base ?? null,
  altura: l.altura ?? null,
  piezas: l.cantidad,
  cotizacionTotal: l.cotizacion_total ?? null,
});

/** Diferencia en %: verde si está por debajo, ámbar si supera 10 %. */
function Diferencia({ pct }: { pct: number }) {
  const color = pct < 0 ? "text-emerald-700" : pct > 10 ? "text-amber-700" : "text-zinc-500";
  return <span className={`text-xs ${color}`}>{pct > 0 ? "+" : ""}{decimal(Math.round(pct))} %</span>;
}

/**
 * Tabla de un rubro que se cotiza por medida (Trade): base × altura, piezas y cotización total del proveedor.
 * Calcula m² y $/m² (o $/pieza) y lo compara con la última cotización del mismo proveedor y con el promedio.
 */
export function TablaMedidas({
  lineas,
  calc,
  comparaciones,
  params,
  congelado,
  listaId,
  proveedores,
  setLinea,
  quitar,
  cambiarConcepto,
}: {
  lineas: LineaInput[];
  calc: (Resultado & { markup: number })[];
  comparaciones: Comparacion[];
  params: Parametros;
  congelado: boolean;
  listaId: string;
  proveedores: string[];
  setLinea: (id: string, c: Partial<LineaInput>) => void;
  quitar: (id: string) => void;
  cambiarConcepto: (l: LineaInput, texto: string) => void;
}) {
  return (
    <table className="w-full min-w-[1500px]">
      <thead>
        <tr>
          <th className="th">Concepto</th>
          <th className="th">Observaciones</th>
          <th className="th w-40">Proveedor</th>
          <th className="th w-20">Base (m)</th>
          <th className="th w-20">Altura (m)</th>
          <th className="th w-16">Piezas</th>
          <th className="th w-16 text-right">m²</th>
          <th className="th w-32">Cotización total</th>
          <th className="th w-28 text-right">$ / m²</th>
          <th className="th w-32 text-right">Mismo proveedor</th>
          <th className="th w-32 text-right">Todos (6 meses)</th>
          <th className="th w-20">Markup</th>
          <th className="th w-28 text-right">Venta</th>
          <th className="th w-16 text-right">Margen</th>
          <th className="w-6" />
        </tr>
      </thead>
      <tbody>
        {lineas.map((l, i) => {
          const r = calc[i];
          const c = comparaciones[i];
          const m2 = metros2(medidaDe(l));
          const opcionesProveedor = l.proveedor && !proveedores.includes(l.proveedor) ? [l.proveedor, ...proveedores] : proveedores;
          const heredado = !!l.markup_ref_presupuesto_id && c.anterior?.presupuestoId === l.markup_ref_presupuesto_id;
          return (
            <Fragment key={l.id}>
              <tr className={!l.proveedor ? "bg-amber-50/60" : ""}>
                <td className="td">
                  <input className="input min-w-44" list={listaId} value={l.concepto} aria-label="Concepto" placeholder="Elegí o escribí" onChange={(e) => cambiarConcepto(l, e.target.value)} />
                </td>
                <td className="td"><input className="input min-w-32" value={l.observaciones ?? ""} aria-label="Observaciones" onChange={(e) => setLinea(l.id, { observaciones: e.target.value })} /></td>
                <td className="td">
                  <select className="input min-w-36" value={l.proveedor ?? ""} aria-label="Proveedor" onChange={(e) => setLinea(l.id, { proveedor: e.target.value || null })}>
                    <option value="">— Elegir —</option>
                    {opcionesProveedor.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </td>
                <td className="td"><CampoNumero valor={l.base ?? null} etiqueta="Base (m)" placeholder="—" className="input min-w-16" onCambio={(v) => setLinea(l.id, { base: v || null })} /></td>
                <td className="td"><CampoNumero valor={l.altura ?? null} etiqueta="Altura (m)" placeholder="—" className="input min-w-16" onCambio={(v) => setLinea(l.id, { altura: v || null })} /></td>
                <td className="td"><CampoNumero valor={l.cantidad} etiqueta="Piezas" className="input min-w-14" onCambio={(v) => setLinea(l.id, { cantidad: v })} /></td>
                <td className="td text-right tabular-nums">{m2 ? decimal(m2) : "—"}</td>
                <td className="td"><CampoPesos valor={l.cotizacion_total ?? null} etiqueta="Cotización total" placeholder="A cotizar" className="input min-w-32" onCambio={(v) => setLinea(l.id, { cotizacion_total: v })} /></td>
                <td className="td text-right font-semibold tabular-nums">
                  {c.unitario ? <>{pesos(c.unitario.valor)}{c.unitario.por === "pieza" && <span className="block text-xs font-normal text-zinc-500">por pieza</span>}</> : "—"}
                </td>
                <td className="td text-right tabular-nums">
                  {c.ultimaDelProveedor ? (
                    <>
                      {pesos(c.ultimaDelProveedor.valor)}
                      <span className="block whitespace-nowrap text-xs text-zinc-500">
                        {fecha(c.ultimaDelProveedor.fecha)} <Diferencia pct={c.ultimaDelProveedor.difPct} />
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-zinc-400">{c.unitario && l.proveedor ? "primera vez" : "—"}</span>
                  )}
                </td>
                <td className="td text-right tabular-nums">
                  {c.promedio ? (
                    <>
                      {pesos(c.promedio.valor)}
                      <span className="block whitespace-nowrap text-xs text-zinc-500">
                        {c.promedio.cantidad} pptos <Diferencia pct={c.promedio.difPct} />
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-zinc-400">{c.unitario ? "sin datos" : "—"}</span>
                  )}
                </td>
                <td className="td">
                  <CampoNumero
                    valor={l.markup}
                    etiqueta="Markup (override)"
                    className={`input min-w-16 ${heredado ? "border-indigo-400 bg-indigo-50" : ""}`}
                    placeholder={decimal(params.markupTramo ?? l.markup_concepto ?? params.markupDefault)}
                    onCambio={(v) => setLinea(l.id, { markup: v })}
                  />
                </td>
                <td className="td text-right tabular-nums">{pesos(r.venta)}</td>
                <td className={`td whitespace-nowrap text-right tabular-nums ${r.venta > 0 && r.margenPct < params.margenMinimoPct ? "text-red-700" : ""}`}>{r.venta ? porcentaje(r.margenPct) : "—"}</td>
                <td className="td">
                  {!congelado && <button type="button" className="text-zinc-400 hover:text-red-600" onClick={() => quitar(l.id)} aria-label="Quitar línea">✕</button>}
                </td>
              </tr>
              {c.anterior && (
                <tr>
                  <td colSpan={15} className="px-2 pb-2 pt-0 text-xs">
                    <span className={`sticky left-0 inline-block rounded px-2 py-1 ${c.anterior.mismoCosto ? "bg-indigo-50 text-indigo-900" : "bg-zinc-100 text-zinc-700"}`}>
                      {c.anterior.mismoCosto ? (
                        <>
                          ↺ Mismo costo que en{" "}
                          <Link className="font-semibold underline" href={`/presupuestos/${c.anterior.presupuestoId}`} target="_blank">{c.anterior.codigo}</Link>
                          {" "}({fecha(c.anterior.fecha)}): {heredado ? "se mantiene" : "allí fue"} × {decimal(c.anterior.markup)}
                          {heredado && params.markupTramo != null && params.markupTramo !== c.anterior.markup && <> en vez del × {decimal(params.markupTramo)} del tramo</>}
                          {!heredado && " (este presupuesto usa otro markup cargado a mano)"}.
                        </>
                      ) : (
                        <>
                          La última vez (
                          <Link className="font-semibold underline" href={`/presupuestos/${c.anterior.presupuestoId}`} target="_blank">{c.anterior.codigo}</Link>
                          , {fecha(c.anterior.fecha)}) costaba {pesos(c.anterior.costoPieza)} por pieza con × {decimal(c.anterior.markup)}. Ahora cambió el costo, así que se usa el markup normal.
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
