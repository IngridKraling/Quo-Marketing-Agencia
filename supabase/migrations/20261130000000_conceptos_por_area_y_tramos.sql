-- Conceptos por área y markup por tramo.
--   · Cada rubro puede pertenecer a un área (BTL, Trade…). Sin área = común a todas
--     (Personal, Logística y flete, Viaticos, Otros).
--   · Un presupuesto ve los rubros de su área más los comunes. Las áreas que todavía no tienen
--     rubros propios (Proyectos especiales, Otros) siguen viendo todo el catálogo.
--   · Catálogo de Trade (CATALOGO_MAESTRO_TRADE.xlsx): todo a cotizar, proveedor externo.
--   · Markup por tramo: en las áreas que tienen tramos (Trade), el markup de cada línea sale del
--     costo total del presupuesto. "Hasta" incluye el monto; el último tramo no tiene tope.
--     El markup cargado a mano en una línea sigue mandando.

-- ---------- Rubros por área ----------
alter table public.rubros add column area_id uuid references public.areas(id) on delete set null;

update public.rubros
set area_id = (select id from public.areas where prefijo = 'BTL')
where nombre in ('Estructuras y stand', 'Tecnica', 'Ambientación', 'Grafica', 'Juegos', 'Plan de medios');

-- Concepto libre de Otros: se elige y se escribe encima el nombre real.
update public.conceptos
set nombre = 'OTROS', unidad = 'Unidad', observaciones = 'Elegilo y escribí encima el concepto; poné el markup a mano'
where nombre = 'Otros' and rubro_id = (select id from public.rubros where nombre = 'Otros');

-- ---------- Catálogo de Trade ----------
insert into public.rubros (nombre, orden, area_id)
select v.nombre, v.orden, (select id from public.areas where prefijo = 'TM')
from (values
  ('Carteles', 110),
  ('Salientes', 120),
  ('Cenefas', 130),
  ('Lonas', 140),
  ('Pizarras', 150),
  ('Vinilos', 160),
  ('Pintura de Fachada', 170),
  ('Toldos', 180)
) as v(nombre, orden)
on conflict (nombre) do nothing;

insert into public.conceptos (rubro_id, nombre, unidad, origen)
select r.id, v.concepto, 'Unidad', 'proveedor'
from (values
  ('Carteles', 'Cartel de chapa'),
  ('Carteles', 'Cartel de chapa retroiluminado'),
  ('Carteles', 'Cartel de chapa calada'),
  ('Carteles', 'Cartel polyfan a 1 linea'),
  ('Carteles', 'Cartel polyfan a 2 lineas'),
  ('Carteles', 'Cartel polyfan retroiluminado a 1 linea'),
  ('Carteles', 'Cartel polyfan retroiluminado a 2 lineas'),
  ('Salientes', 'Saliente circular'),
  ('Salientes', 'Saliente triangular'),
  ('Salientes', 'Saliente cuadrado'),
  ('Cenefas', 'Cenefa con iluminacion interior (LED)'),
  ('Cenefas', 'Cenefa de lona'),
  ('Lonas', 'Lona mesh'),
  ('Lonas', 'Bastidor con lona'),
  ('Lonas', 'Cambio de lona'),
  ('Pizarras', 'Pizarra de pared'),
  ('Pizarras', 'Pizarra de pie'),
  ('Pizarras', 'Ploteo de pizarras'),
  ('Vinilos', 'Vinilo alto transito'),
  ('Vinilos', 'Vinilo microperforado'),
  ('Vinilos', 'Vinilo pleno'),
  ('Vinilos', 'Vinilo de corte'),
  ('Vinilos', 'Vinilo esmerilado'),
  ('Vinilos', 'Ploteos varios'),
  ('Pintura de Fachada', 'Pintura'),
  ('Pintura de Fachada', 'Materiales'),
  ('Pintura de Fachada', 'Pintor'),
  ('Pintura de Fachada', 'Letrista'),
  ('Pintura de Fachada', 'Varios'),
  ('Toldos', 'Toldo')
) as v(rubro, concepto)
join public.rubros r on r.nombre = v.rubro
on conflict (nombre) do nothing;

-- ---------- Markup por tramo ----------
create table public.markup_tramos (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas(id) on delete cascade,
  hasta numeric(14,2) check (hasta > 0),   -- costo total hasta este monto (incluido); vacío = sin tope
  markup numeric(6,3) not null check (markup > 0),
  unique (area_id, hasta)
);
-- Un solo tramo "sin tope" por área.
create unique index markup_tramos_sin_tope on public.markup_tramos (area_id) where hasta is null;

alter table public.markup_tramos enable row level security;
create policy "autenticados" on public.markup_tramos for all to authenticated using (true) with check (true);

insert into public.markup_tramos (area_id, hasta, markup)
select (select id from public.areas where prefijo = 'TM'), v.hasta, v.markup
from (values
  (1000000::numeric, 1.7),
  (2000000::numeric, 1.6),
  (3500000::numeric, 1.55),
  (null::numeric, 1.5)
) as v(hasta, markup)
on conflict do nothing;
