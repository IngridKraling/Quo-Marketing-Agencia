-- Líneas por medida (Trade): base × altura, piezas y cotización total del proveedor.
--   · costo de la línea = cotización total (no precio × cantidad).
--   · m² = base × altura × piezas;  $/m² = cotización / m²;  $/pieza = cotización / piezas.
--   · markup_aplicado: el markup con el que quedó la línea al guardar (línea › tramo › concepto › general),
--     para comparar con presupuestos anteriores.
--   · markup_ref_presupuesto_id: si el markup se tomó de un presupuesto enviado antes (mismo concepto,
--     proveedor, medidas y costo), de cuál.

-- Áreas que NO cargan las líneas "por defecto" (supervisor, ayudantes…) al crear un presupuesto: Trade.
alter table public.areas add column carga_por_defecto boolean not null default true;
update public.areas set carga_por_defecto = false where prefijo = 'TM';

alter table public.rubros add column por_medida boolean not null default false;

update public.rubros
set por_medida = true
where area_id = (select id from public.areas where prefijo = 'TM');

alter table public.presupuesto_lineas
  add column base numeric(10,3) check (base > 0),
  add column altura numeric(10,3) check (altura > 0),
  add column cotizacion_total numeric(14,2) check (cotizacion_total >= 0),
  add column markup_aplicado numeric(6,3),
  add column markup_ref_presupuesto_id uuid references public.presupuestos(id) on delete set null;

create index on public.presupuesto_lineas (concepto_id) where cotizacion_total is not null;
