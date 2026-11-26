"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ESTADOS, ETIQUETA_ESTADO, type Estado } from "@/lib/presupuesto-calc";
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
};

const COLOR: Partial<Record<Estado, string>> = {
  aprobado: "bg-green-100 text-green-800",
  en_ejecucion: "bg-blue-100 text-blue-800",
  finalizado: "bg-indigo-100 text-indigo-800",
  facturado: "bg-zinc-800 text-white",
  rechazado: "bg-red-100 text-red-800",
  cancelado: "bg-red-100 text-red-800",
};

type Columna =
  | "codigo" | "cliente" | "titulo" | "responsable" | "area" | "fechaElaboracion" | "fechaEvento"
  | "estado" | "costo" | "venta" | "margenPct" | "costoReal";

const COLUMNAS: { col: Columna; titulo: string; numero?: boolean }[] = [
  { col: "codigo", titulo: "ID" },
  { col: "cliente", titulo: "Cliente / marca" },
  { col: "titulo", titulo: "Proyecto" },
  { col: "responsable", titulo: "Responsable" },
  { col: "area", titulo: "Área" },
  { col: "fechaElaboracion", titulo: "Elaboración" },
  { col: "fechaEvento", titulo: "Evento" },
  { col: "estado", titulo: "Estado" },
  { col: "costo", titulo: "Costo", numero: true },
  { col: "venta", titulo: "Venta", numero: true },
  { col: "margenPct", titulo: "Margen", numero: true },
  { col: "costoReal", titulo: "Costo real", numero: true },
];

/** Valor con el que se ordena cada columna (null = sin dato, va siempre al final). */
function valorOrden(f: FilaPresupuesto, col: Columna): string | number | null {
  switch (col) {
    case "estado": return ESTADOS.indexOf(f.estado);
    default: return f[col];
  }
}

const FILTROS_VACIOS = {
  texto: "",
  cliente: "",
  marca: "",
  area: "",
  estado: "",
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
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean } | null>(null);
  const set = (k: keyof Filtros, v: string) => setF((prev) => ({ ...prev, [k]: v, ...(k === "cliente" ? { marca: "" } : {}) }));

  // Opciones de cada desplegable: lo que aparece en los presupuestos, A → Z (OTROS al final).
  const opciones = useMemo(
    () => ({
      cliente: unicos(filas.map((x) => x.cliente)),
      marca: unicos(filas.filter((x) => !f.cliente || x.cliente === f.cliente).map((x) => x.marca)),
      area: unicos(filas.map((x) => x.area)),
      responsable: unicos(filas.map((x) => x.responsable)),
      estado: ESTADOS.filter((e) => filas.some((x) => x.estado === e)),
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
        (!f.estado || x.estado === f.estado) &&
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
        {desplegable("responsable", "Responsable", opciones.responsable)}
        {rango("Elaboración", "elaboracionDesde", "elaboracionHasta")}
        {rango("Evento", "eventoDesde", "eventoHasta")}
        {hayFiltros && <button type="button" className="btn-sec" onClick={() => setF(FILTROS_VACIOS)}>Limpiar filtros</button>}
      </div>

      <p className="text-sm text-zinc-500">
        {visibles.length === filas.length ? `${filas.length} presupuestos` : `${visibles.length} de ${filas.length} presupuestos`}
        {" · "}Clic en el título de una columna para ordenar.
      </p>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[1150px]">
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
                <td className="td whitespace-nowrap">
                  <span className={`rounded px-2 py-0.5 text-xs ${COLOR[p.estado] ?? "bg-zinc-100"}`}>{ETIQUETA_ESTADO[p.estado]}</span>
                  {p.version > 1 && <span className="ml-1 text-xs text-zinc-500">v{p.version}</span>}
                </td>
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
                <td className="td" colSpan={8}>Total de lo que se ve</td>
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
