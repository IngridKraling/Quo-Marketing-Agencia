"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  aprobarPresupuesto,
  cambiarEstado,
  crearNuevaVersion,
  guardarPresupuesto,
  type LineaInput,
  type PresupuestoInput,
} from "@/app/actions";
import {
  ESTADOS,
  ETIQUETA_ESTADO,
  calcularLinea,
  estaCongelado,
  resumenPresupuesto,
  type Estado,
  type Origen,
} from "@/lib/presupuesto-calc";
import type { Catalogo } from "@/lib/servicios/datos";
import { opcionesMarca as marcasDelCliente } from "@/lib/opciones";
import { decimal, pesos, porcentaje } from "@/lib/formato";
import { CampoNumero } from "@/components/campo-numero";
import { CampoPesos } from "@/components/campo-pesos";
import { aLinea, lineaDesdeConcepto, usaHoras } from "@/lib/lineas";

const ORIGENES: { valor: Origen; etiqueta: string }[] = [
  { valor: "proveedor", etiqueta: "Proveedor" },
  { valor: "propio", etiqueta: "Propio" },
  { valor: "personal", etiqueta: "Personal" },
];
const UNIDADES = ["Hora", "Unidad", "Día", "Jornada", "Servicio"];

const lineaVacia = (rubroId: string | null): LineaInput => ({
  id: crypto.randomUUID(),
  rubro_id: rubroId,
  concepto_id: null,
  concepto: "",
  observaciones: null,
  origen: "proveedor",
  proveedor: null,
  unidad: null,
  precio_unitario: null,
  cantidad: 1,
  horas: null,
  dias: null,
  markup: null,
  markup_concepto: null,
});

type Props = {
  cat: Catalogo;
  inicial: PresupuestoInput;
  estado: Estado;
  version: number;
  codigo: string | null;
};

export function EditorPresupuesto({ cat, inicial, estado, version, codigo }: Props) {
  const [p, setP] = useState(inicial);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();
  const congelado = estaCongelado(estado);
  const params = cat.parametros;

  const conceptoPorNombre = useMemo(() => new Map(cat.conceptos.map((c) => [c.nombre.toLowerCase(), c])), [cat.conceptos]);
  const conceptoPorId = useMemo(() => new Map(cat.conceptos.map((c) => [c.id, c])), [cat.conceptos]);

  const set = <K extends keyof PresupuestoInput>(k: K, v: PresupuestoInput[K]) => setP((prev) => ({ ...prev, [k]: v }));
  const setLinea = (id: string, cambios: Partial<LineaInput>) =>
    setP((prev) => ({ ...prev, lineas: prev.lineas.map((l) => (l.id === id ? { ...l, ...cambios } : l)) }));
  const agregar = (l: LineaInput) => setP((prev) => ({ ...prev, lineas: [...prev.lineas, l] }));
  const quitar = (id: string) => setP((prev) => ({ ...prev, lineas: prev.lineas.filter((l) => l.id !== id) }));

  /** Al escribir un concepto que existe en el catálogo, se completan sus datos (como en el Excel). */
  function cambiarConcepto(l: LineaInput, texto: string) {
    const c = conceptoPorNombre.get(texto.trim().toLowerCase());
    if (c && c.id !== l.concepto_id) {
      const base = lineaDesdeConcepto(c, l.cantidad);
      setLinea(l.id, { ...base, id: l.id, observaciones: l.observaciones, markup: l.markup });
    } else if (!c && l.concepto_id) {
      setLinea(l.id, { concepto: texto, concepto_id: null, markup_concepto: null });
    } else {
      setLinea(l.id, { concepto: texto });
    }
  }

  function actualizarPrecios() {
    setP((prev) => ({
      ...prev,
      lineas: prev.lineas.map((l) => {
        const c = l.concepto_id ? conceptoPorId.get(l.concepto_id) : undefined;
        return c ? { ...l, precio_unitario: c.tarifa ?? l.precio_unitario, markup_concepto: c.markup } : l;
      }),
    }));
    setMensaje({ ok: true, texto: "Precios y markups actualizados desde Conceptos. Guardá para confirmar." });
  }

  // Marcas del cliente elegido. Si el valor guardado ya no está en la lista (dato viejo o marca desactivada), se agrega para no perderlo.
  // "OTROS" va siempre al final.
  const marcas = marcasDelCliente(cat.marcas, p.cliente_id);
  const opcionesMarca = p.marca && !marcas.includes(p.marca) ? [p.marca, ...marcas] : marcas;
  const opcionesResponsable = p.responsable && !cat.responsables.includes(p.responsable) ? [p.responsable, ...cat.responsables] : cat.responsables;

  function cambiarCliente(clienteId: string | null) {
    setP((prev) => {
      // Si la marca elegida no es del cliente nuevo, se limpia.
      const marca = prev.marca && !marcasDelCliente(cat.marcas, clienteId).includes(prev.marca) ? null : prev.marca;
      return { ...prev, cliente_id: clienteId, marca };
    });
  }

  const resumen = resumenPresupuesto(p.lineas.map(aLinea), cat.rubros, params);

  // Secciones: rubros del catálogo que tienen líneas, en su orden; al final, las líneas sin rubro.
  const rubrosConLineas = cat.rubros.filter((r) => p.lineas.some((l) => l.rubro_id === r.id));
  const sinRubro = p.lineas.filter((l) => !l.rubro_id || !cat.rubros.some((r) => r.id === l.rubro_id));
  const rubrosLibres = cat.rubros.filter((r) => !p.lineas.some((l) => l.rubro_id === r.id));

  function ejecutar(accion: () => Promise<{ ok: boolean; mensaje: string; id?: string } | null>, alTerminar?: (id?: string) => void) {
    startTransition(async () => {
      const r = await accion();
      setMensaje(r ? { ok: r.ok, texto: r.mensaje } : null);
      if (r?.ok) {
        if (alTerminar) alTerminar(r.id);
        else router.refresh();
      }
    });
  }

  function ordenarLineas() {
    const orden = new Map(cat.rubros.map((r, i) => [r.id, i]));
    return [...p.lineas].sort((a, b) => (orden.get(a.rubro_id ?? "") ?? 999) - (orden.get(b.rubro_id ?? "") ?? 999));
  }

  const guardar = () =>
    ejecutar(
      () => guardarPresupuesto({ ...p, lineas: ordenarLineas() }),
      (id) => (!p.id && id ? router.push(`/presupuestos/${id}`) : router.refresh()),
    );

  const aprobar = () =>
    ejecutar(async () => {
      const g = await guardarPresupuesto({ ...p, lineas: ordenarLineas() });
      if (!g?.ok || !p.id) return g;
      return aprobarPresupuesto(p.id);
    });

  const estadosPosibles = ESTADOS.filter((e) =>
    e === estado ||
    (congelado ? ["en_ejecucion", "finalizado", "facturado", "cancelado"].includes(e) : ["borrador", "enviado", "rechazado", "cancelado"].includes(e)),
  );

  return (
    <div className="space-y-4">
      {congelado ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          🔒 Versión {version} aprobada · solo lectura. Para cambiarla, creá una nueva versión (los costos reales cargados se mantienen).
        </p>
      ) : (
        <p className="text-sm text-zinc-500">Elegí el rubro, después el concepto: si está en Conceptos se completan origen, proveedor, unidad, precio y markup.</p>
      )}

      <datalist id="lista-proveedores">{cat.proveedores.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="lista-unidades">{UNIDADES.map((x) => <option key={x} value={x} />)}</datalist>
      <div className="grid gap-6 2xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <fieldset disabled={congelado} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">Cliente
              <select className="input mt-1" value={p.cliente_id ?? ""} onChange={(e) => cambiarCliente(e.target.value || null)} disabled={!!p.id}>
                <option value="">— Elegir —</option>
                {cat.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <label className="text-sm">Marca / cliente real
              <select className="input mt-1" value={p.marca ?? ""} onChange={(e) => set("marca", e.target.value || null)} disabled={!p.cliente_id}>
                <option value="">{p.cliente_id ? "— Elegir —" : "— Elegí primero el cliente —"}</option>
                {opcionesMarca.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="text-sm">Área
              <select className="input mt-1" value={p.area_id ?? ""} onChange={(e) => set("area_id", e.target.value || null)} disabled={!!p.id}>
                <option value="">— Elegir —</option>
                {cat.areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">Proyecto / evento
              <input className="input mt-1" value={p.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ej. Festival del Limón" />
            </label>
            <label className="text-sm">Fecha de elaboración
              <input type="date" required className="input mt-1" value={p.fecha_elaboracion} onChange={(e) => set("fecha_elaboracion", e.target.value)} />
            </label>
            <label className="text-sm">Fecha del evento
              <input type="date" className="input mt-1" value={p.fecha_evento ?? ""} onChange={(e) => set("fecha_evento", e.target.value || null)} />
            </label>
            <label className="text-sm">Responsable
              <select className="input mt-1" value={p.responsable ?? ""} onChange={(e) => set("responsable", e.target.value || null)}>
                <option value="">— Elegir —</option>
                {opcionesResponsable.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <div className="text-sm sm:col-span-2">
              <span className="text-zinc-500">ID: </span>
              <b>{codigo ?? "se asigna al guardar"}</b>
              <span className="ml-3 text-zinc-500">Versión {version}</span>
            </div>
          </fieldset>

          {rubrosConLineas.map((r) => (
            <SeccionRubro
              key={r.id}
              titulo={r.nombre}
              rubroId={r.id}
              lineas={p.lineas.filter((l) => l.rubro_id === r.id)}
              {...{ cat, params, congelado, setLinea, quitar, cambiarConcepto }}
              onAgregar={() => agregar(lineaVacia(r.id))}
            />
          ))}
          {sinRubro.length > 0 && (
            <SeccionRubro
              titulo="⚠ Sin rubro (no se puede aprobar)"
              rubroId={null}
              lineas={sinRubro}
              {...{ cat, params, congelado, setLinea, quitar, cambiarConcepto }}
              onAgregar={() => agregar(lineaVacia(null))}
            />
          )}

          {!congelado && rubrosLibres.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-zinc-500">Agregar rubro:</span>
              {rubrosLibres.map((r) => (
                <button key={r.id} type="button" className="btn-sec" onClick={() => agregar(lineaVacia(r.id))}>+ {r.nombre}</button>
              ))}
            </div>
          )}

          <fieldset disabled={congelado} className="card">
            <label className="text-sm">Notas internas
              <textarea className="input mt-1" rows={2} value={p.notas ?? ""} onChange={(e) => set("notas", e.target.value)} />
            </label>
          </fieldset>
        </div>

        <aside className="order-first grid h-fit gap-4 md:grid-cols-2 2xl:order-none 2xl:sticky 2xl:top-4 2xl:block 2xl:space-y-4">
          <div className="card space-y-1.5">
            <h2 className="mb-1 font-medium">Resumen</h2>
            {/* Lo que se le pasa al cliente: bien a la vista. */}
            <div className="mb-3 rounded-lg bg-emerald-600 px-4 py-3 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">Precio de venta al cliente</p>
              <p className="text-3xl font-bold leading-tight tabular-nums">{pesos(resumen.venta)}</p>
              <p className="text-xs text-emerald-100">
                Neto, sin IVA · Con IVA ({decimal(params.ivaPct)} %): <b className="tabular-nums text-white">{pesos(conIva(resumen.venta, params.ivaPct))}</b>
              </p>
            </div>
            <Fila label="Costo total" valor={pesos(resumen.costo)} />
            <Fila label={`Impuestos s/venta (${decimal(params.impuestosPct)} %)`} valor={pesos(resumen.impuestos)} />
            <Fila label="Contribución" valor={pesos(resumen.contribucion)} fuerte />
            <Fila
              label="Margen de contribución"
              valor={porcentaje(resumen.margenPct)}
              clase={resumen.venta > 0 && resumen.margenPct < params.margenMinimoPct ? "text-red-700" : ""}
            />
            <Fila label="Markup promedio" valor={`× ${decimal(resumen.markupPromedio)}`} />

            <div className="flex flex-col gap-2 pt-3">
              {!congelado && <button className="btn" onClick={guardar} disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar borrador"}</button>}
              {!congelado && p.id && <button className="btn-sec" onClick={aprobar} disabled={pendiente}>Aprobar y congelar</button>}
              {!congelado && p.lineas.some((l) => l.concepto_id) && (
                <button className="btn-sec" onClick={actualizarPrecios} disabled={pendiente}>Actualizar precios desde Conceptos</button>
              )}
              {congelado && estado !== "facturado" && p.id && (
                <button className="btn-sec" onClick={() => ejecutar(() => crearNuevaVersion(p.id!))} disabled={pendiente}>Crear nueva versión</button>
              )}
              {p.id && (
                <label className="text-sm">Estado
                  <select
                    className="input mt-1"
                    value={estado}
                    disabled={pendiente}
                    onChange={(e) => ejecutar(() => cambiarEstado(p.id!, e.target.value as Estado))}
                  >
                    {estadosPosibles.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO[e]}</option>)}
                  </select>
                </label>
              )}
              {p.id && (
                <div className="flex flex-wrap gap-3 pt-1 text-sm">
                  <Link className="underline" href={`/presupuestos/${p.id}/cliente`}>Vista cliente</Link>
                  <Link className="underline" href={`/presupuestos/${p.id}/costos`}>Costos reales y control</Link>
                </div>
              )}
            </div>
            {mensaje && <p className={`pt-2 text-sm ${mensaje.ok ? "text-green-700" : "text-red-700"}`}>{mensaje.texto}</p>}
          </div>

          <div className="card space-y-2">
            <h2 className="font-medium">Resumen por rubro</h2>
            <table className="w-full text-sm">
              <thead><tr><th className="th">Rubro</th><th className="th text-right">Venta</th><th className="th text-right">Margen</th></tr></thead>
              <tbody>
                {resumen.porRubro.filter((r) => r.costo > 0).map((r) => (
                  <tr key={r.rubro.id}>
                    <td className="td">
                      {r.rubro.nombre}
                      {r.alerta && <div className="text-xs text-amber-700">⚠ {r.alerta}</div>}
                    </td>
                    <td className="td text-right tabular-nums">{pesos(r.venta)}</td>
                    <td className="td text-right tabular-nums">{r.venta ? porcentaje(r.margenPct) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SeccionRubro({
  titulo,
  rubroId,
  lineas,
  cat,
  params,
  congelado,
  setLinea,
  quitar,
  cambiarConcepto,
  onAgregar,
}: {
  titulo: string;
  rubroId: string | null;
  lineas: LineaInput[];
  cat: Catalogo;
  params: Catalogo["parametros"];
  congelado: boolean;
  setLinea: (id: string, c: Partial<LineaInput>) => void;
  quitar: (id: string) => void;
  cambiarConcepto: (l: LineaInput, texto: string) => void;
  onAgregar: () => void;
}) {
  const listaId = `conceptos-${rubroId ?? "todos"}`;
  const conceptos = rubroId ? cat.conceptos.filter((c) => c.rubro_id === rubroId) : cat.conceptos;
  const calc = lineas.map((l) => calcularLinea(aLinea(l), params));
  const costo = calc.reduce((s, r) => s + r.costo, 0);
  const venta = calc.reduce((s, r) => s + r.venta, 0);

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">{titulo}</h2>
        <span className="text-sm text-zinc-500">
          Costo <b className="tabular-nums text-zinc-900">{pesos(costo)}</b> · Venta <b className="tabular-nums text-zinc-900">{pesos(venta)}</b>
        </span>
      </div>
      <datalist id={listaId}>{conceptos.map((c) => <option key={c.id} value={c.nombre} />)}</datalist>
      <div className="-mx-4 overflow-x-auto px-4">
        <fieldset disabled={congelado}>
          <table className="w-full min-w-[1400px]">
            <thead>
              <tr>
                <th className="th">Concepto</th>
                <th className="th">Observaciones</th>
                <th className="th w-28">Origen</th>
                <th className="th w-36">Proveedor</th>
                <th className="th w-24">Unidad</th>
                <th className="th w-28">Precio unit.</th>
                <th className="th w-16">Cant.</th>
                <th className="th w-16">Horas</th>
                <th className="th w-16">Días</th>
                <th className="th w-28 text-right">Costo</th>
                <th className="th w-20">Markup</th>
                <th className="th w-28 text-right">Venta</th>
                <th className="th w-16 text-right">Margen</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => {
                const r = calc[i];
                return (
                  <tr key={l.id} className={l.cantidad === 0 ? "bg-red-50/60" : ""}>
                    <td className="td">
                      <input className="input min-w-44" list={listaId} value={l.concepto} aria-label="Concepto" placeholder="Elegí o escribí" onChange={(e) => cambiarConcepto(l, e.target.value)} />
                    </td>
                    <td className="td"><input className="input min-w-32" value={l.observaciones ?? ""} aria-label="Observaciones" onChange={(e) => setLinea(l.id, { observaciones: e.target.value })} /></td>
                    <td className="td">
                      <select className="input min-w-28" value={l.origen} aria-label="Origen" onChange={(e) => setLinea(l.id, { origen: e.target.value as Origen })}>
                        {ORIGENES.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                      </select>
                    </td>
                    <td className="td"><input className="input min-w-32" list="lista-proveedores" value={l.proveedor ?? ""} aria-label="Proveedor" onChange={(e) => setLinea(l.id, { proveedor: e.target.value })} /></td>
                    <td className="td"><input className="input min-w-24" list="lista-unidades" value={l.unidad ?? ""} aria-label="Unidad" onChange={(e) => setLinea(l.id, usaHoras(e.target.value) ? { unidad: e.target.value } : { unidad: e.target.value, horas: null })} /></td>
                    <td className="td"><CampoPesos valor={l.precio_unitario} etiqueta="Precio unitario" className="input min-w-32" onCambio={(v) => setLinea(l.id, { precio_unitario: v })} /></td>
                    <td className="td"><CampoNumero valor={l.cantidad} etiqueta="Cantidad" className="input min-w-16" onCambio={(v) => setLinea(l.id, { cantidad: v })} /></td>
                    <td className="td">
                      {/* Por Unidad o Servicio no se cargan horas (si una línea vieja tiene horas distintas de 1, se siguen mostrando). */}
                      {usaHoras(l.unidad) || (l.horas != null && l.horas !== 1) ? (
                        <CampoNumero valor={l.horas} etiqueta="Horas" className="input min-w-16" onCambio={(v) => setLinea(l.id, { horas: v })} />
                      ) : (
                        <span className="block min-w-16 text-center text-zinc-300" title="Por Unidad o Servicio: solo cantidad y días">—</span>
                      )}
                    </td>
                    <td className="td"><CampoNumero valor={l.dias} etiqueta="Días" className="input min-w-16" onCambio={(v) => setLinea(l.id, { dias: v })} /></td>
                    <td className="td text-right tabular-nums">{pesos(r.costo)}</td>
                    <td className="td">
                      <CampoNumero valor={l.markup} etiqueta="Markup (override)" className="input min-w-16" placeholder={decimal(l.markup_concepto ?? params.markupDefault)} onCambio={(v) => setLinea(l.id, { markup: v })} />
                    </td>
                    <td className="td text-right tabular-nums">{pesos(r.venta)}</td>
                    <td className={`td text-right tabular-nums ${r.venta > 0 && r.margenPct < params.margenMinimoPct ? "text-red-700" : ""}`}>{r.venta ? porcentaje(r.margenPct) : "—"}</td>
                    <td className="td">
                      {!congelado && <button type="button" className="text-zinc-400 hover:text-red-600" onClick={() => quitar(l.id)} aria-label="Quitar línea">✕</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </fieldset>
      </div>
      {!congelado && <button type="button" className="btn-sec" onClick={onAgregar}>+ Agregar línea</button>}
    </section>
  );
}

/** Igual que en la vista cliente: IVA redondeado a centavos sobre el subtotal. */
const conIva = (neto: number, ivaPct: number) => {
  const subtotal = Math.round(neto * 100) / 100;
  return subtotal + Math.round(subtotal * ivaPct) / 100;
};

function Fila({ label, valor, fuerte, clase = "" }: { label: string; valor: string; fuerte?: boolean; clase?: string }) {
  return (
    <div className={`flex justify-between gap-2 text-sm ${fuerte ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${clase}`}>{valor}</span>
    </div>
  );
}
