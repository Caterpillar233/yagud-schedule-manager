create or replace function public.prevent_empty_current_week_overwrite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  week_start date := date_trunc('week', current_date)::date;
  week_end date := (date_trunc('week', current_date)::date + interval '6 days')::date;
  old_slots integer;
  new_slots integer;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  select count(*)
  into old_slots
  from jsonb_each(old.payload->'schedAll') room_obj(room, room_payload),
       jsonb_each_text(room_payload) e(key, value)
  where split_part(key, '_', 1)::date between week_start and week_end;

  select count(*)
  into new_slots
  from jsonb_each(new.payload->'schedAll') room_obj(room, room_payload),
       jsonb_each_text(room_payload) e(key, value)
  where split_part(key, '_', 1)::date between week_start and week_end;

  if old_slots >= 50 and new_slots = 0 then
    raise exception 'Refusing to overwrite current-week schedule with empty data. Reload latest schedule first.';
  end if;

  return new;
end;
$$;

drop trigger if exists schedules_prevent_empty_current_week_overwrite on public.schedules;
create trigger schedules_prevent_empty_current_week_overwrite
before update on public.schedules
for each row execute function public.prevent_empty_current_week_overwrite();
