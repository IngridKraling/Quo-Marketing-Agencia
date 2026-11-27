"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  dividirFacturaPresupuesto,
  guardarFacturaPresupuesto,
  quitarParteFacturaPresupuesto,
  type FacturaInput,
} from "@/app/actions";
import { CampoPesos } from "@/components/campo-pesos";
import { pesos } from "@/lib/formato";
import { alfabetico } from "@/lib/opciones";

export type FilaFactura = {
  id: string;
  orden: number;
  presupuestoId: string;
  codigo: string | null;
  cliente: string | null;
  marca: string | null;
  titulo: string;
  area: string | null;
  /** Venta neta del presupuesto: las partes tienen que sumar esto. */
  ventaPresupuesto: number;
  importe: number;
  periodo: string; // AAAA-MM o ""
  oc: string;
  fc: string;
  fcEnviada: boolean;
  pagada: boolean;
  comentarios: string;
};

const detalle = (f: FilaFactura) => [f.cliente, f.marca, f.titulo].filter(Boolean).join(" · ");
const facturada = (f: FilaFactura) => !!f.fc.trim();
const aInput = (f: FilaFactura): FacturaInput => ({
  importe_neto: f.importe,
  periodo: f.periodo || null,
  oc_numero: f.oc || null,
  fc_numero: f.fc || null,
  fc_enviada: f.fcEnviada,
  pagada: f.pagada,
  comentarios: f.comentarios || null,
});

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
/** "2026-11" → "Noviembre 2026". */
const nombreMes = (aaaamm: string) => `${MESES[Number(aaaamm.slice(5, 7)) - 1]} ${aaaamm.slice(0, 4)}`;
/** Opciones de período: del mes que viene hacia atrás, 18 meses. */
function opcionesMes(hoy = new Date()) {
  return Array.from({ length: 18 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + 1 - i, 1);
    const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { valor, nombre: nombreMes(valor) };
  });
}

const SI_NO = "rounded-md border px-2 py-1 text-xs font-medium";
const VERDE = "bg-green-100 text-green-800 border-green-300";
const AMBAR = "bg-amber-50 text-amber-800 border-amber-200";

export function TablaFacturacion({ filas: iniciales }: { filas: FilaFactura[] }) {
  const router = useRouter();
  const [filas, setFilas] = useState(iniciales);
  const [cliente, setCliente] = useState("");
  const [area, setArea] = useState("");
  const [mostrar, setMostrar] = useState<"" | "pendiente" | "facturado">("pendiente");
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [verDetalle, setVerDetalle] = useState(false);
  const [copiado, setCopiado] = useState("");
  const [, startTransition] = useTransition();
  const [meses] = useState(() => opcionesMes());
  // Los filtros usan el FC N° ya guardado: si no, al escribirlo la fila desaparecería antes de guardarse.
  const [fcGuardado, setFcGuardado] = useState<Record<string, string>>(() => Object.fromEntries(iniciales.map((f) => [f.id, f.fc])));
  const facturadaGuardada = (f: FilaFactura) => !!fcGuardado[f.id]?.trim();

  const areas = useMemo(() => [...new Set(iniciales.map((f) => f.area).filter((a): a is string => !!a))].sort(alfabetico), [iniciales]);
  const clientes = useMemo(() => [...new Set(iniciales.map((f) => f.cliente).filter((c): c is string => !!c))].sort(alfabetico), [iniciales]);

  // Partes del mismo presupuesto juntas; presupuestos por código.
  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return filas
      .filter(
        (f) =>
          (!cliente || f.cliente === cliente) &&
          (!area || f.area === area) &&
          (!mostrar || (mostrar === "facturado" ? facturadaGuardada(f) : !facturadaGuardada(f))) &&
          (!t || `${f.codigo} ${detalle(f)} ${f.oc} ${f.fc}`.toLowerCase().includes(t)),
      )
      .sort((a, b) => alfabetico(a.codigo ?? "", b.codigo ?? "") || a.orden - b.orden);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- facturadaGuardada depende de fcGuardado
  }, [filas, cliente, area, mostrar, texto, fcGuardado]);

  // Suma de las partes por presupuesto (todas, no solo las visibles).
  const sumaPorPpto = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of filas) m.set(f.presupuestoId, (m.get(f.presupuestoId) ?? 0) + f.importe);
    return m;
  }, [filas]);
  const partesPorPpto = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of filas) m.set(f.presupuestoId, (m.get(f.presupuestoId) ?? 0) + 1);
    return m;
  }, [filas]);

  const set = (id: string, cambios: Partial<FilaFactura>) => setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...cambios } : f)));

  function guardar(id: string, cambios: Partial<FilaFactura> = {}) {
    const actual = filas.find((f) => f.id === id);
    if (!actual) return;
    const fila = { ...actual, ...cambios };
    set(id, cambios);
    startTransition(async () => {
      const r = await guardarFacturaPresupuesto(id, aInput(fila));
      if (r?.ok) setFcGuardado((g) => ({ ...g, [id]: fila.fc }));
      setAviso(r?.ok ? { ok: true, texto: `${fila.codigo}: guardado` } : { ok: false, texto: `${fila.codigo}: ${r?.mensaje ?? "no se pudo guardar"}` });
      if (r?.ok) router.refresh();
    });
  }

  function accion(fn: () => Promise<{ ok: boolean; mensaje: string } | null>) {
    startTransition(async () => {
      const r = await fn();
      setAviso(r ? { ok: r.ok, texto: r.mensaje } : null);
      if (r?.ok) router.refresh();
    });
  }

  // Texto para pedir la OC: lo pendiente de facturar del cliente filtrado (sin costos ni márgenes).
  const pendientes = filas
    .filter((f) => !facturada(f) && (!cliente || f.cliente === cliente))
    .sort((a, b) => alfabetico(a.codigo ?? "", b.codigo ?? "") || a.orden - b.orden);
  // Solo el nombre del presupuesto y el monto neto.
  const textoOC = [
    "Buen día!",
    "",
    "Tenemos estos trabajos pendientes de facturación:",
    "",
    ...pendientes.map((f) => {
      const partes = partesPorPpto.get(f.presupuestoId) ?? 1;
      return `• ${f.titulo}${partes > 1 ? ` (parte ${f.orden + 1})` : ""}: ${pesos(f.importe)} neto`;
    }),
    "",
    "¿Podrían enviarnos las OC así facturamos, por favor?",
    "Quedo atenta!",
    "",
    "Gracias",
    "Saludos!",
  ].join("\n");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoOC);
      setCopiado("Copiado");
    } catch {
      setCopiado("No se pudo copiar: seleccioná el texto y copialo con Ctrl+C");
    }
  }

  const total = visibles.reduce((s, f) => s + f.importe, 0);

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-3">
        <label className="text-xs text-zinc-500">
          Buscar
          <input className="input mt-1 block w-56" placeholder="ID, cliente, proyecto, OC o FC" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        <label className="text-xs text-zinc-500">
          Cliente
          <select className="input mt-1 block w-48" value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">Todos</option>
            {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          Área
          <select className="input mt-1 block w-44" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Todas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-xs text-zinc-500">
          Mostrar
          <select className="input mt-1 block w-48" value={mostrar} onChange={(e) => setMostrar(e.target.value as typeof mostrar)}>
            <option value="pendiente">Pendiente de facturar</option>
            <option value="facturado">Facturado</option>
            <option value="">Todo</option>
          </select>
        </label>
        <span className="flex-1" />
        <button type="button" className="btn-sec" onClick={() => setVerDetalle((v) => !v)} aria-expanded={verDetalle}>
          {verDetalle ? "Ocultar detalle para la OC" : "Detalle pendiente para pedir la OC"}
        </button>
      </div>

      {verDetalle && (
        <section className="card space-y-2">
          <h2 className="text-sm font-medium">Pendiente de facturar{cliente ? ` · ${cliente}` : " · todos los clientes"}</h2>
          {!cliente && <p className="text-xs text-amber-700">Elegí un cliente arriba para armar el detalle de ese cliente.</p>}
          <textarea
            readOnly
            rows={textoOC.split("\n").length}
            className="input max-w-xl resize-none font-normal leading-relaxed"
            value={textoOC} aria-label="Detalle para pedir la OC" onFocus={(e) => e.target.select()} />
          <div className="flex items-center gap-3">
            <button type="button" className="btn" onClick={copiar}>Copiar</button>
            {copiado && <span className="text-sm text-zinc-500">{copiado}</span>}
          </div>
        </section>
      )}

      {aviso && (
        <p className={`rounded-md px-3 py-2 text-sm ${aviso.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`} role="status">{aviso.texto}</p>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[1500px]">
          <thead>
            <tr>
              <th className="th w-36">Período de facturación</th>
              <th className="th">Área</th>
              <th className="th min-w-40">Cliente</th>
              <th className="th min-w-56">Detalle</th>
              <th className="th text-right">Importe neto</th>
              <th className="th w-32">OC N°</th>
              <th className="th w-36">FC N°</th>
              <th className="th w-24">FC enviada</th>
              <th className="th w-28">Estado de pago</th>
              <th className="th">Comentarios</th>
              <th className="th w-24" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const partes = partesPorPpto.get(f.presupuestoId) ?? 1;
              const suma = sumaPorPpto.get(f.presupuestoId) ?? 0;
              const descuadre = Math.round((suma - f.ventaPresupuesto) * 100) / 100;
              return (
                <tr key={f.id} className="align-top">
                  <td className="td">
                    <select className="input min-w-40" aria-label="Período de facturación" value={f.periodo} onChange={(e) => guardar(f.id, { periodo: e.target.value })}>
                      <option value="">—</option>
                      {(meses.some((m) => m.valor === f.periodo) || !f.periodo ? meses : [{ valor: f.periodo, nombre: nombreMes(f.periodo) }, ...meses]).map((m) => (
                        <option key={m.valor} value={m.valor}>{m.nombre}</option>
                      ))}
                    </select>
                  </td>
                  <td className="td whitespace-nowrap bg-zinc-50">{f.area ?? "—"}</td>
                  <td className="td bg-zinc-50">
                    {f.cliente ?? "—"}
                    {f.marca && <span className="block text-xs text-zinc-500">{f.marca}</span>}
                  </td>
                  <td className="td bg-zinc-50">
                    {partes > 1 && <span className="text-zinc-400">↳ </span>}
                    <span className="font-medium">{f.titulo}</span>{" "}
                    <Link className="whitespace-nowrap font-mono text-xs text-zinc-500 underline" href={`/presupuestos/${f.presupuestoId}`}>{f.codigo}</Link>
                    {partes > 1 && <span className="ml-1 text-xs text-zinc-500">· parte {f.orden + 1} de {partes}</span>}
                    {descuadre !== 0 && (
                      <span className="mt-1 block text-xs text-amber-700">
                        Las partes suman {pesos(suma)} y el presupuesto vende {pesos(f.ventaPresupuesto)} ({descuadre > 0 ? "sobran" : "faltan"} {pesos(Math.abs(descuadre))}).
                      </span>
                    )}
                  </td>
                  <td className="td bg-zinc-50">
                    {partes > 1 ? (
                      <CampoPesos valor={f.importe} etiqueta="Importe neto" className="input min-w-32" onCambio={(v) => set(f.id, { importe: v ?? 0 })} />
                    ) : (
                      <span className="block whitespace-nowrap text-right tabular-nums">{pesos(f.importe)}</span>
                    )}
                    {partes > 1 && (
                      <button type="button" className="mt-1 text-xs text-zinc-500 underline" onClick={() => guardar(f.id)}>Guardar importe</button>
                    )}
                  </td>
                  <td className="td">
                    <input className="input min-w-28" aria-label="OC N°" value={f.oc} placeholder="—" onChange={(e) => set(f.id, { oc: e.target.value })} onBlur={() => guardar(f.id)} />
                  </td>
                  <td className="td">
                    <input className="input min-w-28" aria-label="FC N°" value={f.fc} placeholder="—" onChange={(e) => set(f.id, { fc: e.target.value })} onBlur={() => guardar(f.id)} />
                    <span className={`mt-1 inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${facturada(f) ? VERDE : AMBAR}`}>
                      {facturada(f) ? "Facturado" : "Pendiente de facturar"}
                    </span>
                  </td>
                  <td className="td">
                    <select className={`${SI_NO} ${f.fcEnviada ? VERDE : AMBAR}`} aria-label="FC enviada" value={f.fcEnviada ? "si" : "no"} onChange={(e) => guardar(f.id, { fcEnviada: e.target.value === "si" })}>
                      <option value="no" className="bg-white text-zinc-900">No</option>
                      <option value="si" className="bg-white text-zinc-900">Sí</option>
                    </select>
                  </td>
                  <td className="td">
                    <select className={`${SI_NO} ${f.pagada ? VERDE : AMBAR}`} aria-label="Estado de pago" value={f.pagada ? "pagada" : "pendiente"} onChange={(e) => guardar(f.id, { pagada: e.target.value === "pagada" })}>
                      <option value="pendiente" className="bg-white text-zinc-900">Pendiente</option>
                      <option value="pagada" className="bg-white text-zinc-900">Pagada</option>
                    </select>
                  </td>
                  <td className="td">
                    <input className="input min-w-40" aria-label="Comentarios" value={f.comentarios} onChange={(e) => set(f.id, { comentarios: e.target.value })} onBlur={() => guardar(f.id)} />
                  </td>
                  <td className="td whitespace-nowrap text-xs">
                    {!facturada(f) && (
                      <button type="button" className="text-zinc-600 underline" title="El cliente manda la OC en partes" onClick={() => accion(() => dividirFacturaPresupuesto(f.id))}>
                        Dividir
                      </button>
                    )}
                    {partes > 1 && !facturada(f) && (
                      <button type="button" className="ml-2 text-zinc-400 hover:text-red-600" title="Quitar esta parte (su importe pasa a otra parte)" onClick={() => accion(() => quitarParteFacturaPresupuesto(f.id))}>
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!visibles.length && (
              <tr><td colSpan={11} className="td py-6 text-center text-sm text-zinc-500">No hay filas con esos filtros.</td></tr>
            )}
          </tbody>
          {visibles.length > 0 && (
            <tfoot>
              <tr className="border-t border-zinc-200 font-semibold">
                <td className="td" colSpan={4}>Total de lo que se ve</td>
                <td className="td whitespace-nowrap text-right tabular-nums">{pesos(total)}</td>
                <td className="td" colSpan={6} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
