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
  ETIQUETA_ESTADO,
  calcularLinea,
  conTramo,
  COLOR_EJECUCION,
  COLOR_ESTADO,
  ETAPAS_EJECUCION,
  ETIQUETA_EJECUCION,
  estaCongelado,
  estadoComercial,
  opcionesComerciales,
  paramsDeArea,
  resumenPresupuesto,
  type Estado,
  type Origen,
} from "@/lib/presupuesto-calc";
import type { Catalogo } from "@/lib/servicios/datos";
import { conceptosParaArea, opcionesMarca as marcasDelCliente, proveedoresParaRubro, rubrosParaArea } from "@/lib/opciones";
import { decimal, pesos, porcentaje } from "@/lib/formato";
import { CampoNumero } from "@/components/campo-numero";
import { CampoPesos } from "@/components/campo-pesos";
import { aLinea, agruparPorRubro, arrastrarLinea, arrastrarRubro, lineaDesdeConcepto, ordenDeRubros, usaHoras } from "@/lib/lineas";
import { comparar, type Comparacion, type Referencia } from "@/lib/medidas";
import { TablaMedidas, medidaDe } from "@/components/lineas-medida";
import { AccionesLinea, useArrastre, type Arrastre } from "@/components/flechas-linea";

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
  base: null,
  altura: null,
  cotizacion_total: null,
  markup_ref_presupuesto_id: null,
});

/**
 * Líneas por medida: si hay un presupuesto enviado con el mismo concepto, proveedor, medidas y costo,
 * se mantiene su markup (para no cambiarle el precio al cliente). Si después cambia algo, se vuelve al
 * markup normal. Un markup escrito a mano nunca se pisa.
 */
function aplicarMarkupAnterior(
  l: LineaInput,
  cambios: Partial<LineaInput>,
  presupuestoId: string | null,
  porMedida: Set<string>,
  referencias: Referencia[],
  hoy: string,
): LineaInput {
  const next = { ...l, ...cambios };
  if (!next.rubro_id || !porMedida.has(next.rubro_id)) return next;
  if ("markup" in cambios) return { ...next, markup_ref_presupuesto_id: null };
  const anterior = comparar(medidaDe(next), referencias, presupuestoId, hoy).anterior;
  const automatico = next.markup == null || !!next.markup_ref_presupuesto_id;
  if (anterior?.mismoCosto && automatico) return { ...next, markup: anterior.markup, markup_ref_presupuesto_id: anterior.presupuestoId };
  if (next.markup_ref_presupuesto_id) return { ...next, markup: null, markup_ref_presupuesto_id: null };
  return next;
}

type Props = {
  cat: Catalogo;
  inicial: PresupuestoInput;
  estado: Estado;
  version: number;
  codigo: string | null;
  /** Líneas por medida de otros presupuestos, para comparar $/m² y respetar markups ya enviados. */
  referencias: Referencia[];
  hoy: string;
};

export function EditorPresupuesto({ cat, inicial, estado, version, codigo, referencias, hoy }: Props) {
  // Un presupuesto nuevo siempre arranca con ids de línea nuevos: si se reutilizaran (por ejemplo, porque la
  // página quedó en memoria), al guardar se moverían las líneas de otro presupuesto con esos mismos ids.
  // Además, en las líneas por medida se aplica desde el arranque la regla de "mismo costo → mismo markup".
  const [arranque] = useState<PresupuestoInput>(() => {
    const lineas = inicial.id ? inicial.lineas : inicial.lineas.map((l) => ({ ...l, id: crypto.randomUUID() }));
    if (estaCongelado(estado)) return { ...inicial, lineas };
    const medida = new Set(cat.rubros.filter((r) => r.porMedida).map((r) => r.id));
    return { ...inicial, lineas: lineas.map((l) => aplicarMarkupAnterior(l, {}, inicial.id ?? null, medida, referencias, hoy)) };
  });
  const [p, setP] = useState(arranque);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();
  const congelado = estaCongelado(estado);
  // Parámetros del área del presupuesto, con el markup por tramo resuelto según el costo total (Trade).
  const params = conTramo(p.lineas.map(aLinea), paramsDeArea(cat.parametros, cat.tramos, p.area_id));

  const conceptoPorNombre = useMemo(() => new Map(cat.conceptos.map((c) => [c.nombre.toLowerCase(), c])), [cat.conceptos]);
  const conceptoPorId = useMemo(() => new Map(cat.conceptos.map((c) => [c.id, c])), [cat.conceptos]);

  const set = <K extends keyof PresupuestoInput>(k: K, v: PresupuestoInput[K]) => setP((prev) => ({ ...prev, [k]: v }));
  const porMedida = useMemo(() => new Set(cat.rubros.filter((r) => r.porMedida).map((r) => r.id)), [cat.rubros]);

  const conMarkupAnterior = (l: LineaInput, cambios: Partial<LineaInput>, presupuestoId: string | null) =>
    aplicarMarkupAnterior(l, cambios, presupuestoId, porMedida, referencias, hoy);
  const setLinea = (id: string, cambios: Partial<LineaInput>) =>
    setP((prev) => ({ ...prev, lineas: prev.lineas.map((l) => (l.id === id ? conMarkupAnterior(l, cambios, prev.id ?? null) : l)) }));
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

  // Líneas cuyo precio o markup difiere del que tiene hoy el concepto en Conceptos.
  const desactualizadas = p.lineas.filter((l) => {
    const c = l.concepto_id ? conceptoPorId.get(l.concepto_id) : undefined;
    return !!c && ((c.tarifa != null && c.tarifa !== l.precio_unitario) || c.markup !== l.markup_concepto);
  }).length;

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

  // Líneas "por defecto" con las que arrancó un presupuesto nuevo: se sacan si el área no las usa (Trade)
  // y vuelven si se cambia a un área que sí. Solo se sacan las que siguen sin completar (cantidad 0).
  const porDefecto = arranque.id ? [] : arranque.lineas;
  function cambiarArea(areaId: string | null) {
    const area = cat.areas.find((a) => a.id === areaId);
    const ids = new Set(porDefecto.map((l) => l.id));
    setP((prev) => {
      if (area && !area.cargaPorDefecto) {
        return { ...prev, area_id: areaId, lineas: prev.lineas.filter((l) => !ids.has(l.id) || l.cantidad !== 0) };
      }
      const faltan = porDefecto.filter((d) => !prev.lineas.some((l) => l.id === d.id));
      return { ...prev, area_id: areaId, lineas: [...faltan, ...prev.lineas] };
    });
  }

  function cambiarCliente(clienteId: string | null) {
    setP((prev) => {
      // Si la marca elegida no es del cliente nuevo, se limpia.
      const marca = prev.marca && !marcasDelCliente(cat.marcas, clienteId).includes(prev.marca) ? null : prev.marca;
      return { ...prev, cliente_id: clienteId, marca };
    });
  }

  // Secciones: rubros en el orden del presupuesto (se cambia con las flechas); al final, las líneas sin rubro.
  const rubroPorId = new Map(cat.rubros.map((r) => [r.id, r]));
  const rubrosConLineas = ordenDeRubros(p.lineas)
    .map((id) => (id ? rubroPorId.get(id) : undefined))
    .filter((r): r is (typeof cat.rubros)[number] => !!r);
  // El resumen por rubro respeta ese mismo orden.
  const rubrosOrdenados = [...rubrosConLineas, ...cat.rubros.filter((r) => !rubrosConLineas.includes(r))];
  const resumen = resumenPresupuesto(p.lineas.map(aLinea), rubrosOrdenados, params);
  // Arrastrar y soltar rubros (con sus líneas) y líneas dentro de su rubro.
  const arrastre = useArrastre((tipo, id, destino) =>
    setP((prev) => ({ ...prev, lineas: tipo === "rubro" ? arrastrarRubro(prev.lineas, id, destino) : arrastrarLinea(prev.lineas, id, destino) })),
  );
  const sinRubro = p.lineas.filter((l) => !l.rubro_id || !cat.rubros.some((r) => r.id === l.rubro_id));
  const rubrosLibres = rubrosParaArea(cat.rubros, p.area_id).filter((r) => !p.lineas.some((l) => l.rubro_id === r.id));

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

  // Se guarda en el orden en que se ve (rubros y líneas como se acomodaron con las flechas).
  const ordenarLineas = () => agruparPorRubro(p.lineas);

  const guardar = () =>
    ejecutar(
      () => guardarPresupuesto({ ...p, lineas: ordenarLineas() }),
      // Al guardar se vuelve al listado de presupuestos.
      () => router.push("/presupuestos"),
    );

  const aprobar = () =>
    ejecutar(async () => {
      const g = await guardarPresupuesto({ ...p, lineas: ordenarLineas() });
      if (!g?.ok || !p.id) return g;
      return aprobarPresupuesto(p.id);
    });

  // "Aprobado" se hace con el botón "Aprobar y congelar" (guarda antes de aprobar).
  // Estado comercial y, si está aprobado, etapa de ejecución. "Aprobado" se hace con el botón (guarda y valida).
  const comercial = estadoComercial(estado);
  const opcionesEstado = opcionesComerciales(estado).filter((e) => e !== "aprobado" || congelado);

  return (
    <div className="space-y-4">
      {congelado ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          🔒 Versión {version} aprobada · solo lectura. Para cambiarla, creá una nueva versión (los costos reales cargados se mantienen).
        </p>
      ) : (
        <p className="text-sm text-zinc-500">Elegí el rubro, después el concepto: si está en Conceptos se completan origen, proveedor, unidad, precio y markup.</p>
      )}

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
              <select className="input mt-1" value={p.area_id ?? ""} onChange={(e) => cambiarArea(e.target.value || null)} disabled={!!p.id}>
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
              arrastre={congelado ? undefined : arrastre}
              rubroId={r.id}
              lineas={p.lineas.filter((l) => l.rubro_id === r.id)}
              porMedida={!!r.porMedida}
              comparar={(l) => comparar(medidaDe(l), referencias, p.id ?? null, hoy)}
              areaId={p.area_id}
              {...{ cat, params, congelado, setLinea, quitar, cambiarConcepto }}
              onAgregar={() => agregar(lineaVacia(r.id))}
            />
          ))}
          {sinRubro.length > 0 && (
            <SeccionRubro
              titulo="⚠ Sin rubro (no se puede aprobar)"
              rubroId={null}
              lineas={sinRubro}
              comparar={(l) => comparar(medidaDe(l), referencias, p.id ?? null, hoy)}
              areaId={p.area_id}
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

        {/* Arriba (pantallas medianas): dos recuadros compactos uno al lado del otro. A la derecha (pantallas grandes): columna fija. */}
        <aside className="order-first flex h-fit flex-wrap items-start gap-3 2xl:order-none 2xl:sticky 2xl:top-4 2xl:block 2xl:space-y-3">
          <div className="card w-full space-y-1 p-3 sm:w-[360px] 2xl:w-auto">
            <h2 className="text-sm font-medium">Resumen</h2>
            {/* Lo que se le pasa al cliente: bien a la vista. */}
            <div className="mb-2 rounded-md bg-emerald-600 px-3 py-2 text-white shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-100">Precio de venta al cliente</p>
              <p className="text-2xl font-bold leading-tight tabular-nums">{pesos(resumen.venta)}</p>
              <p className="text-[11px] text-emerald-100">
                Neto, sin IVA · Con IVA ({decimal(params.ivaPct)} %): <b className="tabular-nums text-white">{pesos(conIva(resumen.venta, params.ivaPct))}</b>
              </p>
            </div>
            {/* Costo total: destacado, pero un escalón por debajo del precio de venta. */}
            <div className="mb-1 flex items-baseline justify-between gap-2 rounded-md border border-zinc-300 bg-zinc-100 px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">Costo total</span>
              <span className="text-lg font-bold tabular-nums text-zinc-900">{pesos(resumen.costo)}</span>
            </div>
            <Fila label={`Impuestos s/venta (${decimal(params.impuestosPct)} %)`} valor={pesos(resumen.impuestos)} />
            <Fila label="Contribución" valor={pesos(resumen.contribucion)} fuerte />
            <Fila
              label="Margen de contribución"
              valor={porcentaje(resumen.margenPct)}
              clase={resumen.venta > 0 && resumen.margenPct < params.margenMinimoPct ? "text-red-700" : ""}
            />
            {resumen.markupTramo != null && (
              <Fila label="Markup por tramo" valor={markupPct(resumen.markupTramo)} />
            )}
            <Fila label="Markup promedio" valor={markupPct(resumen.markupPromedio)} />

            <div className="flex flex-col gap-1.5 pt-2">
              {!congelado && <button className="btn" onClick={guardar} disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar borrador"}</button>}
              {!congelado && p.id && <button className="btn-sec" onClick={aprobar} disabled={pendiente}>Aprobar y congelar</button>}
              {!congelado && desactualizadas > 0 && (
                <button
                  className="btn-sec"
                  onClick={actualizarPrecios}
                  disabled={pendiente}
                  title="En Conceptos cambió la tarifa o el markup de estos conceptos desde que se cargaron en el presupuesto"
                >
                  Actualizar {desactualizadas === 1 ? "1 precio" : `${desactualizadas} precios`} desde Conceptos
                </button>
              )}
              {congelado && estado !== "facturado" && p.id && (
                <button className="btn-sec" onClick={() => ejecutar(() => crearNuevaVersion(p.id!))} disabled={pendiente}>Crear nueva versión</button>
              )}
              {p.id && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm">Estado
                    <select
                      className={`input mt-1 font-medium ${COLOR_ESTADO[comercial]}`}
                      value={comercial}
                      disabled={pendiente}
                      onChange={(e) => e.target.value !== comercial && ejecutar(() => cambiarEstado(p.id!, e.target.value as Estado))}
                    >
                      {opcionesEstado.map((e) => <option key={e} value={e} className="bg-white text-zinc-900">{ETIQUETA_ESTADO[e]}</option>)}
                    </select>
                  </label>
                  {congelado && (
                    <label className="text-sm">Ejecución
                      <select
                        className={`input mt-1 font-medium ${COLOR_EJECUCION[estado as (typeof ETAPAS_EJECUCION)[number]]}`}
                        value={estado}
                        disabled={pendiente}
                        onChange={(e) => ejecutar(() => cambiarEstado(p.id!, e.target.value as Estado))}
                      >
                        {ETAPAS_EJECUCION.map((e) => <option key={e} value={e} className="bg-white text-zinc-900">{ETIQUETA_EJECUCION[e]}</option>)}
                      </select>
                    </label>
                  )}
                </div>
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

          <div className="card w-full space-y-2 p-3 sm:w-[340px] 2xl:w-auto">
            <h2 className="text-sm font-medium">Resumen por rubro</h2>
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
  porMedida = false,
  comparar: compararLinea,
  areaId,
  arrastre,
}: {
  areaId: string | null;
  /** Arrastrar el rubro y sus líneas (no está en "Sin rubro" ni en una versión aprobada). */
  arrastre?: Arrastre;
  titulo: string;
  rubroId: string | null;
  lineas: LineaInput[];
  porMedida?: boolean;
  comparar: (l: LineaInput) => Comparacion;
  cat: Catalogo;
  params: Catalogo["parametros"];
  congelado: boolean;
  setLinea: (id: string, c: Partial<LineaInput>) => void;
  quitar: (id: string) => void;
  cambiarConcepto: (l: LineaInput, texto: string) => void;
  onAgregar: () => void;
}) {
  const listaId = `conceptos-${rubroId ?? "todos"}`;
  const delArea = conceptosParaArea(cat.conceptos, areaId);
  // Proveedores de este rubro primero; después los que no tienen rubro asignado.
  const provs = proveedoresParaRubro(cat.proveedores, rubroId);
  const listaProveedoresId = `proveedores-${rubroId ?? "todos"}`;
  const conceptos = rubroId ? delArea.filter((c) => c.rubro_id === rubroId) : delArea;
  const calc = lineas.map((l) => calcularLinea(aLinea(l), params));
  const costo = calc.reduce((s, r) => s + r.costo, 0);
  const venta = calc.reduce((s, r) => s + r.venta, 0);
  const rubroDnd = arrastre && rubroId ? arrastre.elemento("rubro", rubroId, "rubros") : null;
  /** Props de arrastre de una fila (solo dentro del mismo rubro). */
  const filaDnd = (id: string) => {
    if (!arrastre) return { className: "" };
    const { estado, ...resto } = arrastre.elemento("linea", id, rubroId ?? "sin-rubro");
    return { ...resto, className: estado };
  };

  return (
    <section className={`card space-y-3 ${rubroDnd?.estado ?? ""}`} {...(rubroDnd ? { draggable: rubroDnd.draggable, onDragStart: rubroDnd.onDragStart, onDragOver: rubroDnd.onDragOver, onDrop: rubroDnd.onDrop, onDragEnd: rubroDnd.onDragEnd } : {})}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-medium">
          {arrastre && rubroId && arrastre.manija("rubro", rubroId, `Arrastrá para mover el rubro ${titulo}`)}
          {titulo}
        </h2>
        <span className="text-sm text-zinc-500">
          Costo <b className="tabular-nums text-zinc-900">{pesos(costo)}</b> · Venta <b className="tabular-nums text-zinc-900">{pesos(venta)}</b>
        </span>
      </div>
      <datalist id={listaId}>{conceptos.map((c) => <option key={c.id} value={c.nombre} />)}</datalist>
      <datalist id={listaProveedoresId}>
        {[...provs.delRubro, ...provs.sinAsignar].map((x) => <option key={x} value={x} />)}
      </datalist>
      <div className="-mx-4 overflow-x-auto px-4">
        <fieldset disabled={congelado}>
          {porMedida ? (
            <TablaMedidas
              lineas={lineas}
              calc={calc}
              comparaciones={lineas.map(compararLinea)}
              params={params}
              congelado={congelado}
              listaId={listaId}
              proveedores={provs}
              filaDnd={filaDnd}
              arrastre={arrastre}
              {...{ setLinea, quitar, cambiarConcepto }}
            />
          ) : (
          <table className="w-full min-w-[1400px]">
            <thead>
              <tr>
                <th className="w-6" />
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
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => {
                const r = calc[i];
                const { className: dndClase, ...dnd } = filaDnd(l.id);
                return (
                  <tr key={l.id} {...dnd} className={`${l.cantidad === 0 ? "bg-red-50/60" : ""} ${dndClase}`}>
                    <td className="td w-12 whitespace-nowrap pr-0">
                      {!congelado && <AccionesLinea arrastre={arrastre} id={l.id} onQuitar={() => quitar(l.id)} />}
                    </td>
                    <td className="td">
                      <input className="input min-w-44" list={listaId} value={l.concepto} aria-label="Concepto" placeholder="Elegí o escribí" onChange={(e) => cambiarConcepto(l, e.target.value)} />
                    </td>
                    <td className="td"><input className="input min-w-32" value={l.observaciones ?? ""} aria-label="Observaciones" onChange={(e) => setLinea(l.id, { observaciones: e.target.value })} /></td>
                    <td className="td">
                      <select className="input min-w-28" value={l.origen} aria-label="Origen" onChange={(e) => setLinea(l.id, { origen: e.target.value as Origen })}>
                        {ORIGENES.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
                      </select>
                    </td>
                    <td className="td"><input className="input min-w-32" list={listaProveedoresId} value={l.proveedor ?? ""} aria-label="Proveedor" onChange={(e) => setLinea(l.id, { proveedor: e.target.value })} /></td>
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
                      <CampoNumero valor={l.markup} etiqueta="Markup (override)" className="input min-w-16" placeholder={decimal(params.markupTramo ?? l.markup_concepto ?? params.markupDefault)} onCambio={(v) => setLinea(l.id, { markup: v })} />
                    </td>
                    <td className="td text-right tabular-nums">{pesos(r.venta)}</td>
                    <td className={`td text-right tabular-nums ${r.venta > 0 && r.margenPct < params.margenMinimoPct ? "text-red-700" : ""}`}>{r.venta ? porcentaje(r.margenPct) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          )}
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

/** Markup como porcentaje sobre el costo: × 1,7 → "70 %". */
const markupPct = (m: number) => porcentaje(Math.round((m - 1) * 10000) / 100);

function Fila({ label, valor, fuerte, clase = "" }: { label: string; valor: string; fuerte?: boolean; clase?: string }) {
  return (
    <div className={`flex justify-between gap-2 text-[13px] ${fuerte ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className={`whitespace-nowrap tabular-nums ${clase}`}>{valor}</span>
    </div>
  );
}
