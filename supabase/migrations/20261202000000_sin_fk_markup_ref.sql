-- markup_ref_presupuesto_id era una segunda FK de presupuesto_lineas a presupuestos y PostgREST no podía
-- elegir cuál usar al embeber "presupuesto_lineas(*)" ("more than one relationship was found").
-- La columna queda como referencia simple (si el presupuesto se borra, el aviso simplemente no aparece).
do $$
declare c text;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.presupuesto_lineas'::regclass
      and con.contype = 'f'
      and att.attname = 'markup_ref_presupuesto_id'
  loop
    execute format('alter table public.presupuesto_lineas drop constraint %I', c);
  end loop;
end $$;

notify pgrst, 'reload schema';
