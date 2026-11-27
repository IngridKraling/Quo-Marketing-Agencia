-- Conceptos "por defecto" por área: cada concepto dice en qué áreas se carga solo al crear un presupuesto.
-- Reemplaza a conceptos.por_defecto (global) + areas.carga_por_defecto. Se puede correr más de una vez.
-- Para no cambiar nada de golpe: lo que hoy está "por defecto" queda así en las áreas que cargaban defaults
-- (BTL, Proyectos especiales, Otros); Trade queda sin defaults.

alter table public.conceptos add column if not exists por_defecto_areas uuid[] not null default '{}';

-- (por_defecto pasa a false al migrarlo, así correrlo de nuevo no vuelve a cargar lo que se destildó.)
update public.conceptos c
set por_defecto_areas = (
      select coalesce(array_agg(a.id order by a.orden), '{}')
      from public.areas a
      where a.carga_por_defecto
    ),
    por_defecto = false
where c.por_defecto;

notify pgrst, 'reload schema';
