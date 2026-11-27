"use client";

import { useState, type DragEvent } from "react";

type Tipo = "rubro" | "linea";
type Item = { tipo: Tipo; id: string; grupo: string };

/**
 * Arrastrar y soltar para reordenar rubros y líneas. Solo se arrastra agarrando la manija ⠿ (así se puede
 * seguir escribiendo y seleccionando texto en los campos). Una línea solo se suelta dentro de su rubro.
 */
export function useArrastre(onSoltar: (tipo: Tipo, id: string, destino: string) => void) {
  const [agarrado, setAgarrado] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<Item | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const clave = (tipo: Tipo, id: string) => `${tipo}:${id}`;
  const fin = () => {
    setAgarrado(null);
    setArrastrando(null);
    setSobre(null);
  };
  const acepta = (tipo: Tipo, id: string, grupo: string) =>
    !!arrastrando && arrastrando.tipo === tipo && arrastrando.grupo === grupo && arrastrando.id !== id;

  /** Props para el elemento que se mueve (la sección del rubro o la fila de la línea). */
  const elemento = (tipo: Tipo, id: string, grupo: string) => ({
    draggable: agarrado === clave(tipo, id),
    onDragStart: (e: DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
      setArrastrando({ tipo, id, grupo });
    },
    onDragOver: (e: DragEvent) => {
      if (!acepta(tipo, id, grupo)) return;
      e.preventDefault();
      e.stopPropagation();
      if (sobre !== clave(tipo, id)) setSobre(clave(tipo, id));
    },
    onDrop: (e: DragEvent) => {
      if (!acepta(tipo, id, grupo)) return;
      e.preventDefault();
      e.stopPropagation();
      onSoltar(tipo, arrastrando!.id, id);
      fin();
    },
    onDragEnd: fin,
    /** Clases: el que se arrastra queda tenue y el destino se marca. */
    estado: sobre === clave(tipo, id) ? "outline outline-2 outline-sky-400" : arrastrando?.id === id ? "opacity-40" : "",
  });

  /** Manija ⠿: al apretarla se habilita el arrastre de su elemento. */
  const manija = (tipo: Tipo, id: string, titulo: string) => (
    <span
      role="button"
      tabIndex={-1}
      aria-label={titulo}
      title={titulo}
      className="cursor-grab select-none px-0.5 text-base leading-none text-zinc-400 hover:text-zinc-800 active:cursor-grabbing"
      onMouseDown={() => setAgarrado(clave(tipo, id))}
      onMouseUp={() => !arrastrando && setAgarrado(null)}
    >
      ⠿
    </span>
  );

  return { elemento, manija };
}
export type Arrastre = ReturnType<typeof useArrastre>;

/** ✕ para quitar la línea y ⠿ para arrastrarla dentro del rubro. */
export function AccionesLinea({ arrastre, id, onQuitar }: { arrastre?: Arrastre; id: string; onQuitar: () => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" className="text-zinc-400 hover:text-red-600" onClick={onQuitar} aria-label="Quitar línea" title="Quitar línea">✕</button>
      {arrastre?.manija("linea", id, "Arrastrá para mover la línea")}
    </span>
  );
}
