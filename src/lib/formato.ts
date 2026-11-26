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
