"use client";

import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";
import type { LineaInput } from "@/app/actions";
import { CampoNumero } from "@/components/campo-numero";
import { CampoPesos } from "@/components/campo-pesos";
import { decimal, fecha, pesos, porcentaje } from "@/lib/formato";
import { metros2, type Comparacion } from "@/lib/medidas";
import { AccionesLinea, type Arrastre } from "@/components/flechas-linea";
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

/** "11 % más caro" / "5 % más barato" / "igual", con color. */
function Diferencia({ pct }: { pct: number }) {
  const n = Math.round(pct);
  if (n === 0) return <b className="text-zinc-700">igual</b>;
  return n > 0 ? (
    <b className={n > 10 ? "text-amber-700" : "text-zinc-700"}>{decimal(n)} % más caro</b>
  ) : (
    <b className="text-emerald-700">{decimal(-n)} % más barato</b>
  );
}

const LinkPpto = ({ id, codigo }: { id: string; codigo: string | null }) => (
  <Link className="font-semibold underline" href={`/presupuestos/${id}`} target="_blank">{codigo ?? "otro presupuesto"}</Link>
);

/** Frases de comparación debajo de una línea: costo vs. otras cotizaciones y qué pasa con el precio al cliente. */
function Comparaciones({ l, c, markup, params }: { l: LineaInput; c: Comparacion; markup: number; params: Parametros }) {
  const frases: { tono: "info" | "ok" | "alerta"; texto: ReactNode }[] = [];
  const unidad = c.unitario?.por === "pieza" ? "por pieza" : "por m²";

  // 0) Sin proveedor no se puede aprobar ni comparar con sus cotizaciones anteriores.
  if (!l.proveedor) {
    frases.push({
      tono: "alerta",
      texto: <>Elegí el <b>proveedor</b>: es obligatorio para aprobar el presupuesto y para comparar con lo que cobró otras veces.</>,
    });
  }

  // 1) Costo: ¿cuánto cobró este proveedor la última vez? ¿y el promedio de todos?
  if (c.ultimaDelProveedor) {
    const u = c.ultimaDelProveedor;
    frases.push({
      tono: "info",
      texto: (
        <>
          <b>{l.proveedor}</b> la última vez cobró <b>{pesos(u.valor)} {unidad}</b> ({fecha(u.fecha)}, <LinkPpto id={u.presupuestoId} codigo={u.codigo} />)
          {" → "}hoy está <Diferencia pct={u.difPct} />.
        </>
      ),
    });
  } else if (c.unitario && l.proveedor) {
    frases.push({ tono: "info", texto: <>Es la primera vez que <b>{l.proveedor}</b> cotiza este concepto: no hay con qué comparar.</> });
  }
  // ¿Hay otro proveedor que lo haya cotizado más barato en los últimos 6 meses?
  if (c.otroMasBarato && c.unitario) {
    const o = c.otroMasBarato;
    const n = Math.round(o.difPct);
    frases.push({
      tono: n > 0 ? "alerta" : "info",
      texto: (
        <>
          De otros proveedores, el más barato fue <b>{o.proveedor}</b>: <b>{pesos(o.valor)} {unidad}</b> ({fecha(o.fecha)},{" "}
          <LinkPpto id={o.presupuestoId} codigo={o.codigo} />)
          {n > 0 ? (
            <> → {l.proveedor ? <b>{l.proveedor}</b> : "esta cotización"} está <Diferencia pct={o.difPct} />.</>
          ) : (
            <> → {l.proveedor ? <b>{l.proveedor}</b> : "esta cotización"} sigue siendo la más conveniente.</>
          )}
        </>
      ),
    });
  }

  // 2) Precio al cliente: ¿mantiene el markup del último presupuesto enviado con este mismo ítem?
  const a = c.anterior;
  if (a) {
    const ppto = <><LinkPpto id={a.presupuestoId} codigo={a.codigo} /> ({fecha(a.fecha)})</>;
    if (a.mismoCosto && markup === a.markup) {
      const enVezDelTramo = params.markupTramo != null && params.markupTramo !== a.markup;
      frases.push({
        tono: "ok",
        texto: (
          <>
            ✓ Mismo ítem, proveedor, medidas y costo que en {ppto}: se usa el mismo markup <b>× {decimal(a.markup)}</b>
            {enVezDelTramo && <> (en vez del × {decimal(params.markupTramo!)} del tramo)</>}, así que <b>el cliente ve el mismo precio</b>.
          </>
        ),
      });
    } else if (a.mismoCosto) {
      frases.push({
        tono: "alerta",
        texto: (
          <>
            Ojo: en {ppto} este mismo ítem, con el mismo costo, se cotizó con <b>× {decimal(a.markup)}</b>. Acá queda con <b>× {decimal(markup)}</b>,
            así que <b>el cliente va a ver otro precio</b>.
          </>
        ),
      });
    } else {
      const actual = l.cotizacion_total == null ? null : l.cotizacion_total / (l.cantidad && l.cantidad > 0 ? l.cantidad : 1);
      frases.push({
        tono: "info",
        texto: (
          <>
            En {ppto} este ítem costaba <b>{pesos(a.costoPieza)} por pieza</b>
            {actual != null && <> y ahora cuesta <b>{pesos(actual)}</b></>}. Como cambió el costo, se usa el markup normal.
          </>
        ),
      });
    }
  }

  if (!frases.length) return null;
  const color = { info: "bg-zinc-100 text-zinc-700", ok: "bg-emerald-50 text-emerald-900", alerta: "bg-amber-50 text-amber-900" };
  return (
    <tr>
      <td colSpan={15} className="px-2 pb-3 pt-0 pl-8">
        <ul className="sticky left-0 flex w-fit max-w-[min(100%,900px)] flex-col gap-1 text-xs">
          {frases.map((f, i) => (
            <li key={i} className={`rounded px-2 py-1 ${color[f.tono]}`}>{f.texto}</li>
          ))}
        </ul>
      </td>
    </tr>
  );
}

/**
 * Tabla de un rubro que se cotiza por medida (Trade): base × altura, piezas y cotización total del proveedor.
 * Calcula m² y $/m² (o $/pieza) y debajo de cada línea explica en palabras cómo se compara con otras cotizaciones.
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
  filaDnd,
  arrastre,
}: {
  lineas: LineaInput[];
  calc: (Resultado & { markup: number })[];
  comparaciones: Comparacion[];
  params: Parametros;
  congelado: boolean;
  listaId: string;
  /** Proveedores del rubro y, aparte, los que no tienen rubro asignado. */
  proveedores: { delRubro: string[]; sinAsignar: string[] };
  setLinea: (id: string, c: Partial<LineaInput>) => void;
  quitar: (id: string) => void;
  cambiarConcepto: (l: LineaInput, texto: string) => void;
  /** Props de arrastre de cada fila y el arrastre del editor (para la manija). */
  filaDnd: (id: string) => Record<string, unknown> & { className: string };
  arrastre?: Arrastre;
}) {
  // Se puede cargar el costo unitario o el total: se guarda el total. Si se cargó por unidad, al cambiar las
  // piezas se mantiene el unitario (y se recalcula el total); si se cargó el total, se mantiene el total.
  const [porUnidad, setPorUnidad] = useState<Record<string, boolean>>({});
  const piezasDe = (l: LineaInput) => (l.cantidad && l.cantidad > 0 ? l.cantidad : 1);
  const unitario = (l: LineaInput) => (l.cotizacion_total == null ? null : Math.round((l.cotizacion_total / piezasDe(l)) * 100) / 100);
  function cambiarUnitario(l: LineaInput, v: number | null) {
    setPorUnidad((m) => ({ ...m, [l.id]: true }));
    setLinea(l.id, { cotizacion_total: v == null ? null : Math.round(v * piezasDe(l) * 100) / 100 });
  }
  function cambiarTotal(l: LineaInput, v: number | null) {
    setPorUnidad((m) => ({ ...m, [l.id]: false }));
    setLinea(l.id, { cotizacion_total: v });
  }
  function cambiarPiezas(l: LineaInput, v: number | null) {
    const u = unitario(l);
    const piezas = v && v > 0 ? v : 1;
    setLinea(l.id, porUnidad[l.id] && u != null ? { cantidad: v, cotizacion_total: Math.round(u * piezas * 100) / 100 } : { cantidad: v });
  }

  return (
    <table className="w-full min-w-[1500px]">
      <thead>
        <tr>
          <th className="w-6" />
          <th className="th">Concepto</th>
          <th className="th">Observaciones</th>
          <th className="th w-40">Proveedor</th>
          <th className="th w-20">Base (m)</th>
          <th className="th w-20">Altura (m)</th>
          <th className="th w-16">Piezas</th>
          <th className="th w-16 text-right">m²</th>
          <th className="th w-32">Costo unitario</th>
          <th className="th w-32">Costo total</th>
          <th className="th w-28 text-right">Costo por m²</th>
          <th className="th w-20">Markup</th>
          <th className="th w-28 text-right">Venta unitaria</th>
          <th className="th w-28 text-right">Venta total</th>
          <th className="th w-16 text-right">Margen</th>
        </tr>
      </thead>
      <tbody>
        {lineas.map((l, i) => {
          const r = calc[i];
          const c = comparaciones[i];
          const m2 = metros2(medidaDe(l));
          const enLista = !!l.proveedor && [...proveedores.delRubro, ...proveedores.sinAsignar].includes(l.proveedor);
          const mantieneAnterior = !!c.anterior?.mismoCosto && r.markup === c.anterior.markup;
          const { className: dndClase, ...dnd } = filaDnd(l.id);
          return (
            <Fragment key={l.id}>
              <tr {...dnd} className={`${!l.proveedor ? "bg-amber-50/60" : ""} ${dndClase}`}>
                <td className="td w-12 whitespace-nowrap pr-0">
                  {!congelado && <AccionesLinea arrastre={arrastre} id={l.id} onQuitar={() => quitar(l.id)} />}
                </td>
                <td className="td">
                  <input className="input min-w-44" list={listaId} value={l.concepto} aria-label="Concepto" placeholder="Elegí o escribí" onChange={(e) => cambiarConcepto(l, e.target.value)} />
                </td>
                <td className="td"><input className="input min-w-32" value={l.observaciones ?? ""} aria-label="Observaciones" onChange={(e) => setLinea(l.id, { observaciones: e.target.value })} /></td>
                <td className="td">
                  <select className="input min-w-36" value={l.proveedor ?? ""} aria-label="Proveedor" onChange={(e) => setLinea(l.id, { proveedor: e.target.value || null })}>
                    <option value="">— Elegir —</option>
                    {l.proveedor && !enLista && <option value={l.proveedor}>{l.proveedor}</option>}
                    {proveedores.delRubro.map((x) => <option key={x} value={x}>{x}</option>)}
                    {proveedores.sinAsignar.length > 0 && (
                      <optgroup label={proveedores.delRubro.length ? "Otros (sin rubro asignado)" : "Proveedores"}>
                        {proveedores.sinAsignar.map((x) => <option key={x} value={x}>{x}</option>)}
                      </optgroup>
                    )}
                  </select>
                </td>
                <td className="td"><CampoNumero valor={l.base ?? null} etiqueta="Base (m)" placeholder="—" className="input min-w-16" onCambio={(v) => setLinea(l.id, { base: v || null })} /></td>
                <td className="td"><CampoNumero valor={l.altura ?? null} etiqueta="Altura (m)" placeholder="—" className="input min-w-16" onCambio={(v) => setLinea(l.id, { altura: v || null })} /></td>
                <td className="td"><CampoNumero valor={l.cantidad} etiqueta="Piezas" className="input min-w-14" onCambio={(v) => cambiarPiezas(l, v)} /></td>
                <td className="td text-right tabular-nums">{m2 ? decimal(m2) : "—"}</td>
                <td className="td"><CampoPesos valor={unitario(l)} etiqueta="Costo unitario" placeholder="Por pieza" className="input min-w-32" onCambio={(v) => cambiarUnitario(l, v)} /></td>
                <td className="td"><CampoPesos valor={l.cotizacion_total ?? null} etiqueta="Cotización total" placeholder="A cotizar" className="input min-w-32" onCambio={(v) => cambiarTotal(l, v)} /></td>
                <td className="td whitespace-nowrap text-right font-semibold tabular-nums">
                  {c.unitario ? <>{pesos(c.unitario.valor)}{c.unitario.por === "pieza" && <span className="block text-xs font-normal text-zinc-500">por pieza (sin medidas)</span>}</> : "—"}
                </td>
                <td className="td">
                  <CampoNumero
                    valor={l.markup}
                    etiqueta="Markup (override)"
                    className={`input min-w-16 ${mantieneAnterior && l.markup != null ? "border-emerald-500 bg-emerald-50" : ""}`}
                    placeholder={decimal(params.markupTramo ?? l.markup_concepto ?? params.markupDefault)}
                    onCambio={(v) => setLinea(l.id, { markup: v })}
                  />
                </td>
                {/* Precio de venta por pieza y total (lo que se le cotiza al cliente). */}
                <td className="td whitespace-nowrap text-right font-semibold tabular-nums text-emerald-700">
                  {r.venta ? pesos(Math.round((r.venta / piezasDe(l)) * 100) / 100) : "—"}
                </td>
                <td className="td whitespace-nowrap text-right font-semibold tabular-nums text-emerald-700">{pesos(r.venta)}</td>
                <td className={`td whitespace-nowrap text-right tabular-nums ${r.venta > 0 && r.margenPct < params.margenMinimoPct ? "text-red-700" : ""}`}>{r.venta ? porcentaje(r.margenPct) : "—"}</td>
              </tr>
              <Comparaciones l={l} c={c} markup={r.markup} params={params} />
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
