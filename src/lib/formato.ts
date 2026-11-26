const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
export const pesos = (n: number) => ars.format(n);
export const hoy = () => new Date().toISOString().slice(0, 10);
export const haceDias = (dias: number) => new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
