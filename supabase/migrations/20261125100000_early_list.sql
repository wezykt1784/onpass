-- Landing page early list. Guests add themselves through join_early_list(); nobody reads the table
-- through the API (RLS on, no policies). Read it in the dashboard or with the service role.
create table if not exists spec.early_list (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(email) <= 200 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  name text not null check (length(trim(name)) between 1 and 80),
  company text not null check (length(trim(company)) between 1 and 120),
  sites int not null check (sites between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists early_list_email on spec.early_list (lower(email));
alter table spec.early_list enable row level security;
revoke all on spec.early_list from public, anon, authenticated;

create or replace function spec.join_early_list(p_email text, p_name text, p_company text, p_sites int) returns void
language plpgsql security definer set search_path = spec, public as $$
begin
  insert into early_list (email, name, company, sites)
  values (lower(trim(p_email)), trim(p_name), trim(p_company), p_sites)
  on conflict (lower(email)) do update
    set name = excluded.name, company = excluded.company, sites = excluded.sites, updated_at = now();
end $$;
revoke execute on function spec.join_early_list(text, text, text, int) from public;
grant execute on function spec.join_early_list(text, text, text, int) to anon, authenticated, service_role;
