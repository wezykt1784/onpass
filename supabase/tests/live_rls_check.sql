-- Permission check against the real project. Safe to run in the SQL editor:
-- it creates two test companies and three test logins, checks what each can see and do,
-- then raises an exception on purpose so EVERYTHING is rolled back. Read the results in the error text.
-- Every value should read as expected; anything saying "ALLOWED (BAD)" is a security bug.
do $$
declare
  a uuid := gen_random_uuid(); s uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  org_a uuid; org_b uuid; p uuid; bat uuid; dish uuid; v timestamptz; m uuid;
  res jsonb := '{}'; n int; msg text;
begin
  insert into auth.users (id, email, aud, role) values (a,'rls-test-a@example.invalid','authenticated','authenticated'),(s,'rls-test-s@example.invalid','authenticated','authenticated'),(b,'rls-test-b@example.invalid','authenticated','authenticated');
  org_a := spec.bootstrap_org('RLS Test A','rls-test-a','rls-test-a@example.invalid');
  org_b := spec.bootstrap_org('RLS Test B','rls-test-b','rls-test-b@example.invalid');
  insert into spec.profiles(id,email) values (s,'rls-test-s@example.invalid');
  insert into spec.memberships(org_id,user_id,role) values (org_a,s,'viewer');

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  insert into spec.products(org_id,name,base_unit,allergen_status,nutrition_per_100,pack_size,pack_cost_pence) values (org_a,'MAYO','g','complete','{"kcal":680}',5000,1395) returning id into p;
  insert into spec.product_allergens select p, id, 'contains' from spec.allergens where code='eggs' and org_id is null;
  insert into spec.recipes(org_id,kind,name,yield_qty,yield_unit) values (org_a,'batch','Lime mayo',1000,'g') returning id, updated_at into bat, v;
  perform spec.save_recipe(bat, v, '{"name":"Lime mayo","yieldQty":1000,"yieldUnit":"g","status":"approved"}', jsonb_build_array(jsonb_build_object('productId',p,'quantity',950,'unit','g')), '[]');
  insert into spec.recipes(org_id,kind,name) values (org_a,'dish','Squid') returning id, updated_at into dish, v;
  v := spec.save_recipe(dish, v, '{"name":"Squid","pricePence":800}', jsonb_build_array(jsonb_build_object('subRecipeId',bat,'quantity',40,'unit','g')), '[]');
  select (select string_agg(code,',') from spec.allergens where id = any(contains)) into msg from spec.recipe_rollups where recipe_id = dish;
  res := res || jsonb_build_object('dish_allergens_via_batch (expect eggs)', msg, 'dish_kcal (expect 258.4)', (select nutrition_per_portion->>'kcal' from spec.recipe_rollups where recipe_id=dish));
  insert into spec.menus(org_id,name) values (org_a,'Winter') returning id into m;
  perform spec.save_menu_rows(m, jsonb_build_array(jsonb_build_object('title','Small plates','children',jsonb_build_array(jsonb_build_object('kind','item','recipeId',dish)))));

  perform set_config('request.jwt.claims', json_build_object('sub',b,'role','authenticated')::text, true);
  res := res || jsonb_build_object('other company sees A recipes (expect 0)', (select count(*) from spec.recipes where org_id = org_a));
  begin perform spec.save_recipe(dish, v, '{"name":"hack"}', '[]', '[]'); res := res || '{"other company save":"ALLOWED (BAD)"}'; exception when others then res := res || jsonb_build_object('other company save', sqlerrm); end;
  update spec.recipes set name='hack' where id = dish; get diagnostics n = row_count; res := res || jsonb_build_object('other company direct update rows (expect 0)', n);

  perform set_config('request.jwt.claims', json_build_object('sub',s,'role','authenticated')::text, true);
  res := res || jsonb_build_object('site chef sees recipes (expect 2)', (select count(*) from spec.recipes));
  begin perform spec.save_recipe(dish, v, '{"name":"site"}', '[]', '[]'); res := res || '{"site chef save":"ALLOWED (BAD)"}'; exception when others then res := res || jsonb_build_object('site chef save', sqlerrm); end;

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  begin perform spec.save_recipe(dish, v - interval '1 minute', '{"name":"old"}', '[]', '[]'); res := res || '{"stale save":"ALLOWED (BAD)"}'; exception when others then res := res || jsonb_build_object('stale save', sqlerrm); end;

  execute 'reset role'; execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  res := res || jsonb_build_object('guest menu dishes (expect 1)', jsonb_array_length(spec.public_menu('rls-test-a', m)->'dishes'), 'guest wrong company blocked (expect true)', spec.public_menu('rls-test-b', m) is null);
  begin perform count(*) from spec.recipes; res := res || '{"guest reads tables":"ALLOWED (BAD)"}'; exception when others then res := res || jsonb_build_object('guest reads tables', sqlerrm); end;
  begin perform spec.bootstrap_org('x','x-x','rls-test-a@example.invalid'); res := res || '{"guest bootstrap":"ALLOWED (BAD)"}'; exception when others then res := res || jsonb_build_object('guest bootstrap', sqlerrm); end;
  execute 'reset role';
  raise exception 'TEST RESULTS (all rolled back): %', res;
end $$;
