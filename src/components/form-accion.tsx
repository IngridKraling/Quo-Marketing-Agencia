"use client";

import { useActionState, type ReactNode } from "react";
import type { Resultado } from "@/app/actions";

/** Form que ejecuta una server action y muestra el mensaje resultante. */
export function FormAccion({
  action,
  children,
  className,
  boton,
}: {
  action: (prev: Resultado, form: FormData) => Promise<Resultado>;
  children?: ReactNode;
  className?: string;
  boton: string;
}) {
  const [estado, formAction, pendiente] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pendiente}>
          {pendiente ? "Procesando…" : boton}
        </button>
        {estado && (
          <span className={`text-sm ${estado.ok ? "text-green-700" : "text-red-700"}`}>{estado.mensaje}</span>
        )}
      </div>
    </form>
  );
}
