-- Proyectos especiales: catálogo propio, forma de cotizar por rubro y markup general. Se puede correr más de una vez.
--   · rubros.modo = cómo se cotiza el rubro:
--       estandar  precio × cantidad × horas × días (BTL y comunes)
--       medida    base × altura, piezas y costo (Trade)
--       periodo   costo por unidad por mes × cantidad × meses (Vía pública)
--       salidas   costo por salida × salidas (Plan de medios)
--       unidad    cantidad y costo unitario o total, con comparación por proveedor (Merchandising)
--   · Markup general de Proyectos especiales: 40 % (un tramo sin tope; se edita en Configuración).

alter table public.rubros add column if not exists modo text not null default 'estandar';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rubros_modo_check') then
    alter table public.rubros add constraint rubros_modo_check check (modo in ('estandar', 'medida', 'periodo', 'salidas', 'unidad'));
  end if;
end $$;
update public.rubros set modo = 'medida' where por_medida and modo = 'estandar';

-- Rubros de Proyectos especiales
insert into public.rubros (nombre, orden, area_id, modo)
select v.nombre, v.orden, (select id from public.areas where prefijo = 'PE'), v.modo
from (values ('Vía pública', 210, 'periodo'), ('Merchandising', 230, 'unidad')) as v(nombre, orden, modo)
on conflict (nombre) do nothing;

update public.rubros
set area_id = (select id from public.areas where prefijo = 'PE'), modo = 'salidas', orden = 220
where nombre = 'Plan de medios';

-- Conceptos
update public.conceptos set nombre = 'Radio', unidad = 'Salida'
where nombre = 'Radios' and rubro_id = (select id from public.rubros where nombre = 'Plan de medios');
update public.conceptos set unidad = 'Salida'
where nombre = 'TV' and rubro_id = (select id from public.rubros where nombre = 'Plan de medios');

insert into public.conceptos (rubro_id, nombre, unidad, origen)
select r.id, v.concepto, v.unidad, 'proveedor'
from (values
  ('Vía pública', 'Cartelería vía pública', 'Mes'),
  ('Vía pública', 'Séxtuples', 'Mes'),
  ('Vía pública', 'Lunetas de colectivos', 'Mes'),
  ('Vía pública', 'Producción / impresión vía pública', 'Unidad'),
  ('Plan de medios', 'Radio', 'Salida'),
  ('Plan de medios', 'TV', 'Salida'),
  ('Merchandising', 'Remeras', 'Unidad'),
  ('Merchandising', 'Gorras', 'Unidad'),
  ('Merchandising', 'Botellas / termos', 'Unidad'),
  ('Merchandising', 'Bolsas', 'Unidad'),
  ('Merchandising', 'Lapiceras', 'Unidad'),
  ('Merchandising', 'Libretas', 'Unidad'),
  ('Merchandising', 'Tazas / vasos', 'Unidad'),
  ('Merchandising', 'Varios merchandising', 'Unidad')
) as v(rubro, concepto, unidad)
join public.rubros r on r.nombre = v.rubro
on conflict (nombre) do nothing;

-- Markup general de Proyectos especiales: 40 %.
insert into public.markup_tramos (area_id, hasta, markup)
select a.id, null, 1.4
from public.areas a
where a.prefijo = 'PE'
  and not exists (select 1 from public.markup_tramos t where t.area_id = a.id);

notify pgrst, 'reload schema';
