"use client";

export function BotonImprimir() {
  return (
    <button type="button" className="btn print:hidden" onClick={() => window.print()}>
      Imprimir / guardar PDF
    </button>
  );
}
