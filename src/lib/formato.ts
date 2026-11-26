const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const dec = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
export const pesos = (n: number) => ars.format(n);
export const decimal = (n: number) => dec.format(n);
/** Recibe el porcentaje ya multiplicado por 100 (ej. 23.57). */
export const porcentaje = (n: number) => `${dec.format(n)} %`;
export const hoy = () => new Date().toISOString().slice(0, 10);
export const haceDias = (dias: number) => new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
export const fecha = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
