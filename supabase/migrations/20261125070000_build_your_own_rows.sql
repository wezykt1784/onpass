-- Build-your-own groups in the content builder: a byo row sits in a section and holds item rows (the options).
-- Also refuses a recipe from another group, which the old version didn't check.
create or replace function spec.save_menu_rows(p_menu uuid, p_rows jsonb) returns void
language plpgsql set search_path = spec, public as $$
declare
  sec jsonb; child jsonb; opt jsonb; s_ord int := 0; c_ord int; o_ord int; v_sec uuid; v_grp uuid; v_org uuid; v_name text;
begin
  select org_id into v_org from menus where id = p_menu;
  if v_org is null then raise exception 'That menu no longer exists.' using errcode = 'P0002'; end if;
  if exists (
    select 1 from jsonb_path_query(coalesce(p_rows, '[]'), '$[*].children[*] ? (@.kind == "item")') x(r)
    left join recipes rc on rc.id = nullif(x.r->>'recipeId','')::uuid
    where rc.id is null or rc.org_id <> v_org
  ) or exists (
    select 1 from jsonb_path_query(coalesce(p_rows, '[]'), '$[*].children[*].children[*] ? (@.kind == "item")') x(r)
    left join recipes rc on rc.id = nullif(x.r->>'recipeId','')::uuid
    where rc.id is null or rc.org_id <> v_org
  ) then raise exception 'A dish on this menu no longer exists.' using errcode = '22023'; end if;

  delete from menu_rows where menu_id = p_menu;
  for sec in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    s_ord := s_ord + 1;
    if coalesce(trim(sec->>'title'), '') = '' then raise exception 'Every section needs a name.' using errcode = '22023'; end if;
    insert into menu_rows (menu_id, sort, kind, title, description)
    values (p_menu, s_ord, 'section', trim(sec->>'title'), sec->>'description') returning id into v_sec;
    c_ord := 0;
    for child in select * from jsonb_array_elements(coalesce(sec->'children', '[]')) loop
      c_ord := c_ord + 1;
      if child->>'kind' not in ('item', 'info', 'byo') then raise exception 'Check the menu: unknown row.' using errcode = '22023'; end if;
      if child->>'kind' = 'byo' then
        v_name := trim(coalesce(child->>'title', ''));
        if v_name = '' then raise exception 'Give the build-your-own group in "%" a name, like "Build your burger".', trim(sec->>'title') using errcode = '22023'; end if;
        if jsonb_array_length(coalesce(child->'children', '[]')) = 0 then raise exception '"%" needs at least one option for guests to choose.', v_name using errcode = '22023'; end if;
        insert into menu_rows (menu_id, parent_row_id, sort, kind, title, description)
        values (p_menu, v_sec, c_ord, 'byo', v_name, nullif(child->>'description','')) returning id into v_grp;
        o_ord := 0;
        for opt in select * from jsonb_array_elements(child->'children') loop
          o_ord := o_ord + 1;
          if opt->>'kind' is distinct from 'item' then raise exception '"%" can only hold dishes.', v_name using errcode = '22023'; end if;
          insert into menu_rows (menu_id, parent_row_id, sort, kind, title, description, recipe_id)
          values (p_menu, v_grp, o_ord, 'item', nullif(opt->>'title',''), nullif(opt->>'description',''), (opt->>'recipeId')::uuid);
        end loop;
      else
        insert into menu_rows (menu_id, parent_row_id, sort, kind, title, description, recipe_id)
        values (p_menu, v_sec, c_ord, child->>'kind', nullif(child->>'title',''), nullif(child->>'description',''), nullif(child->>'recipeId','')::uuid);
      end if;
    end loop;
  end loop;
  update menus set updated_at = now() where id = p_menu;
end $$;
