"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { aprobarPresupuesto, cambiarEstado } from "@/app/actions";
import {
  COLOR_EJECUCION,
  COLOR_ESTADO,
  ESTADOS_COMERCIALES,
  ETAPAS_EJECUCION,
  ETIQUETA_EJECUCION,
  ETIQUETA_ESTADO,
  estaCongelado,
  estadoComercial,
  opcionesComerciales,
  type Estado,
} from "@/lib/presupuesto-calc";
import { fecha, pesos, porcentaje } from "@/lib/formato";
import { alfabetico } from "@/lib/opciones";

export type FilaPresupuesto = {
  id: string;
  codigo: string | null;
  titulo: string;
  cliente: string | null;
  marca: string | null;
  responsable: string | null;
  area: string | null;
  estado: Estado;
  version: number;
  fechaElaboracion: string | null;
  fechaEvento: string | null;
  costo: number;
  venta: number;
  margenPct: number | null;
  costoReal: number | null;
  /** Según Facturación: null si no está aprobado. */
  facturacion: "pendiente" | "parcial" | "facturado" | null;
};


type Columna =
  | "codigo" | "cliente" | "titulo" | "responsable" | "area" | "fechaElaboracion" | "fechaEvento"
  | "estado" | "ejecucion" | "costo" | "venta" | "margenPct" | "costoReal";

const COLUMNAS: { col: Columna; titulo: string; numero?: boolean }[] = [
  { col: "codigo", titulo: "ID" },
  { col: "cliente", titulo: "Cliente / marca" },
  { col: "titulo", titulo: "Proyecto" },
  { col: "responsable", titulo: "Responsable" },
  { col: "area", titulo: "Área" },
  { col: "fechaElaboracion", titulo: "Elaboración" },
  { col: "fechaEvento", titulo: "Evento" },
  { col: "estado", titulo: "Estado" },
  { col: "ejecucion", titulo: "Ejecución" },
  { col: "costo", titulo: "Costo", numero: true },
  { col: "venta", titulo: "Venta", numero: true },
  { col: "margenPct", titulo: "Margen", numero: true },
  { col: "costoReal", titulo: "Costo real", numero: true },
];

/** Valor con el que se ordena cada columna (null = sin dato, va siempre al final). */
function valorOrden(f: FilaPresupuesto, col: Columna): string | number | null {
  switch (col) {
    case "estado": return ESTADOS_COMERCIALES.indexOf(estadoComercial(f.estado));
    case "ejecucion": return estaCongelado(f.estado) ? ETAPAS_EJECUCION.indexOf(f.estado as (typeof ETAPAS_EJECUCION)[number]) : null;
    default: return f[col];
  }
}

const FILTROS_VACIOS = {
  texto: "",
  cliente: "",
  marca: "",
  area: "",
  estado: "",
  ejecucion: "",
  responsable: "",
  elaboracionDesde: "",
  elaboracionHasta: "",
  eventoDesde: "",
  eventoHasta: "",
};
type Filtros = typeof FILTROS_VACIOS;

const unicos = (valores: (string | null)[]) => [...new Set(valores.filter((v): v is string => !!v))].sort(alfabetico);
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const enRango = (valor: string | null, desde: string, hasta: string) =>
  (!desde && !hasta) || (!!valor && (!desde || valor >= desde) && (!hasta || valor <= hasta));

export function TablaPresupuestos({ filas }: { filas: FilaPresupuesto[] }) {
  const router = useRouter();
  const [f, setF] = useState<Filtros>(FILTROS_VACIOS);
  // Estado cambiado desde la lista: se muestra al instante mientras se guarda.
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, startTransition] = useTransition();

  function cambiar(p: FilaPresupuesto, nuevo: Estado) {
    const anterior = estados[p.id] ?? p.estado;
    setEstados((e) => ({ ...e, [p.id]: nuevo }));
    startTransition(async () => {
      // Aprobar uno sin aprobar valida y congela (igual que el botón del editor).
      const r = nuevo === "aprobado" && !estaCongelado(anterior) ? await aprobarPresupuesto(p.id) : await cambiarEstado(p.id, nuevo);
      if (r?.ok) {
        setAviso({ ok: true, texto: `${p.codigo ?? p.titulo}: ${ETIQUETA_ESTADO[nuevo]}` });
        router.refresh();
      } else {
        setEstados((e) => ({ ...e, [p.id]: anterior }));
        setAviso({ ok: false, texto: `${p.codigo ?? p.titulo}: ${r?.mensaje ?? "no se pudo cambiar el estado"}` });
      }
    });
  }
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean } | null>(null);
  const set = (k: keyof Filtros, v: string) => setF((prev) => ({ ...prev, [k]: v, ...(k === "cliente" ? { marca: "" } : {}) }));

  // Opciones de cada desplegable: lo que aparece en los presupuestos, A → Z (OTROS al final).
  const opciones = useMemo(
    () => ({
      cliente: unicos(filas.map((x) => x.cliente)),
      marca: unicos(filas.filter((x) => !f.cliente || x.cliente === f.cliente).map((x) => x.marca)),
      area: unicos(filas.map((x) => x.area)),
      responsable: unicos(filas.map((x) => x.responsable)),
      estado: ESTADOS_COMERCIALES.filter((e) => filas.some((x) => estadoComercial(x.estado) === e)),
      ejecucion: ETAPAS_EJECUCION.filter((e) => filas.some((x) => x.estado === e)),
    }),
    [filas, f.cliente],
  );

  const visibles = useMemo(() => {
    const texto = normalizar(f.texto.trim());
    const filtradas = filas.filter(
      (x) =>
        (!texto || normalizar([x.codigo, x.titulo, x.cliente, x.marca].filter(Boolean).join(" ")).includes(texto)) &&
        (!f.cliente || x.cliente === f.cliente) &&
        (!f.marca || x.marca === f.marca) &&
        (!f.area || x.area === f.area) &&
        (!f.estado || estadoComercial(x.estado) === f.estado) &&
        (!f.ejecucion || x.estado === f.ejecucion) &&
        (!f.responsable || x.responsable === f.responsable) &&
        enRango(x.fechaElaboracion, f.elaboracionDesde, f.elaboracionHasta) &&
        enRango(x.fechaEvento, f.eventoDesde, f.eventoHasta),
    );
    if (!orden) return filtradas;
    return [...filtradas].sort((a, b) => {
      const va = valorOrden(a, orden.col);
      const vb = valorOrden(b, orden.col);
      if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1;
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : // Cliente y después marca, cada uno A → Z con OTROS al final.
            alfabetico(String(va), String(vb)) || (orden.col === "cliente" ? alfabetico(a.marca ?? "", b.marca ?? "") : 0);
      return orden.asc ? c : -c;
    });
  }, [filas, f, orden]);

  const hayFiltros = Object.values(f).some(Boolean);
  const totalCosto = visibles.reduce((s, x) => s + x.costo, 0);
  const totalVenta = visibles.reduce((s, x) => s + x.venta, 0);

  // Primer clic: montos y fechas de mayor a menor, textos de A a Z. Segundo clic: al revés.
  function ordenarPor(col: Columna, numero?: boolean) {
    const deMayorAMenor = numero || col.startsWith("fecha");
    setOrden((prev) => (prev?.col === col ? { col, asc: !prev.asc } : { col, asc: !deMayorAMenor }));
  }

  // Funciones (no componentes) para que los inputs no se vuelvan a montar y pierdan el foco al escribir.
  const desplegable = (k: keyof Filtros, etiqueta: string, valores: readonly string[], mostrar = (v: string) => v) => (
    <label key={k} className="text-xs text-zinc-500">
      {etiqueta}
      <select className="input mt-1 block w-44" value={f[k]} onChange={(e) => set(k, e.target.value)}>
        <option value="">Todos</option>
        {valores.map((v) => <option key={v} value={v}>{mostrar(v)}</option>)}
      </select>
    </label>
  );

  const rango = (etiqueta: string, desde: keyof Filtros, hasta: keyof Filtros) => (
    <div key={desde} className="text-xs text-zinc-500">
      {etiqueta}
      <div className="mt-1 flex items-center gap-1">
        <input type="date" className="input w-36" aria-label={`${etiqueta} desde`} value={f[desde]} onChange={(e) => set(desde, e.target.value)} />
        <span>a</span>
        <input type="date" className="input w-36" aria-label={`${etiqueta} hasta`} value={f[hasta]} onChange={(e) => set(hasta, e.target.value)} />
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-3">
        <label className="text-xs text-zinc-500">
          Buscar
          <input className="input mt-1 block w-56" placeholder="ID, proyecto, cliente o marca" value={f.texto} onChange={(e) => set("texto", e.target.value)} />
        </label>
        {desplegable("cliente", "Cliente", opciones.cliente)}
        {desplegable("marca", "Marca", opciones.marca)}
        {desplegable("area", "Área", opciones.area)}
        {desplegable("estado", "Estado", opciones.estado, (e) => ETIQUETA_ESTADO[e as Estado])}
        {desplegable("ejecucion", "Ejecución", opciones.ejecucion, (e) => ETIQUETA_EJECUCION[e as (typeof ETAPAS_EJECUCION)[number]])}
        {desplegable("responsable", "Responsable", opciones.responsable)}
        {rango("Elaboración", "elaboracionDesde", "elaboracionHasta")}
        {rango("Evento", "eventoDesde", "eventoHasta")}
        {hayFiltros && <button type="button" className="btn-sec" onClick={() => setF(FILTROS_VACIOS)}>Limpiar filtros</button>}
      </div>

      {aviso && (
        <p className={`rounded-md px-3 py-2 text-sm ${aviso.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`} role="status">
          {aviso.texto}
        </p>
      )}
      <p className="text-sm text-zinc-500">
        {visibles.length === filas.length ? `${filas.length} presupuestos` : `${visibles.length} de ${filas.length} presupuestos`}
        {" · "}Clic en el título de una columna para ordenar.
      </p>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[1250px]">
          <thead>
            <tr>
              {COLUMNAS.map(({ col, titulo, numero }) => (
                <th key={col} className={`th ${numero ? "text-right" : ""}`} aria-sort={orden?.col === col ? (orden.asc ? "ascending" : "descending") : undefined}>
                  <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-zinc-900" onClick={() => ordenarPor(col, numero)}>
                    {titulo}
                    <span className={orden?.col === col ? "text-zinc-900" : "text-zinc-300"}>{orden?.col === col ? (orden.asc ? "▲" : "▼") : "↕"}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-zinc-50" onClick={() => router.push(`/presupuestos/${p.id}`)}>
                <td className="td whitespace-nowrap font-mono text-xs"><Link className="hover:underline" href={`/presupuestos/${p.id}`}>{p.codigo}</Link></td>
                <td className="td">{p.cliente ?? "—"}{p.marca && <span className="text-zinc-500"> · {p.marca}</span>}</td>
                <td className="td font-medium">{p.titulo}</td>
                <td className="td">{p.responsable ?? "—"}</td>
                <td className="td">{p.area ?? "—"}</td>
                <td className="td whitespace-nowrap">{fecha(p.fechaElaboracion)}</td>
                <td className="td whitespace-nowrap">{fecha(p.fechaEvento)}</td>
                {(() => {
                  const actual = estados[p.id] ?? p.estado;
                  const comercial = estadoComercial(actual);
                  const aprobado = estaCongelado(actual);
                  const clase = "cursor-pointer rounded-md border px-2 py-1 text-xs font-medium";
                  return (
                    <>
                      <td className="td whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <select
                          className={`${clase} ${COLOR_ESTADO[comercial]}`}
                          value={comercial}
                          disabled={guardando}
                          aria-label={`Estado de ${p.codigo ?? p.titulo}`}
                          onChange={(e) => e.target.value !== comercial && cambiar(p, e.target.value as Estado)}
                        >
                          {opcionesComerciales(actual).map((e) => <option key={e} value={e} className="bg-white text-zinc-900">{ETIQUETA_ESTADO[e]}</option>)}
                        </select>
                        {p.version > 1 && <span className="ml-1 text-xs text-zinc-500">v{p.version}</span>}
                      </td>
                      <td className="td whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {aprobado ? (
                          <select
                            className={`${clase} ${COLOR_EJECUCION[actual as (typeof ETAPAS_EJECUCION)[number]]}`}
                            value={actual}
                            disabled={guardando}
                            aria-label={`Ejecución de ${p.codigo ?? p.titulo}`}
                            onChange={(e) => cambiar(p, e.target.value as Estado)}
                          >
                            {ETAPAS_EJECUCION.map((e) => <option key={e} value={e} className="bg-white text-zinc-900">{ETIQUETA_EJECUCION[e]}</option>)}
                          </select>
                        ) : null}
                        {p.facturacion && p.facturacion !== "facturado" && (
                          <Link
                            href="/facturacion"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 block w-fit rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:underline"
                          >
                            {p.facturacion === "parcial" ? "Facturado en parte" : "Pendiente de facturar"}
                          </Link>
                        )}
                        {!aprobado && <span className="text-xs text-zinc-400" title="Se completa cuando el presupuesto está aprobado">—</span>}
                      </td>
                    </>
                  );
                })()}
                <td className="td text-right tabular-nums">{pesos(p.costo)}</td>
                <td className="td text-right tabular-nums">{pesos(p.venta)}</td>
                <td className="td text-right tabular-nums">{p.margenPct == null ? "—" : porcentaje(p.margenPct)}</td>
                <td className="td text-right tabular-nums">
                  {p.costoReal != null ? (
                    <Link className="hover:underline" href={`/presupuestos/${p.id}/costos`} onClick={(e) => e.stopPropagation()}>{pesos(p.costoReal)}</Link>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!visibles.length && (
              <tr><td colSpan={COLUMNAS.length} className="td py-6 text-center text-sm text-zinc-500">Ningún presupuesto coincide con los filtros.</td></tr>
            )}
          </tbody>
          {visibles.length > 1 && (
            <tfoot>
              <tr className="border-t border-zinc-200 font-semibold">
                <td className="td" colSpan={9}>Total de lo que se ve</td>
                <td className="td text-right tabular-nums">{pesos(totalCosto)}</td>
                <td className="td text-right tabular-nums">{pesos(totalVenta)}</td>
                <td className="td" colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
