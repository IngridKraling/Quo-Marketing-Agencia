import { Suspense } from "react";
import { EditorPresupuesto } from "@/components/editor-presupuesto";
import { rolesYClientes } from "@/lib/servicios/datos";

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
  const { roles, clientes } = await rolesYClientes();
  return (
    <EditorPresupuesto
      roles={roles}
      clientes={clientes}
      inicial={{
        cliente_id: null,
        titulo: "",
        estado: "borrador",
        markup_horas_pct: 40,
        markup_externos_pct: 10,
        iva_pct: 21,
        valido_hasta: null,
        notas: null,
        connecteam_job_id: null,
        horas: [{ descripcion: "", rol_id: null, horas: 0, costo_hora: 0 }],
        externos: [],
      }}
    />
  );
}
