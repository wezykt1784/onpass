-- Changing only a recipe's photo doesn't count as an edit, so an open editor
-- doesn't report a false "someone else saved" conflict.
create or replace function spec.recipes_touch() returns trigger
language plpgsql set search_path = spec, public as $$
begin
  if (to_jsonb(new) - 'photo_path' - 'updated_at') = (to_jsonb(old) - 'photo_path' - 'updated_at') then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end $$;

drop trigger if exists recipes_updated_at on spec.recipes;
create trigger recipes_updated_at before update on spec.recipes
  for each row execute function spec.recipes_touch();
revoke execute on function spec.recipes_touch() from public, anon;
