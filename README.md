# Quo · Presupuestos

App web para armar presupuestos de la agencia a partir de costos reales y facturarlos en Sigma.

- **Presupuestos** = horas × costo hora por rol (+ markup) + costos externos (+ fee) + IVA. Muestra margen en vivo.
- **Sigma**: sincroniza clientes (`ExportClientes`) y envía la factura del presupuesto (`ImportFactura`).
- **Connecteam**: trae las horas fichadas (Time Clock) para comparar estimado vs. real por presupuesto.

Stack: Next.js 16 (App Router) en Vercel · Supabase (Postgres + Auth) · TypeScript · Tailwind · Vitest.

## Puesta en marcha

1. **Supabase**: crear un proyecto, y en SQL Editor correr `supabase/migrations/20261126000000_init.sql`
   (o `supabase link` + `supabase db push` con la CLI).
   En Authentication → Sign In / Providers, **desactivar los registros públicos** e invitar a los usuarios
   de la agencia desde Authentication → Users. En URL Configuration, agregar `https://<tu-dominio>/auth/callback`.
2. **Variables**: copiar `.env.example` a `.env.local` y completarlas. Las mismas van en Vercel → Settings → Environment Variables.
3. **Local**: `npm install` y `npm run dev`.
4. **Vercel**: importar el repo de GitHub. `vercel.json` programa un cron diario a `/api/cron/sync`
   (clientes de Sigma + horas de los últimos 7 días), autenticado con `CRON_SECRET`.

## Flujo

1. *Equipo y tarifas*: cargar roles con su costo hora, y los miembros con su ID de usuario de Connecteam.
2. *Clientes*: sincronizar desde Sigma y completar **tipo de IVA** (código numérico de Sigma) y **condición de venta**:
   `ExportClientes` devuelve la descripción de la condición de IVA, no el código que pide `ImportFactura`.
3. *Presupuestos*: armar tareas por rol y costos externos; opcionalmente vincular el Job de Connecteam.
4. *Facturar en Sigma*: ingresar fecha, número de comprobante y CAE (si lo hay). La app arma el cuerpo de
   `ImportFactura` validando las reglas de consistencia de Sigma antes de enviarlo, y guarda cada intento en `facturas`.

## Estructura

```
src/lib/presupuesto-calc.ts     cálculo de totales (puro, con tests)
src/lib/sigma/                  cliente HTTP (reintentos 429/503) y armado de ImportFactura
src/lib/connecteam/client.ts    time clocks y turnos
src/lib/servicios/sync.ts       sincronización Sigma → clientes, Connecteam → horas_reales
src/app/actions.ts              server actions (guardar, facturar, sincronizar)
src/app/api/cron/sync           endpoint del cron de Vercel
supabase/migrations/            esquema + RLS
```

## Pendientes conocidos

- Las rutas de Connecteam (`/time-clock/v1/...`) siguen la API Reference pública pero no se probaron contra una cuenta real.
- Facturación: un solo ítem de servicio por factura; sin notas de crédito ni percepciones todavía.
- Facturas de compra (`ImportCompras`) para registrar los costos externos: no implementado.
