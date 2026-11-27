import { Suspense } from "react";
import { TablaFacturacion, type FilaFactura } from "@/components/tabla-facturacion";
import { createClient } from "@/lib/supabase/server";
import { lineaDesdeFila, paramsDeArea, resumenPresupuesto, type Estado } from "@/lib/presupuesto-calc";
import { parametros, tramos } from "@/lib/servicios/datos";

export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Facturación</h1>
        <p className="text-sm text-zinc-500">
          Cada presupuesto aprobado aparece acá solo, con su área, detalle e importe neto. Cargá el período, la OC, el número de factura y si se
          envió y se pagó: con FC N° pasa a <b>Facturado</b>. Si el cliente manda la OC en partes, usá <b>Dividir</b>.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
        <Listado />
      </Suspense>
    </div>
  );
}

async function Listado() {
  const supabase = await createClient();
  const [{ data, error }, params, listaTramos] = await Promise.all([
    supabase
      .from("presupuesto_facturas")
      .select(
        "*, presupuestos!inner(id, codigo, titulo, marca, estado, area_id, clientes(nombre), areas(nombre), presupuesto_lineas(*))",
      )
      .order("orden"),
    parametros(),
    tramos(),
  ]);
  if (error) return <p className="text-red-700">{error.message}</p>;
  if (!data?.length) return <p className="card text-sm text-zinc-500">Todavía no hay presupuestos aprobados.</p>;

  // Venta total de cada presupuesto, para avisar si las partes no suman lo mismo.
  const ventas = new Map<string, number>();
  const filas: FilaFactura[] = data.map((f) => {
    const p = f.presupuestos as unknown as {
      id: string;
      codigo: string | null;
      titulo: string;
      marca: string | null;
      estado: Estado;
      area_id: string | null;
      clientes: { nombre: string } | null;
      areas: { nombre: string } | null;
      presupuesto_lineas: Parameters<typeof lineaDesdeFila>[0][];
    };
    if (!ventas.has(p.id)) {
      ventas.set(p.id, resumenPresupuesto(p.presupuesto_lineas.map(lineaDesdeFila), [], paramsDeArea(params, listaTramos, p.area_id)).venta);
    }
    return {
      id: f.id,
      orden: f.orden,
      presupuestoId: p.id,
      codigo: p.codigo,
      cliente: p.clientes?.nombre ?? null,
      marca: p.marca,
      titulo: p.titulo,
      area: p.areas?.nombre ?? null,
      ventaPresupuesto: ventas.get(p.id)!,
      importe: Number(f.importe_neto),
      periodo: f.periodo ? String(f.periodo).slice(0, 7) : "",
      oc: f.oc_numero ?? "",
      fc: f.fc_numero ?? "",
      fcEnviada: f.fc_enviada,
      pagada: f.pagada,
      comentarios: f.comentarios ?? "",
    };
  });
  return <TablaFacturacion filas={filas} />;
}
