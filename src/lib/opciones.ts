/** Reglas de los desplegables (sin dependencias de servidor: las usa también el editor en el navegador). */

export type Marca = { cliente_id: string; nombre: string };

/** Opción genérica que va siempre al final de los desplegables de cliente y marca. */
export const OTROS = "OTROS";
const esOtros = (s: string) => s.trim().toUpperCase() === OTROS;

/** Orden alfabético A → Z en español (ignora mayúsculas y acentos), con "OTROS" siempre al final. */
export const alfabetico = (a: string, b: string) =>
  Number(esOtros(a)) - Number(esOtros(b)) || a.localeCompare(b, "es", { sensitivity: "base" });

/** Marcas de un cliente para el desplegable: las cargadas (A → Z) y "OTROS" siempre como última opción. */
export function opcionesMarca(marcas: Marca[], clienteId: string | null): string[] {
  return [...marcas.filter((m) => m.cliente_id === clienteId && !esOtros(m.nombre)).map((m) => m.nombre).sort(alfabetico), OTROS];
}

/**
 * Rubros que se ofrecen en un presupuesto según su área: los del área más los comunes (sin área).
 * Si el área todavía no tiene rubros propios (Proyectos especiales, Otros), se ofrecen todos.
 */
export function rubrosParaArea<R extends { areaId?: string | null }>(rubros: R[], areaId: string | null): R[] {
  if (!areaId || !rubros.some((r) => r.areaId === areaId)) return rubros;
  return rubros.filter((r) => !r.areaId || r.areaId === areaId);
}
