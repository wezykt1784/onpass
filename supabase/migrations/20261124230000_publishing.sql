-- Milestone 2: publishing to brands and sites.

-- A scheduled go-live counts as going live, so it is blocked by unconfirmed allergens too.
create or replace function spec.publications_block_unknown() returns trigger
language plpgsql set search_path = spec, public as $$
begin
  if (new.stage = 'live' or new.live_from is not null) and new.snapshot_id is not null and exists (
    select 1 from menu_snapshots s where s.id = new.snapshot_id and s.has_unknown_allergens
  ) then
    raise exception 'This menu has dishes with unconfirmed allergen data, so it can''t go live yet.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Recipe editors save frozen copies of menus when they stage or publish them.
create policy snapshots_insert on spec.menu_snapshots for insert to authenticated
  with check (spec.can_edit_recipes(org_id));

-- Guest-safe read of a site's live menus. A staging row whose go-live time has passed counts as live.
create or replace function spec.public_site(p_org text, p_site text) returns jsonb
language sql stable security definer set search_path = spec, public as $$
  with o as (select * from organisations where slug = p_org),
  s as (select * from sites where slug = p_site and enabled and org_id = (select id from o)),
  b as (select * from brands where id = (select brand_id from s) and enabled),
  out as (select * from outputs where brand_id = (select id from b) and kind = 'guest_web' and enabled order by created_at limit 1),
  live as (
    select distinct on (p.menu_id) p.*, ms.body
    from publications p join menu_snapshots ms on ms.id = p.snapshot_id
    where p.output_id = (select id from out)
      and (p.stage = 'live' or (p.live_from is not null and p.live_from <= now()))
    order by p.menu_id, coalesce(p.live_from, p.updated_at) desc
  )
  select case when not exists (select 1 from b) then null else jsonb_build_object(
    'org', (select jsonb_build_object('id', id, 'name', name, 'slug', slug, 'calorieStatement', calorie_statement, 'disclaimer', disclaimer) from o),
    'brand', (select jsonb_build_object('id', id, 'name', name, 'slug', slug, 'logoPath', logo_path, 'enabled', enabled, 'updatedAt', updated_at) from b),
    'guest', coalesce((select settings from out), '{}'),
    'site', (select jsonb_build_object('id', id, 'brandId', brand_id, 'name', name, 'slug', slug, 'address', address, 'enabled', enabled) from s),
    'pubs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'menuId', menu_id, 'stage', stage, 'liveFrom', live_from, 'sort', sort,
              'autoRefresh', auto_refresh, 'updatedAt', updated_at, 'body', body) order by sort) from live), '[]'),
    'allergens', (select jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name, 'parentId', a.parent_id, 'sort', a.sort) order by a.sort)
                  from allergens a where a.org_id is null or a.org_id = (select id from o)),
    'diets', (select jsonb_agg(jsonb_build_object('id', d.id, 'code', d.code, 'name', d.name, 'short', d.short, 'sort', d.sort) order by d.sort)
              from diets d where d.org_id is null or d.org_id = (select id from o))
  ) end
$$;
revoke execute on function spec.public_site(text, text) from public;
grant execute on function spec.public_site(text, text) to anon, authenticated, service_role;
