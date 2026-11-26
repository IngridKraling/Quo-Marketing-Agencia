const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const dec = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
export const pesos = (n: number) => ars.format(n);
export const decimal = (n: number) => dec.format(n);
/** Recibe el porcentaje ya multiplicado por 100 (ej. 23.57). */
export const porcentaje = (n: number) => `${dec.format(n)} %`;
/** Fecha de hoy (AAAA-MM-DD) en hora de Argentina, para que después de las 21 h no dé el día siguiente. */
const diaAR = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
export const hoy = () => diaAR.format(new Date());
export const haceDias = (dias: number) => new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
export const fecha = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/**
 * Lee un monto escrito a mano: "$ 30.000,50", "30000", "30.000" o "1,5".
 * Con coma, los puntos son de miles. Sin coma, un punto es de miles solo si separa grupos de 3 cifras ("30.000");
 * si no, es decimal ("30000.5"). Devuelve null si queda vacío o no es un número.
 */
export function parsearMonto(texto: string): number | null {
  let t = texto.replace(/[$\s]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
