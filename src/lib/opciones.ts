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

/** Conceptos que se ofrecen en un área: los que no la tienen entre sus áreas ocultas. */
export const conceptosParaArea = <C extends { areas_ocultas?: string[] }>(conceptos: C[], areaId: string | null): C[] =>
  areaId ? conceptos.filter((c) => !c.areas_ocultas?.includes(areaId)) : conceptos;

export type ProveedorRubros = { nombre: string; rubroIds: string[] };

/**
 * Proveedores para una línea de un rubro: primero los asignados a ese rubro (A → Z) y después, aparte,
 * los que todavía no tienen ningún rubro asignado. Los asignados solo a otros rubros no aparecen.
 * Si así no queda ninguno, se ofrecen todos (para no dejar la lista vacía).
 */
export function proveedoresParaRubro(proveedores: ProveedorRubros[], rubroId: string | null): { delRubro: string[]; sinAsignar: string[] } {
  const nombres = (lista: ProveedorRubros[]) => lista.map((p) => p.nombre).sort(alfabetico);
  const delRubro = nombres(proveedores.filter((p) => !!rubroId && p.rubroIds.includes(rubroId)));
  const sinAsignar = nombres(proveedores.filter((p) => !p.rubroIds.length));
  if (!delRubro.length && !sinAsignar.length) return { delRubro, sinAsignar: nombres(proveedores) };
  return { delRubro, sinAsignar };
}
