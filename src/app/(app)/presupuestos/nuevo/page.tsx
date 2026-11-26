import { Suspense } from "react";
import { EditorPresupuesto } from "@/components/editor-presupuesto";
import { lineaDesdeConcepto } from "@/lib/lineas";
import { catalogo } from "@/lib/servicios/datos";
import { hoy } from "@/lib/formato";

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nuevo presupuesto</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Cargando…</p>}>
        <Nuevo />
      </Suspense>
    </div>
  );
}

async function Nuevo() {
  const cat = await catalogo();
  // Líneas por defecto (marcadas en Conceptos): vienen con cantidad 0 para completar o borrar.
  const orden = new Map(cat.rubros.map((r, i) => [r.id, i]));
  const porDefecto = cat.conceptos
    .filter((c) => c.por_defecto)
    .sort((a, b) => (orden.get(a.rubro_id) ?? 99) - (orden.get(b.rubro_id) ?? 99))
    .map((c) => lineaDesdeConcepto(c, c.cantidad_def ?? 0));
  return (
    <EditorPresupuesto
      cat={cat}
      estado="borrador"
      version={1}
      codigo={null}
      inicial={{
        cliente_id: null,
        marca: null,
        titulo: "",
        area_id: null,
        responsable: null,
        fecha_elaboracion: hoy(),
        fecha_evento: null,
        notas: null,
        lineas: porDefecto,
      }}
    />
  );
}
