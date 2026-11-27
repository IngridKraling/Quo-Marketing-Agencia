import { Suspense } from "react";
import { EditorPresupuesto } from "@/components/editor-presupuesto";
import { ReiniciarAlEntrar } from "@/components/reiniciar-al-entrar";
import { catalogo, referenciasMedidas } from "@/lib/servicios/datos";
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
  const [cat, referencias] = await Promise.all([catalogo(), referenciasMedidas()]);
  // Arranca vacío: al elegir el área se cargan los conceptos "por defecto" de esa área.
  return (
    <ReiniciarAlEntrar>
      <EditorPresupuesto
        cat={cat}
        estado="borrador"
        version={1}
        codigo={null}
        referencias={referencias}
        hoy={hoy()}
        inicial={{
          cliente_id: null,
          marca: null,
          titulo: "",
          area_id: null,
          responsable: null,
          fecha_elaboracion: hoy(),
          fecha_evento: null,
          notas: null,
          lineas: [],
        }}
      />
    </ReiniciarAlEntrar>
  );
}
