"use client";

import { useState } from "react";
import { parsearMonto, pesos } from "@/lib/formato";

/** Input de monto: se ve como "$ 30.000,00" y, al editarlo, admite "30000", "30.000" o "30.000,50". Vacío = null. */
export function CampoPesos({
  valor,
  onCambio,
  etiqueta,
  placeholder,
  className = "input",
}: {
  valor: number | null;
  onCambio: (v: number | null) => void;
  etiqueta: string;
  placeholder?: string;
  className?: string;
}) {
  // Mientras se edita se muestra lo que la persona escribe; al salir, el monto formateado.
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <input
      type="text"
      inputMode="decimal"
      className={`${className} text-right tabular-nums`}
      aria-label={etiqueta}
      placeholder={placeholder}
      value={texto ?? (valor == null ? "" : pesos(valor))}
      onFocus={() => setTexto(valor == null ? "" : pesos(valor))}
      onChange={(e) => {
        setTexto(e.target.value);
        onCambio(parsearMonto(e.target.value));
      }}
      onBlur={() => setTexto(null)}
    />
  );
}
