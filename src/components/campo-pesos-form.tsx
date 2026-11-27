"use client";

import { useState } from "react";
import { CampoPesos } from "@/components/campo-pesos";

/** CampoPesos para formularios con server action: muestra "$ 30.000,00" y envía el número en un input oculto. */
export function CampoPesosForm({
  name,
  defaultValue,
  etiqueta,
  placeholder,
  className,
  required,
}: {
  name: string;
  defaultValue?: number | null;
  etiqueta: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const [valor, setValor] = useState<number | null>(defaultValue ?? null);
  return (
    <>
      <CampoPesos valor={valor} onCambio={setValor} etiqueta={etiqueta} placeholder={placeholder} className={className} />
      <input type="hidden" name={name} value={valor ?? ""} required={required} />
    </>
  );
}
