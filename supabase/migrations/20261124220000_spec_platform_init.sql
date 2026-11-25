-- Onpass platform, first migration.
-- Lives in its own schema "spec" so it never touches the existing public tables
-- (recipes, photos, finance hub) in this project. Nothing here alters auth.* or public.*.

create schema if not exists spec;
grant usage on schema spec to anon, authenticated, service_role;
set search_path = spec, public, extensions;

-- Schema for Onpass (spec book + guest allergens)
-- Postgres on Supabase. Access by row level security (RLS) on every table.
-- Times are timestamptz (UTC). Money is integer pence + currency.
-- Run as the first migration: supabase/migrations/0001_init.sql


-- ---------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql set search_path = spec, public as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------
-- Tenancy: organisations, brands, sites, people
-- ---------------------------------------------------------------

create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  logo_path text,
  currency char(3) not null default 'GBP',
  calorie_statement text,              -- e.g. the daily intake line shown under menus
  disclaimer text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Brand = a trading brand. parent_brand_id makes it a "menu group".
create table brands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  parent_brand_id uuid references brands(id) on delete restrict,
  name text not null,
  slug text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  logo_path text,
  default_price_band_id uuid,          -- fk added after price_bands exists
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);
create index on brands (org_id);
create index on brands (parent_brand_id);

-- Site = one pub or hotel, with its own guest address and QR code.
create table sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete restrict,
  name text not null,
  slug text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  address text,
  price_band_id uuid,                  -- overrides the brand default; fk added later
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);
create index on sites (org_id);
create index on sites (brand_id);

-- Profile row for each Supabase auth user.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Roles:
--   org_admin      everything in the org, users, settings
--   central_chef   create and edit all recipes, menus, publishing
--   head_chef      create and edit recipes; menus and publishing for their brands only
--   viewer         read the digital cookbook for their brands (site chefs)
-- brand_id null = whole organisation.
create table memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  role text not null check (role in ('org_admin','central_chef','head_chef','viewer')),
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index memberships_one_per_scope
  on memberships (org_id, user_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index on memberships (user_id);
create index on memberships (brand_id);

-- ---------------------------------------------------------------
-- Access helper functions used by RLS (security definer so they can read memberships)
-- ---------------------------------------------------------------

create or replace function org_role(p_org uuid) returns text
language sql stable security definer set search_path = spec, public as $$
  select case
    when bool_or(role = 'org_admin') then 'org_admin'
    when bool_or(role = 'central_chef') then 'central_chef'
    when bool_or(role = 'head_chef') then 'head_chef'
    when bool_or(role = 'viewer') then 'viewer'
  end
  from memberships
  where org_id = p_org and user_id = auth.uid() and status = 'active'
$$;

create or replace function is_member(p_org uuid) returns boolean
language sql stable set search_path = spec, public as $$ select org_role(p_org) is not null $$;

create or replace function can_edit_recipes(p_org uuid) returns boolean
language sql stable set search_path = spec, public as $$ select org_role(p_org) in ('org_admin','central_chef','head_chef') $$;

create or replace function is_central(p_org uuid) returns boolean
language sql stable set search_path = spec, public as $$ select org_role(p_org) in ('org_admin','central_chef') $$;

create or replace function is_admin(p_org uuid) returns boolean
language sql stable set search_path = spec, public as $$ select org_role(p_org) = 'org_admin' $$;

-- Head chefs may run menus and publishing for brands they are a member of.
create or replace function can_manage_brand(p_brand uuid) returns boolean
language sql stable security definer set search_path = spec, public as $$
  select exists (
    select 1 from brands b
    join memberships m on m.org_id = b.org_id and m.user_id = auth.uid() and m.status = 'active'
    where b.id = p_brand
      and (m.role in ('org_admin','central_chef')
           or (m.role = 'head_chef' and m.brand_id in (b.id, b.parent_brand_id)))
  )
$$;

-- ---------------------------------------------------------------
-- Reference lists: allergens, diets, nutrients, categories, price bands
-- ---------------------------------------------------------------

-- org_id null = built-in (the 14 UK allergens and their sub-types). Orgs can add their own (e.g. Garlic / Onion Products).
create table allergens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  parent_id uuid references allergens(id) on delete restrict,
  code text not null,                  -- 'gluten', 'gluten.wheat', 'nuts.almond'
  name text not null,
  is_statutory boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index allergens_code on allergens (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), code);
create index on allergens (parent_id);

create table diets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  code text not null,                  -- 'vegan', 'vegetarian', 'plant_based', 'gluten_free'
  name text not null,
  short text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index diets_code on diets (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

create table categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  parent_id uuid references categories(id) on delete cascade,
  name text not null,
  colour text,
  icon text,
  show_to_guests boolean not null default false,  -- simplified "category profile"
  show_in_cookbook boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on categories (org_id);
create index on categories (parent_id);

create table price_bands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table brands add constraint brands_price_band_fk
  foreign key (default_price_band_id) references price_bands(id) on delete restrict;
alter table sites add constraint sites_price_band_fk
  foreign key (price_band_id) references price_bands(id) on delete restrict;
create index on brands (default_price_band_id);
create index on sites (price_band_id);

-- ---------------------------------------------------------------
-- Suppliers and products (ingredients)
-- ---------------------------------------------------------------

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete restrict,
  name text not null,                  -- 'HERB CORIANDER 100G'
  supplier_code text,                  -- 'HERCOR-ea'
  base_unit text not null check (base_unit in ('g','ml','ea')),
  each_weight_g numeric(10,3),         -- needed to turn 'ea' into grams for nutrition
  density_g_per_ml numeric(6,3) default 1,
  pack_size numeric(12,3),             -- in base units
  pack_cost_pence int check (pack_cost_pence >= 0),
  currency char(3) not null default 'GBP',
  allergen_status text not null default 'unknown'
    check (allergen_status in ('complete','unknown')),
  nutrition_per_100 jsonb not null default '{}',  -- {"kcal":..,"fat_g":..} per 100 g or ml
  zonal_ref text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index products_supplier_code on products (org_id, supplier_id, supplier_code) where supplier_code is not null;
create unique index products_zonal_ref on products (org_id, zonal_ref) where zonal_ref is not null;
create index on products (supplier_id);
create index on products (org_id, name);

create table product_allergens (
  product_id uuid not null references products(id) on delete cascade,
  allergen_id uuid not null references allergens(id) on delete restrict,
  level text not null check (level in ('contains','may_contain')),
  primary key (product_id, allergen_id)
);
create index on product_allergens (allergen_id);

-- A row means the product IS suitable for that diet.
create table product_diets (
  product_id uuid not null references products(id) on delete cascade,
  diet_id uuid not null references diets(id) on delete restrict,
  primary key (product_id, diet_id)
);
create index on product_diets (diet_id);

-- ---------------------------------------------------------------
-- Recipes: dishes and batch (sub) recipes
-- ---------------------------------------------------------------

create table recipes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  kind text not null check (kind in ('dish','batch')),
  name text not null,
  code text,                           -- '429396'
  description text,                    -- guest-facing line under the dish name
  price_pence int check (price_pence >= 0),  -- default sell price; price bands override later
  photo_path text,
  yield_qty numeric(12,3),             -- batch weight, e.g. 900
  yield_unit text check (yield_unit in ('g','ml','ea')),
  portions numeric(8,2) default 1,     -- dishes: 1 portion
  method jsonb not null default '[]',  -- [{"text":"..","steps":[..]}] nested steps
  skill_rating text check (skill_rating in ('green','amber','red')),
  time_rating text check (time_rating in ('green','amber','red')),
  status text not null default 'draft' check (status in ('draft','approved','archived')),
  zonal_ref text,
  created_by uuid references profiles(id) on delete set null,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint batch_has_yield check (kind = 'dish' or (yield_qty > 0 and yield_unit is not null))
);
create unique index recipes_code on recipes (org_id, code) where code is not null;
create unique index recipes_zonal_ref on recipes (org_id, zonal_ref) where zonal_ref is not null;
create index on recipes (org_id, kind, name);
create index on recipes (org_id, status);
create index on recipes (created_by);
create index on recipes (updated_by);

create table recipe_lines (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  sort int not null,
  product_id uuid references products(id) on delete restrict,
  sub_recipe_id uuid references recipes(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  unit text not null check (unit in ('g','kg','ml','l','ea')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint one_source check ((product_id is null) <> (sub_recipe_id is null)),
  constraint not_self check (sub_recipe_id is distinct from recipe_id)
);
create index on recipe_lines (recipe_id, sort);
create index on recipe_lines (product_id);
create index on recipe_lines (sub_recipe_id);

-- Block loops: A uses B uses A.
create or replace function recipe_lines_no_cycle() returns trigger
language plpgsql set search_path = spec, public as $$
begin
  if new.sub_recipe_id is null then return new; end if;
  if exists (
    with recursive down(id) as (
      select new.sub_recipe_id
      union
      select rl.sub_recipe_id from recipe_lines rl join down on rl.recipe_id = down.id
      where rl.sub_recipe_id is not null
    ) select 1 from down where id = new.recipe_id
  ) then
    raise exception 'Recipe loop: this batch recipe already uses the recipe you are adding it to';
  end if;
  return new;
end $$;
create trigger recipe_lines_no_cycle before insert or update on recipe_lines
  for each row execute function recipe_lines_no_cycle();

-- Chef can add a may-contain or contains at dish level (shared fryer etc).
create table recipe_allergen_overrides (
  recipe_id uuid not null references recipes(id) on delete cascade,
  allergen_id uuid not null references allergens(id) on delete restrict,
  level text not null check (level in ('contains','may_contain')),
  reason text not null,
  primary key (recipe_id, allergen_id)
);
create index on recipe_allergen_overrides (allergen_id);

create table recipe_categories (
  recipe_id uuid not null references recipes(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  primary key (recipe_id, category_id)
);
create index on recipe_categories (category_id);

create table recipe_prices (
  recipe_id uuid not null references recipes(id) on delete cascade,
  price_band_id uuid not null references price_bands(id) on delete cascade,
  price_pence int not null check (price_pence >= 0),
  currency char(3) not null default 'GBP',
  primary key (recipe_id, price_band_id)
);
create index on recipe_prices (price_band_id);

-- Roll-up cache, rebuilt by refresh_rollup() whenever a recipe, its lines,
-- a product or a product's allergens change. Guest pages and PDFs read only this.
create table recipe_rollups (
  recipe_id uuid primary key references recipes(id) on delete cascade,
  contains uuid[] not null default '{}',
  may_contain uuid[] not null default '{}',
  unknown_products uuid[] not null default '{}',  -- products with allergen_status = 'unknown'
  diets uuid[] not null default '{}',             -- suitable for all of these
  nutrition_per_portion jsonb not null default '{}',
  nutrition_complete boolean not null default false,
  cost_per_portion_pence int,
  computed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- Menus
-- ---------------------------------------------------------------

create table menus (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,                  -- internal
  display_name text,                   -- guest-facing
  code text,
  description text,
  sub_heading_1 text,
  sub_heading_2 text,
  menu_date date,                      -- printed on the spec book cover
  set_price_pence int check (set_price_pence >= 0),
  currency char(3) not null default 'GBP',
  kind text not null default 'standard'
    check (kind in ('standard','template_fixed','template_flexible')),
  template_id uuid references menus(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index menus_code on menus (org_id, code) where code is not null;
create index on menus (org_id, updated_at desc);
create index on menus (template_id);
create index on menus (created_by);

create table menu_brands (
  menu_id uuid not null references menus(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  primary key (menu_id, brand_id)
);
create index on menu_brands (brand_id);

create table menu_rows (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references menus(id) on delete cascade,
  parent_row_id uuid references menu_rows(id) on delete cascade,  -- items sit under a section
  sort int not null,
  kind text not null check (kind in ('section','info','byo','item','user_selection')),
  title text,                          -- section name, info text, or display name override
  description text,
  recipe_id uuid references recipes(id) on delete restrict,
  locked boolean not null default false,  -- template rows sites cannot change
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint item_has_recipe check (kind <> 'item' or recipe_id is not null)
);
create index on menu_rows (menu_id, parent_row_id, sort);
create index on menu_rows (recipe_id);
create index on menu_rows (parent_row_id);

create table menu_row_prices (
  menu_row_id uuid not null references menu_rows(id) on delete cascade,
  price_band_id uuid not null references price_bands(id) on delete cascade,
  price_pence int not null check (price_pence >= 0),
  currency char(3) not null default 'GBP',
  primary key (menu_row_id, price_band_id)
);
create index on menu_row_prices (price_band_id);

-- 250 item cap keeps PDFs and guest pages sane.
create or replace function menu_rows_cap() returns trigger
language plpgsql set search_path = spec, public as $$
begin
  if new.kind = 'item' and (select count(*) from menu_rows where menu_id = new.menu_id and kind = 'item') >= 250 then
    raise exception 'A menu can hold at most 250 dishes';
  end if;
  return new;
end $$;
create trigger menu_rows_cap before insert on menu_rows
  for each row execute function menu_rows_cap();

-- ---------------------------------------------------------------
-- Publishing
-- ---------------------------------------------------------------

create table outputs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  kind text not null check (kind in ('guest_web','allergen_tablet','digital_cookbook')),
  name text not null,
  path_code text not null check (path_code ~ '^[a-z0-9-]{1,40}$'),  -- URL part
  settings jsonb not null default '{}',  -- header, footer, disclaimer, shown allergens/diets/nutrients, show_kcal
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, path_code)
);
create index on outputs (org_id);

create table publications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  output_id uuid not null references outputs(id) on delete cascade,
  menu_id uuid not null references menus(id) on delete restrict,  -- unpublish before deleting a menu
  stage text not null check (stage in ('staging','live')),
  sort int not null default 0,
  price_band_id uuid references price_bands(id) on delete restrict,
  auto_refresh boolean not null default true,  -- false = recipe changes wait for sign-off
  live_from timestamptz,                       -- scheduled go-live for a staging row
  snapshot_id uuid,                            -- fk below
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (output_id, menu_id, stage)
);
create index on publications (menu_id);
create index on publications (price_band_id);
create index on publications (created_by);
create index on publications (live_from) where live_from is not null and stage = 'staging';

-- Frozen JSON of a menu as guests and chefs see it: rows, dishes, roll-ups, prices.
-- Public pages read only snapshots, never live tables.
create table menu_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  menu_id uuid not null references menus(id) on delete cascade,
  price_band_id uuid references price_bands(id) on delete set null,
  body jsonb not null,
  has_unknown_allergens boolean not null,
  created_at timestamptz not null default now()
);
create index on menu_snapshots (menu_id, created_at desc);
create index on menu_snapshots (org_id);
create index on menu_snapshots (price_band_id);

alter table publications add constraint publications_snapshot_fk
  foreign key (snapshot_id) references menu_snapshots(id) on delete set null;
create index on publications (snapshot_id);

-- A live dish must have complete allergen data.
create or replace function publications_block_unknown() returns trigger
language plpgsql set search_path = spec, public as $$
begin
  if new.stage = 'live' and new.snapshot_id is not null and exists (
    select 1 from menu_snapshots s where s.id = new.snapshot_id and s.has_unknown_allergens
  ) then
    raise exception 'This menu has dishes with unknown allergen data and cannot go live';
  end if;
  return new;
end $$;
create trigger publications_block_unknown before insert or update on publications
  for each row execute function publications_block_unknown();

-- ---------------------------------------------------------------
-- Spec book (PDF cookbook)
-- ---------------------------------------------------------------

create table cookbook_styles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  settings jsonb not null default '{}',  -- header_colour, logo_path, font, margins_mm, show_cover,
                                        -- sub_recipes ('after_dish'|'appendix'), show_cost, show_page_numbers, values[]
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
create unique index cookbook_styles_one_default on cookbook_styles (org_id) where is_default;

create table cookbook_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  menu_id uuid not null references menus(id) on delete cascade,
  style_id uuid references cookbook_styles(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  page_count int,
  file_path text,
  error text,
  requested_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on cookbook_runs (menu_id, created_at desc);
create index on cookbook_runs (org_id, status);
create index on cookbook_runs (style_id);
create index on cookbook_runs (requested_by);

-- ---------------------------------------------------------------
-- Zonal import and audit
-- ---------------------------------------------------------------

create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  source text not null default 'zonal_csv' check (source in ('zonal_csv','generic_csv')),
  file_path text not null,
  column_map jsonb not null default '{}',
  status text not null default 'uploaded'
    check (status in ('uploaded','previewed','applying','done','failed')),
  counts jsonb not null default '{}',   -- {"new":..,"changed":..,"unchanged":..,"errors":..}
  errors jsonb not null default '[]',
  file_sha256 text not null,            -- same file twice is a no-op
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, file_sha256)
);
create index on import_jobs (org_id, created_at desc);
create index on import_jobs (created_by);

create table audit_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references organisations(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  action text not null,                 -- 'recipe.updated', 'menu.published', 'import.applied'
  entity text not null,
  entity_id uuid,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index on audit_events (org_id, at desc);
create index on audit_events (entity, entity_id);
create index on audit_events (user_id);

-- ---------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['organisations','brands','sites','profiles','memberships','allergens','diets',
    'categories','price_bands','suppliers','products','recipes','recipe_lines','menus','menu_rows',
    'outputs','publications','cookbook_styles','cookbook_runs','import_jobs']
  loop
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------

alter table organisations enable row level security;
alter table brands enable row level security;
alter table sites enable row level security;
alter table profiles enable row level security;
alter table memberships enable row level security;
alter table allergens enable row level security;
alter table diets enable row level security;
alter table categories enable row level security;
alter table price_bands enable row level security;
alter table suppliers enable row level security;
alter table products enable row level security;
alter table product_allergens enable row level security;
alter table product_diets enable row level security;
alter table recipes enable row level security;
alter table recipe_lines enable row level security;
alter table recipe_allergen_overrides enable row level security;
alter table recipe_categories enable row level security;
alter table recipe_prices enable row level security;
alter table recipe_rollups enable row level security;
alter table menus enable row level security;
alter table menu_brands enable row level security;
alter table menu_rows enable row level security;
alter table menu_row_prices enable row level security;
alter table outputs enable row level security;
alter table publications enable row level security;
alter table menu_snapshots enable row level security;
alter table cookbook_styles enable row level security;
alter table cookbook_runs enable row level security;
alter table import_jobs enable row level security;
alter table audit_events enable row level security;

-- Organisation-level tables
create policy org_read on organisations for select using (is_member(id));
create policy org_admin_write on organisations for update using (is_admin(id)) with check (is_admin(id));

create policy brands_read on brands for select using (is_member(org_id));
create policy brands_write on brands for all using (is_admin(org_id)) with check (is_admin(org_id));
create policy sites_read on sites for select using (is_member(org_id));
create policy sites_write on sites for all using (is_admin(org_id)) with check (is_admin(org_id));

create policy profiles_self on profiles for select using (
  id = auth.uid() or exists (
    select 1 from memberships m where m.user_id = profiles.id and is_admin(m.org_id)));
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy memberships_read on memberships for select using (user_id = auth.uid() or is_admin(org_id));
create policy memberships_write on memberships for all using (is_admin(org_id)) with check (is_admin(org_id));

-- Reference lists: built-in rows (org_id null) readable by any signed-in user
create policy allergens_read on allergens for select using (org_id is null or is_member(org_id));
create policy allergens_write on allergens for all using (org_id is not null and is_central(org_id))
  with check (org_id is not null and is_central(org_id));
create policy diets_read on diets for select using (org_id is null or is_member(org_id));
create policy diets_write on diets for all using (org_id is not null and is_central(org_id))
  with check (org_id is not null and is_central(org_id));
create policy categories_read on categories for select using (is_member(org_id));
create policy categories_write on categories for all using (is_central(org_id)) with check (is_central(org_id));
create policy price_bands_read on price_bands for select using (is_member(org_id));
create policy price_bands_write on price_bands for all using (is_central(org_id)) with check (is_central(org_id));

-- Suppliers, products: chefs who edit recipes can add products
create policy suppliers_read on suppliers for select using (is_member(org_id));
create policy suppliers_write on suppliers for all using (can_edit_recipes(org_id)) with check (can_edit_recipes(org_id));
create policy products_read on products for select using (is_member(org_id));
create policy products_write on products for all using (can_edit_recipes(org_id)) with check (can_edit_recipes(org_id));
create policy product_allergens_rw on product_allergens for all
  using (exists (select 1 from products p where p.id = product_id and is_member(p.org_id)))
  with check (exists (select 1 from products p where p.id = product_id and can_edit_recipes(p.org_id)));
create policy product_diets_rw on product_diets for all
  using (exists (select 1 from products p where p.id = product_id and is_member(p.org_id)))
  with check (exists (select 1 from products p where p.id = product_id and can_edit_recipes(p.org_id)));

-- Recipes. No deletes from the app: recipes are archived (status = 'archived').
create policy recipes_read on recipes for select using (is_member(org_id));
create policy recipes_insert on recipes for insert with check (can_edit_recipes(org_id));
create policy recipes_update on recipes for update using (can_edit_recipes(org_id)) with check (can_edit_recipes(org_id));

create policy recipe_lines_rw on recipe_lines for all
  using (exists (select 1 from recipes r where r.id = recipe_id and is_member(r.org_id)))
  with check (exists (select 1 from recipes r where r.id = recipe_id and can_edit_recipes(r.org_id)));
create policy recipe_overrides_rw on recipe_allergen_overrides for all
  using (exists (select 1 from recipes r where r.id = recipe_id and is_member(r.org_id)))
  with check (exists (select 1 from recipes r where r.id = recipe_id and can_edit_recipes(r.org_id)));
create policy recipe_categories_rw on recipe_categories for all
  using (exists (select 1 from recipes r where r.id = recipe_id and is_member(r.org_id)))
  with check (exists (select 1 from recipes r where r.id = recipe_id and can_edit_recipes(r.org_id)));
create policy recipe_prices_read on recipe_prices for select
  using (exists (select 1 from recipes r where r.id = recipe_id and is_member(r.org_id)));
create policy recipe_prices_write on recipe_prices for all
  using (exists (select 1 from recipes r where r.id = recipe_id and is_central(r.org_id)))
  with check (exists (select 1 from recipes r where r.id = recipe_id and is_central(r.org_id)));
-- Roll-ups are written only by the server (service role); members read them
create policy recipe_rollups_read on recipe_rollups for select
  using (exists (select 1 from recipes r where r.id = recipe_id and is_member(r.org_id)));

-- Menus: central chefs everywhere, head chefs on menus linked to their brands
create policy menus_read on menus for select using (is_member(org_id));
create policy menus_insert on menus for insert with check (can_edit_recipes(org_id));
create policy menus_update on menus for update using (
  is_central(org_id) or exists (select 1 from menu_brands mb where mb.menu_id = id and can_manage_brand(mb.brand_id))
) with check (can_edit_recipes(org_id));
create policy menus_delete on menus for delete using (is_central(org_id));

create policy menu_brands_read on menu_brands for select
  using (exists (select 1 from menus m where m.id = menu_id and is_member(m.org_id)));
create policy menu_brands_write on menu_brands for all
  using (can_manage_brand(brand_id)) with check (can_manage_brand(brand_id));

create policy menu_rows_read on menu_rows for select
  using (exists (select 1 from menus m where m.id = menu_id and is_member(m.org_id)));
create policy menu_rows_write on menu_rows for all
  using (exists (select 1 from menus m where m.id = menu_id and (is_central(m.org_id)
    or exists (select 1 from menu_brands mb where mb.menu_id = m.id and can_manage_brand(mb.brand_id)))))
  with check (exists (select 1 from menus m where m.id = menu_id and (is_central(m.org_id)
    or exists (select 1 from menu_brands mb where mb.menu_id = m.id and can_manage_brand(mb.brand_id)))));
create policy menu_row_prices_rw on menu_row_prices for all
  using (exists (select 1 from menu_rows r join menus m on m.id = r.menu_id where r.id = menu_row_id and is_member(m.org_id)))
  with check (exists (select 1 from menu_rows r join menus m on m.id = r.menu_id where r.id = menu_row_id and is_central(m.org_id)));

-- Publishing
create policy outputs_read on outputs for select using (is_member(org_id));
create policy outputs_write on outputs for all using (is_admin(org_id)) with check (is_admin(org_id));
create policy publications_read on publications for select using (is_member(org_id));
create policy publications_write on publications for all
  using (exists (select 1 from outputs o where o.id = output_id and can_manage_brand(o.brand_id)))
  with check (exists (select 1 from outputs o where o.id = output_id and can_manage_brand(o.brand_id)));
-- Snapshots are written by the server only. Guests never query tables: they get JSON from a public route.
create policy snapshots_read on menu_snapshots for select using (is_member(org_id));

-- Spec book
create policy cookbook_styles_read on cookbook_styles for select using (is_member(org_id));
create policy cookbook_styles_write on cookbook_styles for all using (is_central(org_id)) with check (is_central(org_id));
create policy cookbook_runs_read on cookbook_runs for select using (is_member(org_id));
create policy cookbook_runs_insert on cookbook_runs for insert with check (can_edit_recipes(org_id));

-- Import and audit
create policy import_jobs_rw on import_jobs for all using (is_central(org_id)) with check (is_central(org_id));
create policy audit_read on audit_events for select using (is_central(org_id));

-- ---------------------------------------------------------------
-- Seed: UK statutory allergens (FIR 2014 Annex II) with sub-types, and common diets
-- ---------------------------------------------------------------

insert into allergens (code, name, is_statutory, sort) values
  ('gluten','Cereals containing gluten',true,1),
  ('crustaceans','Crustaceans',true,2),
  ('eggs','Eggs',true,3),
  ('fish','Fish',true,4),
  ('peanuts','Peanuts',true,5),
  ('soya','Soya',true,6),
  ('milk','Milk',true,7),
  ('nuts','Tree nuts',true,8),
  ('celery','Celery',true,9),
  ('mustard','Mustard',true,10),
  ('sesame','Sesame seeds',true,11),
  ('sulphites','Sulphur dioxide / sulphites',true,12),
  ('lupin','Lupin',true,13),
  ('molluscs','Molluscs',true,14);

insert into allergens (code, name, is_statutory, sort, parent_id)
select v.code, v.name, true, v.sort, p.id
from (values
  ('gluten.wheat','Wheat','gluten',1),('gluten.rye','Rye','gluten',2),('gluten.barley','Barley','gluten',3),
  ('gluten.oats','Oats','gluten',4),('gluten.spelt','Spelt','gluten',5),('gluten.kamut','Kamut','gluten',6),
  ('nuts.almond','Almonds','nuts',1),('nuts.hazelnut','Hazelnuts','nuts',2),('nuts.walnut','Walnuts','nuts',3),
  ('nuts.cashew','Cashews','nuts',4),('nuts.pecan','Pecans','nuts',5),('nuts.brazil','Brazil nuts','nuts',6),
  ('nuts.pistachio','Pistachios','nuts',7),('nuts.macadamia','Macadamia nuts','nuts',8)
) as v(code, name, parent_code, sort)
join allergens p on p.code = v.parent_code and p.org_id is null;

insert into diets (code, name, short, sort) values
  ('vegan','Vegan','VG',1),('plant_based','Plant based','PB',2),('vegetarian','Vegetarian','V',3),('gluten_free','Gluten free','GF',4);

-- ---------------------------------------------------------------
-- Allergen, diet, nutrition and cost roll-up
-- One recipe's figures come from every product reachable through its lines,
-- however deep the batch recipes nest. Kept in recipe_rollups by triggers.
-- ---------------------------------------------------------------

-- Convert a line quantity into the product's base unit (g, ml or ea). Null = cannot convert.
create or replace function to_base(p_qty numeric, p_unit text, p_base text,
                                   p_each_g numeric, p_density numeric) returns numeric
language sql immutable set search_path = spec, public as $$
  select case p_base
    when 'g' then case p_unit when 'g' then p_qty when 'kg' then p_qty * 1000
                              when 'ml' then p_qty * coalesce(p_density,1) when 'l' then p_qty * 1000 * coalesce(p_density,1)
                              when 'ea' then p_qty * p_each_g end
    when 'ml' then case p_unit when 'ml' then p_qty when 'l' then p_qty * 1000
                               when 'g' then p_qty / nullif(coalesce(p_density,1),0) when 'kg' then p_qty * 1000 / nullif(coalesce(p_density,1),0) end
    when 'ea' then case p_unit when 'ea' then p_qty end
  end
$$;

-- Convert a line quantity into a sub-recipe's yield unit.
create or replace function to_yield(p_qty numeric, p_unit text, p_yield_unit text) returns numeric
language sql immutable set search_path = spec, public as $$
  select case
    when p_yield_unit = 'g'  and p_unit = 'g'  then p_qty
    when p_yield_unit = 'g'  and p_unit = 'kg' then p_qty * 1000
    when p_yield_unit = 'ml' and p_unit = 'ml' then p_qty
    when p_yield_unit = 'ml' and p_unit = 'l'  then p_qty * 1000
    when p_yield_unit = 'g'  and p_unit in ('ml','l') then (case p_unit when 'ml' then p_qty else p_qty*1000 end)  -- treat as density 1
    when p_yield_unit = 'ml' and p_unit in ('g','kg') then (case p_unit when 'g' then p_qty else p_qty*1000 end)
    when p_yield_unit = 'ea' and p_unit = 'ea' then p_qty
  end
$$;

create or replace function compute_rollup(p_recipe uuid) returns void
language plpgsql security definer set search_path = spec, public as $$
declare
  v_portions numeric;
begin
  select coalesce(nullif(portions,0),1) into v_portions from recipes where id = p_recipe;

  with recursive walk(recipe_id, factor, ok) as (
    -- factor = how much of this recipe's batch goes into one run of p_recipe
    select p_recipe, 1::numeric, true
    union all
    select rl.sub_recipe_id,
           w.factor * to_yield(rl.quantity, rl.unit, s.yield_unit) / nullif(s.yield_qty, 0),
           w.ok and to_yield(rl.quantity, rl.unit, s.yield_unit) is not null
    from walk w
    join recipe_lines rl on rl.recipe_id = w.recipe_id and rl.sub_recipe_id is not null
    join recipes s on s.id = rl.sub_recipe_id
  ),
  prod as (
    select p.*, w.ok,
           w.factor * to_base(rl.quantity, rl.unit, p.base_unit, p.each_weight_g, p.density_g_per_ml) as base_qty
    from walk w
    join recipe_lines rl on rl.recipe_id = w.recipe_id and rl.product_id is not null
    join products p on p.id = rl.product_id
  ),
  amounts as (   -- grams or ml used, for nutrition (per 100 g/ml)
    select prod.*,
           case base_unit when 'ea' then base_qty * each_weight_g else base_qty end as mass
    from prod
  ),
  alg as (
    select pa.allergen_id, min(pa.level) as level   -- 'contains' < 'may_contain'
    from (
      select pa.allergen_id, pa.level from prod join product_allergens pa on pa.product_id = prod.id
      union all
      select o.allergen_id, o.level from walk join recipe_allergen_overrides o on o.recipe_id = walk.recipe_id
    ) pa
    group by pa.allergen_id
  ),
  nut as (
    select key, sum((value::text)::numeric * mass / 100) / v_portions as v
    from amounts, jsonb_each(nutrition_per_100)
    where jsonb_typeof(value) = 'number'
    group by key
  )
  insert into recipe_rollups as r (recipe_id, contains, may_contain, unknown_products, diets,
                                   nutrition_per_portion, nutrition_complete, cost_per_portion_pence, computed_at)
  select p_recipe,
    coalesce((select array_agg(allergen_id order by allergen_id) from alg where level = 'contains'), '{}'),
    coalesce((select array_agg(allergen_id order by allergen_id) from alg where level = 'may_contain'
              and allergen_id not in (select allergen_id from alg where level = 'contains')), '{}'),
    coalesce((select array_agg(distinct id) from prod where allergen_status = 'unknown'), '{}'),
    -- a diet applies only if every product carries it (and there is at least one product)
    coalesce((select array_agg(d.id order by d.id) from diets d
              where exists (select 1 from prod)
                and not exists (select 1 from prod where not exists (
                  select 1 from product_diets pd where pd.product_id = prod.id and pd.diet_id = d.id))), '{}'),
    coalesce((select jsonb_object_agg(key, round(v, 1)) from nut), '{}'),
    exists (select 1 from prod) and not exists (
      select 1 from amounts where not ok or mass is null or nutrition_per_100 = '{}'::jsonb),
    case when exists (select 1 from prod) and not exists (
           select 1 from prod where not ok or base_qty is null or pack_cost_pence is null or nullif(pack_size,0) is null)
         then round((select sum(pack_cost_pence::numeric / pack_size * base_qty) from prod) / v_portions)::int end,
    now()
  on conflict (recipe_id) do update set
    contains = excluded.contains, may_contain = excluded.may_contain,
    unknown_products = excluded.unknown_products, diets = excluded.diets,
    nutrition_per_portion = excluded.nutrition_per_portion, nutrition_complete = excluded.nutrition_complete,
    cost_per_portion_pence = excluded.cost_per_portion_pence, computed_at = excluded.computed_at;
end $$;

-- Recompute a recipe and every recipe that uses it, all the way up.
create or replace function refresh_rollup_up(p_recipe uuid) returns void
language plpgsql security definer set search_path = spec, public as $$
declare r uuid;
begin
  for r in
    with recursive up(id) as (
      select p_recipe
      union
      select rl.recipe_id from recipe_lines rl join up on rl.sub_recipe_id = up.id
    ) select id from up
  loop
    perform compute_rollup(r);
  end loop;
end $$;

create or replace function refresh_for_product(p_product uuid) returns void
language plpgsql security definer set search_path = spec, public as $$
declare r uuid;
begin
  for r in select distinct recipe_id from recipe_lines where product_id = p_product loop
    perform refresh_rollup_up(r);
  end loop;
end $$;

create or replace function trg_rollup_recipe_lines() returns trigger
language plpgsql security definer set search_path = spec, public as $$
begin
  if current_setting('app.skip_rollup', true) = 'on' then return null; end if;  -- bulk saves run one roll-up at the end
  if tg_op in ('UPDATE','DELETE') then perform refresh_rollup_up(old.recipe_id); end if;
  if tg_op in ('INSERT','UPDATE') then perform refresh_rollup_up(new.recipe_id); end if;
  return null;
end $$;
create trigger rollup_recipe_lines after insert or update or delete on recipe_lines
  for each row execute function trg_rollup_recipe_lines();

create or replace function trg_rollup_recipes() returns trigger
language plpgsql security definer set search_path = spec, public as $$
begin
  if current_setting('app.skip_rollup', true) = 'on' then return null; end if;  -- bulk saves run one roll-up at the end
  if tg_op = 'INSERT' or new.yield_qty is distinct from old.yield_qty
     or new.yield_unit is distinct from old.yield_unit or new.portions is distinct from old.portions then
    perform refresh_rollup_up(new.id);
  end if;
  return null;
end $$;
create trigger rollup_recipes after insert or update on recipes
  for each row execute function trg_rollup_recipes();

create or replace function trg_rollup_overrides() returns trigger
language plpgsql security definer set search_path = spec, public as $$
begin
  if current_setting('app.skip_rollup', true) = 'on' then return null; end if;  -- bulk saves run one roll-up at the end
  perform refresh_rollup_up(coalesce(new.recipe_id, old.recipe_id));
  return null;
end $$;
create trigger rollup_overrides after insert or update or delete on recipe_allergen_overrides
  for each row execute function trg_rollup_overrides();

create or replace function trg_rollup_product_children() returns trigger
language plpgsql security definer set search_path = spec, public as $$
begin
  if current_setting('app.skip_rollup', true) = 'on' then return null; end if;  -- bulk saves run one roll-up at the end
  perform refresh_for_product(coalesce(new.product_id, old.product_id));
  return null;
end $$;
create trigger rollup_product_allergens after insert or update or delete on product_allergens
  for each row execute function trg_rollup_product_children();
create trigger rollup_product_diets after insert or update or delete on product_diets
  for each row execute function trg_rollup_product_children();

create or replace function trg_rollup_products() returns trigger
language plpgsql security definer set search_path = spec, public as $$
begin
  if current_setting('app.skip_rollup', true) = 'on' then return null; end if;  -- bulk saves run one roll-up at the end
  perform refresh_for_product(new.id);
  return null;
end $$;
create trigger rollup_products after update on products
  for each row when (old.* is distinct from new.*) execute function trg_rollup_products();

-- ---------------------------------------------------------------
-- Session helpers
-- ---------------------------------------------------------------

-- Which organisation the signed-in user works in (first active membership).
create or replace function current_org() returns uuid
language sql stable security definer set search_path = spec, public as $$
  select org_id from memberships where user_id = auth.uid() and status = 'active' order by created_at limit 1
$$;

-- Make sure the signed-in user has a spec.profiles row (auth is shared with other apps in this project).
create or replace function ensure_profile() returns void
language plpgsql security definer set search_path = spec, public as $$
begin
  if auth.uid() is null then return; end if;
  insert into profiles (id, email)
  select u.id, u.email from auth.users u where u.id = auth.uid()
  on conflict (id) do nothing;
end $$;

-- ---------------------------------------------------------------
-- Save a recipe in one transaction: details, lines, overrides, then one roll-up.
-- Security invoker: RLS applies. Optimistic lock on updated_at.
-- ---------------------------------------------------------------
create or replace function save_recipe(p_recipe uuid, p_expected timestamptz, p_details jsonb, p_lines jsonb, p_overrides jsonb)
returns timestamptz
language plpgsql set search_path = spec, public as $$
declare
  r recipes%rowtype;
  who text;
  v_new timestamptz;
begin
  select * into r from recipes where id = p_recipe;
  if not found then raise exception 'That recipe no longer exists.' using errcode = 'P0002'; end if;
  if not can_edit_recipes(r.org_id) then raise exception 'Your role can read specs but not change them.' using errcode = '42501'; end if;
  select * into r from recipes where id = p_recipe for update;
  if date_trunc('milliseconds', r.updated_at) <> date_trunc('milliseconds', p_expected) then
    select coalesce(nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), ''), email) into who from profiles where id = r.updated_by;
    raise exception '% saved this recipe while you were editing. Reload to see their changes.', coalesce(who, 'Someone') using errcode = 'P0409';
  end if;

  perform set_config('app.skip_rollup', 'on', true);

  delete from recipe_lines where recipe_id = p_recipe;
  insert into recipe_lines (recipe_id, sort, product_id, sub_recipe_id, quantity, unit)
  select p_recipe, ord::int, nullif(l->>'productId','')::uuid, nullif(l->>'subRecipeId','')::uuid, (l->>'quantity')::numeric, l->>'unit'
  from jsonb_array_elements(coalesce(p_lines, '[]')) with ordinality as t(l, ord);

  delete from recipe_allergen_overrides where recipe_id = p_recipe;
  insert into recipe_allergen_overrides (recipe_id, allergen_id, level, reason)
  select p_recipe, (o->>'allergenId')::uuid, o->>'level', o->>'reason'
  from jsonb_array_elements(coalesce(p_overrides, '[]')) as t(o);

  update recipes set
    name = trim(p_details->>'name'),
    code = nullif(trim(coalesce(p_details->>'code','')), ''),
    description = nullif(trim(coalesce(p_details->>'description','')), ''),
    yield_qty = nullif(p_details->>'yieldQty','')::numeric,
    yield_unit = nullif(p_details->>'yieldUnit',''),
    portions = coalesce(nullif(p_details->>'portions','')::numeric, 1),
    method = coalesce(p_details->'method', '[]'),
    skill_rating = nullif(p_details->>'skillRating',''),
    time_rating = nullif(p_details->>'timeRating',''),
    status = coalesce(nullif(p_details->>'status',''), status),
    price_pence = nullif(p_details->>'pricePence','')::int,
    updated_by = auth.uid()
  where id = p_recipe
  returning updated_at into v_new;

  perform set_config('app.skip_rollup', 'off', true);
  perform refresh_rollup_up(p_recipe);
  return v_new;
end $$;

-- Replace the content builder tree of a menu in one transaction.
create or replace function save_menu_rows(p_menu uuid, p_rows jsonb) returns void
language plpgsql set search_path = spec, public as $$
declare
  sec jsonb; child jsonb; s_ord int := 0; c_ord int; v_sec uuid;
begin
  if not exists (select 1 from menus where id = p_menu) then raise exception 'That menu no longer exists.' using errcode = 'P0002'; end if;
  delete from menu_rows where menu_id = p_menu;
  for sec in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    s_ord := s_ord + 1;
    if coalesce(trim(sec->>'title'), '') = '' then raise exception 'Every section needs a name.' using errcode = '22023'; end if;
    insert into menu_rows (menu_id, sort, kind, title, description)
    values (p_menu, s_ord, 'section', trim(sec->>'title'), sec->>'description') returning id into v_sec;
    c_ord := 0;
    for child in select * from jsonb_array_elements(coalesce(sec->'children', '[]')) loop
      c_ord := c_ord + 1;
      insert into menu_rows (menu_id, parent_row_id, sort, kind, title, description, recipe_id)
      values (p_menu, v_sec, c_ord, child->>'kind', nullif(child->>'title',''), nullif(child->>'description',''), nullif(child->>'recipeId','')::uuid);
    end loop;
  end loop;
  update menus set updated_at = now() where id = p_menu;
end $$;

-- ---------------------------------------------------------------
-- Guest-facing reads (anon). Security definer, return only what a guest may see.
-- Until publishing (milestone 2b) any menu is previewable by its id, which is an unguessable uuid.
-- ---------------------------------------------------------------
create or replace function public_org(p_slug text) returns jsonb
language sql stable security definer set search_path = spec, public as $$
  select jsonb_build_object('id', id, 'name', name, 'slug', slug, 'calorieStatement', calorie_statement, 'disclaimer', disclaimer)
  from organisations where slug = p_slug
$$;

create or replace function public_menu(p_slug text, p_menu uuid) returns jsonb
language sql stable security definer set search_path = spec, public as $$
  with o as (select id from organisations where slug = p_slug),
  m as (select * from menus where id = p_menu and org_id = (select id from o))
  select case when not exists (select 1 from m) then null else jsonb_build_object(
    'menu', (select to_jsonb(m) from m),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.parent_row_id nulls first, r.sort) from menu_rows r where r.menu_id = p_menu), '[]'),
    'dishes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'name', x.name, 'code', x.code, 'description', x.description, 'pricePence', x.price_pence, 'photoPath', x.photo_path,
        'contains', ru.contains, 'mayContain', ru.may_contain, 'unknown', cardinality(ru.unknown_products) > 0, 'diets', ru.diets,
        'kcal', case when ru.nutrition_complete then round((ru.nutrition_per_portion->>'kcal')::numeric) end))
      from recipes x join recipe_rollups ru on ru.recipe_id = x.id
      where x.id in (select recipe_id from menu_rows where menu_id = p_menu and recipe_id is not null)), '[]'),
    'allergens', (select jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name, 'parentId', a.parent_id, 'sort', a.sort) order by a.sort)
                  from allergens a where a.org_id is null or a.org_id = (select id from o)),
    'diets', (select jsonb_agg(jsonb_build_object('id', d.id, 'code', d.code, 'name', d.name, 'short', d.short, 'sort', d.sort) order by d.sort)
              from diets d where d.org_id is null or d.org_id = (select id from o))
  ) end
$$;


-- ---------------------------------------------------------------
-- One-off: create an organisation and make an existing login its admin.
-- Run by hand (service role / SQL editor), not exposed to the app.
-- ---------------------------------------------------------------
create or replace function bootstrap_org(p_name text, p_slug text, p_admin_email text) returns uuid
language plpgsql security definer set search_path = spec, public as $$
declare v_org uuid; v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(p_admin_email);
  if v_user is null then raise exception 'No login with that email in this project.'; end if;
  insert into organisations (name, slug) values (p_name, p_slug) returning id into v_org;
  insert into profiles (id, email) select id, email from auth.users where id = v_user on conflict (id) do nothing;
  insert into memberships (org_id, user_id, role) values (v_org, v_user, 'org_admin');
  insert into allergens (org_id, code, name, is_statutory, sort) values (v_org, 'garlic_onion', 'Garlic / onion', false, 15);
  insert into cookbook_styles (org_id, name, is_default) values (v_org, 'Standard', true);
  return v_org;
end $$;

-- ---------------------------------------------------------------
-- Photo storage. Public read (guests see dish photos anyway; paths are uuids),
-- writes only by recipe editors of the org named in the first folder.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('spec-photos', 'spec-photos', true, 4194304, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "spec photos insert by editors" on storage.objects for insert to authenticated
  with check (bucket_id = 'spec-photos' and spec.can_edit_recipes(((storage.foldername(name))[1])::uuid));
create policy "spec photos update by editors" on storage.objects for update to authenticated
  using (bucket_id = 'spec-photos' and spec.can_edit_recipes(((storage.foldername(name))[1])::uuid));
create policy "spec photos delete by editors" on storage.objects for delete to authenticated
  using (bucket_id = 'spec-photos' and spec.can_edit_recipes(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------
-- Grants. RLS still decides which rows each user sees.
-- ---------------------------------------------------------------
grant select, insert, update, delete on all tables in schema spec to authenticated;
grant usage, select on all sequences in schema spec to authenticated;
grant all on all tables in schema spec to service_role;
grant all on all sequences in schema spec to service_role;
revoke execute on all functions in schema spec from public, anon;
grant execute on all functions in schema spec to authenticated, service_role;
create extension if not exists pg_trgm with schema extensions;
create index if not exists recipes_name_trgm on recipes using gin (name extensions.gin_trgm_ops);
-- Visitors (anon) may only call the two guest read functions.
grant execute on function public_org(text), public_menu(text, uuid) to anon;
-- bootstrap_org is for the project owner only (SQL editor / service role).
revoke execute on function bootstrap_org(text, text, text) from public, anon, authenticated;
