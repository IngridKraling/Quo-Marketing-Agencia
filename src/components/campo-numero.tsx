"use client";

/** Input numérico que admite quedar vacío (null). */
export function CampoNumero({
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
  return (
    <input
      type="number"
      min="0"
      step="any"
      inputMode="decimal"
      className={className}
      aria-label={etiqueta}
      placeholder={placeholder}
      value={valor ?? ""}
      onChange={(e) => onCambio(e.target.value === "" ? null : Number(e.target.value))}
    />
  );
}
