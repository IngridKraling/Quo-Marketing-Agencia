"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarPresupuesto, type PresupuestoInput } from "@/app/actions";
import { calcularTotales } from "@/lib/presupuesto-calc";
import { pesos } from "@/lib/formato";

type Rol = { id: string; nombre: string; costo_hora: number };
type Cliente = { id: string; nombre: string };

const ESTADOS = ["borrador", "enviado", "aprobado", "rechazado", "facturado"] as const;

export function EditorPresupuesto({ roles, clientes, inicial }: { roles: Rol[]; clientes: Cliente[]; inicial: PresupuestoInput }) {
  const [p, setP] = useState(inicial);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();

  const set = <K extends keyof PresupuestoInput>(k: K, v: PresupuestoInput[K]) => setP((prev) => ({ ...prev, [k]: v }));
  const setHora = (i: number, cambios: Partial<PresupuestoInput["horas"][number]>) =>
    set("horas", p.horas.map((h, j) => (j === i ? { ...h, ...cambios } : h)));
  const setExterno = (i: number, cambios: Partial<PresupuestoInput["externos"][number]>) =>
    set("externos", p.externos.map((h, j) => (j === i ? { ...h, ...cambios } : h)));

  const t = calcularTotales({
    horas: p.horas.map((h) => ({ horas: Number(h.horas) || 0, costoHora: Number(h.costo_hora) || 0 })),
    externos: p.externos.map((e) => ({ costo: Number(e.costo) || 0, markupPct: e.markup_pct })),
    markupHorasPct: Number(p.markup_horas_pct) || 0,
    markupExternosPct: Number(p.markup_externos_pct) || 0,
    ivaPct: Number(p.iva_pct) || 0,
  });

  function guardar() {
    startTransition(async () => {
      const r = await guardarPresupuesto(p);
      setMensaje(r ? { ok: r.ok, texto: r.mensaje } : null);
      if (r?.ok && r.id && !p.id) router.push(`/presupuestos/${r.id}`);
      else router.refresh();
    });
  }

  const bloqueado = inicial.estado === "facturado";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <fieldset disabled={bloqueado} className="space-y-6">
        <section className="card grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2 text-sm">Título
            <input className="input mt-1" value={p.titulo} onChange={(e) => set("titulo", e.target.value)} />
          </label>
          <label className="text-sm">Cliente
            <select className="input mt-1" value={p.cliente_id ?? ""} onChange={(e) => set("cliente_id", e.target.value || null)}>
              <option value="">— Elegir —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <label className="text-sm">Estado
            <select className="input mt-1" value={p.estado} onChange={(e) => set("estado", e.target.value as PresupuestoInput["estado"])}>
              {ESTADOS.filter((e) => e !== "facturado" || p.estado === "facturado").map((e) => <option key={e}>{e}</option>)}
            </select>
          </label>
          <label className="text-sm">Válido hasta
            <input type="date" className="input mt-1" value={p.valido_hasta ?? ""} onChange={(e) => set("valido_hasta", e.target.value || null)} />
          </label>
          <label className="text-sm">Job de Connecteam (para horas reales)
            <input className="input mt-1" value={p.connecteam_job_id ?? ""} onChange={(e) => set("connecteam_job_id", e.target.value || null)} />
          </label>
        </section>

        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Horas del equipo</h2>
            <label className="text-sm">Markup %{" "}
              <input type="number" className="input inline w-20" value={p.markup_horas_pct} onChange={(e) => set("markup_horas_pct", Number(e.target.value))} />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead><tr><th className="th">Tarea</th><th className="th">Rol</th><th className="th w-20">Horas</th><th className="th w-28">Costo hora</th><th className="th w-28 text-right">Costo</th><th /></tr></thead>
              <tbody>
                {p.horas.map((h, i) => (
                  <tr key={i}>
                    <td className="td"><input className="input" value={h.descripcion} onChange={(e) => setHora(i, { descripcion: e.target.value })} /></td>
                    <td className="td">
                      <select className="input" value={h.rol_id ?? ""} onChange={(e) => {
                        const rol = roles.find((r) => r.id === e.target.value);
                        setHora(i, { rol_id: rol?.id ?? null, costo_hora: rol ? Number(rol.costo_hora) : h.costo_hora });
                      }}>
                        <option value="">—</option>
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                      </select>
                    </td>
                    <td className="td"><input type="number" step="0.25" className="input" value={h.horas} onChange={(e) => setHora(i, { horas: Number(e.target.value) })} /></td>
                    <td className="td"><input type="number" className="input" value={h.costo_hora} onChange={(e) => setHora(i, { costo_hora: Number(e.target.value) })} /></td>
                    <td className="td text-right tabular-nums">{pesos((Number(h.horas) || 0) * (Number(h.costo_hora) || 0))}</td>
                    <td className="td"><button type="button" className="text-zinc-400 hover:text-red-600" onClick={() => set("horas", p.horas.filter((_, j) => j !== i))} aria-label="Quitar">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-sec" onClick={() => set("horas", [...p.horas, { descripcion: "", rol_id: null, horas: 0, costo_hora: 0 }])}>+ Agregar tarea</button>
        </section>

        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Costos externos (pauta, producción, proveedores)</h2>
            <label className="text-sm">Fee %{" "}
              <input type="number" className="input inline w-20" value={p.markup_externos_pct} onChange={(e) => set("markup_externos_pct", Number(e.target.value))} />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead><tr><th className="th">Concepto</th><th className="th w-32">Costo</th><th className="th w-28">Fee % propio</th><th /></tr></thead>
              <tbody>
                {p.externos.map((x, i) => (
                  <tr key={i}>
                    <td className="td"><input className="input" value={x.descripcion} onChange={(e) => setExterno(i, { descripcion: e.target.value })} /></td>
                    <td className="td"><input type="number" className="input" value={x.costo} onChange={(e) => setExterno(i, { costo: Number(e.target.value) })} /></td>
                    <td className="td"><input type="number" className="input" placeholder="—" value={x.markup_pct ?? ""} onChange={(e) => setExterno(i, { markup_pct: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                    <td className="td"><button type="button" className="text-zinc-400 hover:text-red-600" onClick={() => set("externos", p.externos.filter((_, j) => j !== i))} aria-label="Quitar">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-sec" onClick={() => set("externos", [...p.externos, { descripcion: "", costo: 0, markup_pct: null }])}>+ Agregar costo</button>
        </section>

        <section className="card">
          <label className="text-sm">Notas
            <textarea className="input mt-1" rows={3} value={p.notas ?? ""} onChange={(e) => set("notas", e.target.value || null)} />
          </label>
        </section>
      </fieldset>

      <aside className="card h-fit space-y-2 lg:sticky lg:top-4">
        <h2 className="font-medium">Resumen</h2>
        <Fila label={`Horas (${t.horasTotales} h)`} valor={t.precioHoras} />
        <Fila label="Externos" valor={t.precioExternos} />
        <Fila label="Subtotal neto" valor={t.subtotal} fuerte />
        <div className="flex items-center justify-between text-sm">
          <span>IVA %</span>
          <input type="number" className="input w-20" disabled={bloqueado} value={p.iva_pct} onChange={(e) => set("iva_pct", Number(e.target.value))} />
        </div>
        <Fila label="IVA" valor={t.iva} />
        <Fila label="Total" valor={t.total} fuerte />
        <hr className="border-zinc-200" />
        <Fila label="Costo interno" valor={t.costoTotal} />
        <Fila label={`Margen (${t.margenPct}%)`} valor={t.margen} />
        {!bloqueado && <button className="btn mt-2 w-full" onClick={guardar} disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</button>}
        {mensaje && <p className={`text-sm ${mensaje.ok ? "text-green-700" : "text-red-700"}`}>{mensaje.texto}</p>}
      </aside>
    </div>
  );
}

function Fila({ label, valor, fuerte }: { label: string; valor: number; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${fuerte ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{pesos(valor)}</span>
    </div>
  );
}
