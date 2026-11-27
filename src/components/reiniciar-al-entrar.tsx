"use client";

import { Fragment, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Con cacheComponents, Next.js conserva el estado de las páginas que se dejan (las oculta con <Activity>).
 * Esto hace que el contenido arranque de cero cada vez que se entra con un link o router.push
 * (ej. "Nuevo presupuesto" no trae lo del anterior), y lo conserva solo con atrás/adelante del navegador.
 */
export function ReiniciarAlEntrar({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter();
  return <Fragment key={bfcacheId}>{children}</Fragment>;
}
