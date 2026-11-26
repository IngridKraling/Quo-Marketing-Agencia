@AGENTS.md

# Convenciones del proyecto

- Idioma del dominio y la UI: español (rioplatense). Código: nombres en español para el dominio.
- Next.js 16 con `cacheComponents`: todo acceso a cookies/params/datos va dentro de `<Suspense>`.
- Middleware se llama `src/proxy.ts`.
- Sigma: ver doc en `https://sigma.sig2k.com/quomkt@sigma/api/v10/help?format=md`. `ImportFactura` devuelve 500 en
  errores de validación; las reglas de consistencia están replicadas en `src/lib/sigma/factura.ts`.
- Cambios de esquema: nueva migración en `supabase/migrations/`, nunca editar una ya aplicada.
- Antes de un PR: `npm run lint && npm run typecheck && npm test && npm run build`.
