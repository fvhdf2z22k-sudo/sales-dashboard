"""Keyword drill-down: independent yearly TOP5 and full-keyword revenue shares."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
rows=[]
for year,values in [(2025,[60,50,40,30,20,10]),(2026,[10,20,30,40,50,60])]:
 for i,value in enumerate(values):
  rows.append(dict(channel='danawa',year=year,date=f'{year}-10-01',rev=value,qty=1,brand=f'브랜드{i+1}',mall='테스트몰',name='구스 겨울 이불',pid=str(i+1),mid='침구/커튼/카페트',sub='침구',det='이불'))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=browser.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def serve(route):
  path=route.request.url.split('http://dashboard.test/')[1].split('?')[0]
  if path=='data/public.json':route.fulfill(json={'version':30,'rows':rows,'audit':[],'internalSnapshots':[]})
  else:route.fulfill(path=str(ROOT/path))
 page.route('http://dashboard.test/**',serve);page.goto('http://dashboard.test/index.html');page.wait_for_function('()=>publicReady')
 page.evaluate('''()=>{seasonSelection='winter';season({a:data.filter(r=>r.year===2025),b:data.filter(r=>r.year===2026),p:2025,y:2026,s:'2026-10-01',e:'2026-10-01',ps:'2025-10-01',pe:'2025-10-01',label:'테스트'});}''')
 button=page.locator('[data-keyword="구스"]');button.click();detail=page.locator('.season-keyword-detail');assert detail.count()==1
 tables=detail.locator('table');assert tables.count()==2
 for table,brand in [(tables.nth(0),'브랜드1'),(tables.nth(1),'브랜드6')]:
  assert table.locator('tbody tr').count()==5
  assert brand in table.locator('tbody tr').first.inner_text()
  assert '28.6%' in table.locator('tbody tr').first.inner_text() # 60 / 210, not 60 / top5 total 200
 assert button.get_attribute('aria-expanded')=='true'
 button.click();assert detail.count()==0
 page.locator('[data-keyword="겨울"]').click();assert detail.count()==1
 page.locator('[data-keyword="냉감"]').click();assert detail.count()==1;assert detail.locator('table').count()==0;assert '선택한 조건의 데이터가 없습니다' in detail.inner_text()
 # Negative adjustment remains in denominator; nonpositive totals have no percentage.
 result=page.evaluate('''()=>{const base={name:'구스',brand:'브랜드',rev:60};return {negative:seasonKeywordBrands([base,{...base,brand:'조정',rev:-10}],[],'구스',2025,2026),zero:seasonKeywordBrands([base,{...base,rev:-60}],[],'구스',2025,2026),escaped:seasonKeywordBrands([{...base,brand:'<img src=x>'}],[],'구스',2025,2026)};}''')
 assert '120.0%' in result['negative'];assert '<img src=x>' not in result['escaped'];assert '&lt;img' in result['escaped'];assert '—' in result['zero']
 assert not errors,errors;browser.close()
print('PASS independent yearly TOP5, full-keyword denominator, open/close/switch, empty keyword, adjustments and escaping')
