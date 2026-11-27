-- Ajustes del catálogo por área. Se puede correr más de una vez.
--   · Conceptos que se ocultan en ciertas áreas aunque su rubro sea común: lo de promotoras no va en Trade.
--   · El rubro Otros pasa a ser solo de BTL.
--   · Plan de medios pasa a Proyectos especiales.

alter table public.conceptos add column if not exists areas_ocultas uuid[] not null default '{}';

update public.conceptos c
set areas_ocultas = array_append(c.areas_ocultas, a.id)
from public.areas a
where a.prefijo = 'TM'
  and c.nombre in ('Promotoras', 'Traslado de promotoras', 'Viaticos promotoras', 'Hospedaje promotoras')
  and not (a.id = any (c.areas_ocultas));

update public.rubros r set area_id = a.id
from public.areas a
where a.prefijo = 'BTL' and r.nombre = 'Otros';

update public.rubros r set area_id = a.id
from public.areas a
where a.prefijo = 'PE' and r.nombre = 'Plan de medios';
