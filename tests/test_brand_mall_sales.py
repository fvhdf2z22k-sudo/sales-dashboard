"""Brand-to-mall drill-down must reconcile to the selected brand, not all brands."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import csv,io
ROOT=Path(__file__).resolve().parents[1]
rows=[]
def add(year,brand,mall,rev,ch='danawa',mid='침구/커튼/카페트'):
 rows.append(dict(channel=ch,year=year,date=f'{year}-10-'+('02' if year==2025 else '01'),rev=rev,qty=1 if rev>=0 else -1,brand=brand,mall=mall,name='상품'+brand,pid=brand+mall,mid=mid,sub='침구' if mid=='침구/커튼/카페트' else '매트리스',det='기타',cat='12082802' if ch=='enuri' else ''))
add(2025,'A','X',60);add(2025,'A','Y',40);add(2026,'A','X',20);add(2026,'A','Y',100);add(2026,'A','Y',-10);add(2026,'A','Z',30);add(2026,'A','',5)
for year in [2025,2026]:add(year,'B','X',999);add(year,'A','X',60,ch='enuri');add(year,'가구브랜드','가구몰',7,mid='침실가구')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def serve(r):
  path=r.request.url.split('http://dashboard.test/')[1].split('?')[0]
  if path=='data/public.json':r.fulfill(json={'version':30,'rows':rows,'audit':[],'internalSnapshots':[]})
  else:r.fulfill(path=str(ROOT/path))
 page.route('http://dashboard.test/**',serve);page.goto('http://dashboard.test/index.html');page.wait_for_function('()=>publicReady');assert page.locator('[data-tab="products"]').inner_text()=='브랜드 분석'
 page.select_option('#section','침구/커튼/카페트');page.select_option('#channel','danawa');page.locator('[data-tab="products"]').click();page.select_option('#brand-mall-brand','A');table=page.locator('#brand-mall-table')
 assert table.locator('tbody tr').count()==4
 first=table.locator('tbody tr').first;assert first.locator('td').first.inner_text()=='Y';assert first.locator('td').nth(3).inner_text()=='90';assert first.locator('td').nth(4).inner_text()=='62.1%'
 assert '미확인' in table.inner_text()
 with page.expect_download() as dl:page.locator('#brand-mall-csv').click()
 csvrows=list(csv.reader(io.StringIO(Path(dl.value.path()).read_text('utf-8-sig'))));assert len(csvrows)==5;assert all(r[7]=='A' for r in csvrows[1:]);assert sum(float(r[9]) for r in csvrows[1:])==100;assert sum(float(r[11]) for r in csvrows[1:])==145
 page.select_option('#brand-mall-order','down');assert table.locator('tbody tr').first.locator('td').first.inner_text()=='X'
 page.locator('[data-brand-mall="B"]').click();assert page.locator('#brand-mall-brand').input_value()=='B';assert table.locator('tbody tr').count()==1 and '100.0%' in table.inner_text()
 page.locator('[data-brand-mall="A"]').click();page.select_option('#channel','enuri');assert page.locator('#brand-mall-brand').input_value()=='A';assert table.locator('tbody tr').count()==1 and '100.0%' in table.inner_text()
 page.select_option('#channel','danawa');page.select_option('#section','침실가구');assert page.locator('#brand-mall-brand').input_value()=='가구브랜드';assert '가구몰' in table.inner_text() and 'Y' not in table.inner_text()
 assert not page.locator('#error').inner_text() and not errors,errors;b.close()
print('PASS renamed tab, brand click/select, mall ranking and brand-only shares, refunds/unknowns, filter reset and CSV reconciliation')
