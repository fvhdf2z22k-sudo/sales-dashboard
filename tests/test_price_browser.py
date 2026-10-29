"""Run: python tests/test_price_browser.py. Requires Playwright and Chromium."""
from pathlib import Path
from urllib.parse import unquote,urlparse
import csv,json,io
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
def row(pid,rev,qty,year=2026,brand='지누스',**other):
 return {'channel':'danawa','mid':'침실가구','sub':'매트리스','det':'스프링','brand':brand,'mall':'테스트몰','name':'상품 '+pid,'pid':pid,'sid':'','cat':'','rev':rev,'qty':qty,'date':f'{year}-10-'+('02' if year==2025 else '01'),'year':year,'reg':'','rank':0,'source':'synthetic.xls',**other}
fixture={'version':30,'audit':[],'internalSnapshots':[],'rows':[row('move',100000,1,2025),row('move',300000,1),row('weighted',900000,3,2025),row('weighted',100000,1),row('weighted',900000,3),row('new',500000,1,brand='시몬스'),row('lost',500000,1,2025,brand='에이스침대'),row('zero',500,0),row('adjustment',-100,-1),row('tail',0,0,date='2026-10-15'),row('tail',0,0,2025,date='2025-10-16'),row('enuri',250000,1,channel='enuri',cat='12020406'),row('enuri',200000,1,2025,channel='enuri',cat='12020406'),{**row('blank',100,1), 'pid':'', 'name':'미확인'},row('bedding',10000,1,sub='침구',mid='침구/커튼/카페트'),row('bedding',5000,1,2025,sub='침구',mid='침구/커튼/카페트')]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1440,'height':1080});errors=[];requests=[];payload=fixture
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.method))
 def serve(route):
  name=unquote(urlparse(route.request.url).path).removeprefix('/sales-dashboard/') or 'index.html'
  if name=='data/public.json':route.fulfill(json=payload);return
  file=(ROOT/name).resolve();assert file.is_relative_to(ROOT);route.fulfill(path=str(file),content_type='text/javascript' if name.endswith('.js') else 'text/html')
 page.route('http://dashboard.test/sales-dashboard/**',serve);page.goto('http://dashboard.test/sales-dashboard/');page.wait_for_function('()=>publicReady')
 page.select_option('#channel','danawa');page.select_option('#section','침실가구');page.select_option('#subcategory',label='매트리스');page.locator('[data-tab="price"]').click();assert not page.locator('#error').inner_text()
 assert page.locator('#price-edges').input_value()=='10,30,50,100,200'
 def export(button):
  with page.expect_download() as dl:page.locator('#'+button).click()
  path=Path('/tmp/'+dl.value.suggested_filename);dl.value.save_as(str(path));return list(csv.DictReader(io.StringIO(path.read_text(encoding='utf-8-sig'))))
 summary=export('price-summary-csv');brands=export('price-brand-csv');products=export('price-products-csv')
 assert len(summary)==7
 actual=page.evaluate('[lastContext.ra,lastContext.rb,lastContext.qa,lastContext.qb]')
 assert abs(sum(float(r['전년거래액']) for r in summary)-actual[0])<.01
 assert abs(sum(float(r['당년거래액']) for r in summary)-actual[1])<.01
 assert sum(float(r['전년수량']) for r in summary)==actual[2] and sum(float(r['당년수량']) for r in summary)==actual[3]
 assert abs(sum(float(r['당년거래액']) for r in brands)-actual[1])<.01
 weighted=next(r for r in products if r['상품코드']=='weighted');assert float(weighted['당년평균단가'])==250000 and weighted['가격대이동']=='이동'
 print('BROWSER TOTALS, 3 CSV DOWNLOADS, PRODUCT/YEAR WEIGHTED PRICE AND MOVEMENT PASS',flush=True)
 # Price-table and graph clicks both filter details; union keeps movers.
 page.locator('#price-summary-table tbody tr').nth(1).locator('button').click();assert page.locator('#price-band').input_value()=='b1'
 for membership,contains in [('prior',True),('current',False),('union',True)]:
  page.select_option('#price-membership',membership);rows=export('price-products-csv');assert any(r['상품코드']=='move' for r in rows)==contains
 page.evaluate("charts[0].options.onClick({},[{index:2}],charts[0])");assert page.locator('#price-band').input_value()=='b2'
 for metric in ['rev','qty','share','unit']:
  page.select_option('#price-metric',metric);assert page.evaluate('charts.length')==2 and not page.locator('#error').inner_text()
 page.select_option('#price-band','all');page.select_option('#price-brands',['지누스','시몬스']);rows=export('price-brand-csv');assert {r['브랜드'] for r in rows}=={'지누스','시몬스'}
 page.locator('#price-all-brands').click()
 for mode in ['sales','up','down','core-down','new','lost','all']:
  page.select_option('#price-product-mode',mode);assert not page.locator('#error').inner_text();rows=export('price-products-csv')
  if mode=='new':assert rows and all(r['신규매출관측']=='관측' for r in rows)
  if mode=='lost':assert rows and all(r['당년매출미관측']=='미관측' for r in rows)
 page.locator('#price-edges').fill('10,10');page.locator('#price-apply-edges').click();assert '중복' in page.locator('#error').inner_text();assert page.locator('#price-preset').input_value()!='custom'
 page.locator('#price-edges').fill('5,25,75');page.locator('#price-apply-edges').click();assert page.locator('#price-preset').input_value()=='custom';assert len(export('price-summary-csv'))==5
 page.select_option('#price-preset','auto');page.select_option('#section','침구/커튼/카페트');page.select_option('#subcategory',label='침구');assert page.locator('#price-edges').input_value()=='3,5,10,20,30'
 print('TABLE/CHART CLICKS, ALL MEMBERSHIP MODES, BRANDS, METRICS, TOP/OBSERVATION MODES, CUSTOM/PRESET EDGES PASS',flush=True)
 # Real public data regression: both date modes and three channels, without altering JSON.
 payload=json.loads((ROOT/'data/public.json').read_text());page.locator('#public-reload').click();page.wait_for_function('(n)=>data.length===n',arg=len(payload['rows']))
 for comparison in ['weekday','calendar']:
  page.select_option('#comparison',comparison)
  for channel in ['all','danawa','enuri']:
   page.select_option('#channel',channel);page.select_option('#section','침실가구');page.select_option('#subcategory',label='매트리스');assert not page.locator('#error').inner_text()
   rows=export('price-summary-csv');actual=page.evaluate('[lastContext.ra,lastContext.rb]');assert abs(sum(float(r['전년거래액']) for r in rows)-actual[0])<.01 and abs(sum(float(r['당년거래액']) for r in rows)-actual[1])<.01
   assert len(page.evaluate('exportRows'))>0
 for tab in ['overview','malls','drivers','products','season','structure','report','internal','quality','price']:
  page.locator('[data-tab="'+tab+'"]').click();assert not page.locator('#error').inner_text(),(tab,page.locator('#error').inner_text())
 assert not errors,errors
 assert all(m=='GET' for m in requests);assert page.evaluate('draftDirty')==False
 page.select_option('#price-product-mode','sales');detail=page.locator('section.panel').filter(has=page.locator('h2',has_text='C. 선택 가격대 상품 상세'));assert detail.locator('tbody tr').count()<=20
 page.screenshot(path='/workspace/price-analysis-preview.png',full_page=False)
 editor=browser.new_page();editor.route('http://dashboard.test/sales-dashboard/**',serve);editor.on('pageerror',lambda e:errors.append(str(e)));editor.goto('http://dashboard.test/sales-dashboard/editor.html');editor.wait_for_function('()=>publicReady');editor.locator('[data-tab="price"]').click();assert not editor.locator('#error').inner_text();assert editor.locator('#price-summary-csv').is_visible();assert not errors,errors
 print('ACTUAL DATA / 6 CHANNEL-DATE COMBINATIONS, EXISTING TABS, VIEWER/EDITOR, READONLY DATA AND NO BROWSER ERRORS PASS',flush=True)
 browser.close()
