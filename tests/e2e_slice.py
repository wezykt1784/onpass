# End-to-end test of the vertical slice. Start the app on port 3100 with an empty .data folder, then: python3 tests/e2e_slice.py
from playwright.sync_api import sync_playwright, expect
import re
B='http://localhost:3100'
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1440,'height':900},accept_downloads=True)
    pg=ctx.new_page()
    pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.on('console',lambda m: errs.append(m.text[:200]) if m.type=='error' else None)
    pg.set_default_timeout(15000)
    # sign in
    pg.goto(B+'/login'); pg.get_by_label('Work email').fill('central@demo.test'); pg.keyboard.press('Enter')
    pg.wait_for_url(B+'/app'); print('1 signed in')
    # new batch recipe
    pg.goto(B+'/app/recipes'); pg.get_by_role('button',name='New recipe').click()
    pg.get_by_label('Batch recipe').check(); pg.get_by_label('Name',exact=True).fill('Test harissa mayo'); pg.get_by_role('button',name='Create').click()
    pg.wait_for_url(re.compile(r'/app/recipes/re-')); batch_url=pg.url; print('2 batch created', batch_url)
    pg.get_by_label('Batch weight').fill('980')
    pg.get_by_role('button',name='Add ingredient').click()
    cb=pg.get_by_role('combobox',name='Ingredient 1',exact=True); cb.fill('mayonnaise'); pg.keyboard.press('Enter')
    pg.get_by_label('Quantity for ingredient 1',exact=True).fill('950')
    pg.get_by_role('button',name='Add ingredient').click()
    cb=pg.get_by_role('combobox',name='Ingredient 2',exact=True); cb.fill('harissa paste'); pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(100)
    # 'harissa paste' doesn't exist: pick the create option -> quick add dialog
    pg.keyboard.press('Enter')
    dlg=pg.get_by_role('dialog',name='New product'); expect(dlg).to_be_visible()
    dlg.get_by_label('Supplier',exact=True).select_option(label='Market Fresh Ltd'); dlg.get_by_label('Supplier code').fill('HARIS1-ea')
    dlg.get_by_label('Sesame',exact=True).select_option('contains')
    dlg.get_by_label("I've checked these against the supplier spec").check()
    dlg.get_by_role('button',name='Save product').click(); expect(dlg).to_be_hidden(); print('3 product quick-added from the recipe')
    pg.get_by_label('Quantity for ingredient 2',exact=True).fill('30')
    pg.get_by_role('button',name='Add step').click(); pg.get_by_label('Step 1',exact=True).fill('WHISK harissa into the mayo. Label and date.')
    pg.get_by_role('button',name='Save recipe').click(); expect(pg.get_by_text('Saved',exact=True)).to_be_visible()
    expect(pg.get_by_text('Allergens: Eggs, Mustard, Sesame')).to_be_visible(); print('4 batch saved, allergens rolled up')
    # new dish using the batch
    pg.goto(B+'/app/recipes'); pg.get_by_role('button',name='New recipe').click(); pg.get_by_label('Name',exact=True).fill('Test lamb flatbread'); pg.get_by_role('button',name='Create').click()
    pg.wait_for_url(re.compile(r'/app/recipes/re-')); dish_id=pg.url.rsplit('/',1)[1]
    pg.get_by_label('Sell price (£)').fill('12.5'); pg.get_by_label('Recipe code').fill('TEST-01')
    pg.get_by_role('button',name='Add ingredient').click(); pg.get_by_role('combobox',name='Ingredient 1',exact=True).fill('test harissa'); pg.keyboard.press('Enter')
    pg.get_by_label('Quantity for ingredient 1',exact=True).fill('35')
    pg.get_by_role('button',name='Add ingredient').click(); pg.get_by_role('combobox',name='Ingredient 2',exact=True).fill('brioche'); pg.keyboard.press('Enter')
    pg.get_by_role('button',name='Save recipe').click(); expect(pg.get_by_text('Enter a quantity for ingredient 2, or remove it.')).to_be_visible(); print('5a empty quantity is refused, not dropped')
    pg.get_by_label('Quantity for ingredient 2',exact=True).fill('1')
    pg.get_by_role('button',name='Save recipe').click(); expect(pg.get_by_text('Saved',exact=True)).to_be_visible()
    expect(pg.get_by_text(re.compile(r'Allergens: Cereals containing gluten \(wheat\), Eggs, Milk, Mustard, Sesame'))).to_be_visible(); print('5 dish saved with nested batch allergens')
    # loop protection: put the dish into the batch
    pg.goto(batch_url); pg.get_by_role('button',name='Add ingredient').click()
    opts=pg.get_by_role('combobox',name='Ingredient 3',exact=True); opts.fill('Test lamb'); pg.wait_for_timeout(200)
    lb=pg.locator('[role=listbox] [role=option]'); print('6 dishes are not offered as ingredients:', lb.filter(has_text='Test lamb').count()==0, '| picker shows:', lb.all_inner_texts()[:3] or ['No match'])
    pg.goto(B+'/app/menus')
    # new menu
    pg.get_by_role('button',name='New menu').click(); pg.get_by_label('Menu name').fill('Test spring menu'); pg.get_by_role('button',name='Create').click()
    pg.wait_for_url(re.compile(r'/app/menus/me-')); menu_url=pg.url
    expect(pg.get_by_text('Start with a section')).to_be_visible()
    pg.get_by_role('button',name='Add section').click(); pg.get_by_label('Section name').fill('Sharing')
    pg.get_by_role('combobox',name='Add a dish to Sharing').fill('Test lamb'); pg.keyboard.press('Enter')
    pg.get_by_role('combobox',name='Add a dish to Sharing').fill('squid'); pg.keyboard.press('Enter')
    pg.get_by_role('button',name='Save menu').click(); expect(pg.get_by_role('status').filter(has_text='Saved')).to_be_visible(); print('7 menu built and saved')
    pg.get_by_role('tab',name='Details').click(); pg.get_by_label('Spec book date').fill('2027-03-01'); pg.get_by_role('button',name='Save details').click(); expect(pg.get_by_role('status').filter(has_text='Saved')).to_be_visible()
    # spec book
    pg.get_by_role('link',name='Spec book',exact=True).click(); pg.wait_for_url(re.compile('spec-book'))
    with pg.expect_download() as dl: pg.get_by_role('link',name='Download PDF').click()
    path=dl.value.path(); import subprocess; info=subprocess.run(['pdfinfo',path],capture_output=True,text=True).stdout
    txt=subprocess.run(['pdftotext',path,'-'],capture_output=True,text=True).stdout
    print('8 PDF downloaded:', dl.value.suggested_filename, [l for l in info.splitlines() if l.startswith('Pages')], 'has dish:', 'Test lamb flatbread' in txt, 'has batch:', 'Test harissa mayo' in txt, 'has date:', '01/03/2027' in txt)
    # guest filter
    menu_id=menu_url.rsplit('/',1)[1]
    g=ctx.new_page(); g.goto(f'{B}/m/demo/{menu_id}'); g.get_by_role('button',name='Filter for allergies').click()
    g.get_by_label('Sesame',exact=True).check(); g.get_by_role('button',name=re.compile(r'Show \d+ dishes')).click()
    print('9 guest filter: lamb hidden', g.get_by_text('Test lamb flatbread').count()==0, '| squid shown', g.get_by_text('Crispy squid, lime mayo').count()==1)
    b.close()
print('errors:', errs)
