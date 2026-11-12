"""Product tab brand aggregation, full-scope shares, independent searches and CSV."""
from pathlib import Path
import csv,io
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
rows=[]
def add(year,brand,rev,name='상품',ch='danawa',mid='침구/커튼/카페트'):
 rows.append(dict(channel=ch,year=year,date=f'{year}-10-'+('02' if year==2025 else '01'),rev=rev,qty=1,brand=brand,mall='몰',name=name,pid=name+brand,mid=mid,sub='침구' if mid=='침구/커튼/카페트' else '매트리스',det='기타',cat='12082802' if ch=='enuri' else ''))
add(2025,'A',100);add(2026,'A',70);add(2026,'A',50,'다른 상품');add(2025,'B',100);add(2026,'B',100);add(2026,'B',-20,'음수 조정');add(2025,'C',50);add(2026,'',20)
for year,rev in [(2025,50),(2026,100)]:add(year,'A',rev,ch='enuri');add(year,'가구브랜드',10,mid='침실가구')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def serve(r):
  path=r.request.url.split('http://dashboard.test/')[1].split('?')[0]
  if path=='data/public.json':r.fulfill(json={'version':30,'rows':rows,'audit':[],'internalSnapshots':[]})
  else:r.fulfill(path=str(ROOT/path))
 page.route('http://dashboard.test/**',serve);page.goto('http://dashboard.test/index.html');page.wait_for_function('()=>publicReady');page.select_option('#section','침구/커튼/카페트');page.select_option('#channel','danawa');page.locator('[data-tab="products"]').click();assert not page.locator('#error').inner_text()
 table=page.locator('#product-brand-table');assert table.locator('tbody tr').count()==4
 a=table.locator('tbody tr').filter(has=page.locator('td:first-child',has_text='A')).first
 cells=a.locator('td');assert cells.nth(1).inner_text()=='100' and cells.nth(3).inner_text()=='120';assert cells.nth(2).inner_text()=='40.0%' and cells.nth(4).inner_text()=='54.5%'
 assert '미확인' in table.inner_text()
 with page.expect_download() as dl:page.locator('#product-brand-csv').click()
 records=list(csv.reader(io.StringIO(Path(dl.value.path()).read_text('utf-8-sig'))));assert len(records)==5
 assert sum(float(r[8]) for r in records[1:])==250;assert sum(float(r[10]) for r in records[1:])==220
 page.locator('#product-brand-search').fill('A');page.locator('#product-brand-search').dispatch_event('change');assert table.locator('tbody tr').count()==1;assert '54.5%' in table.inner_text()
 page.locator('#product-search').fill('없는상품');page.locator('#product-search').dispatch_event('change');assert table.locator('tbody tr').count()==1
 with page.expect_download() as dl:page.locator('#product-brand-csv').click()
 filtered=list(csv.reader(io.StringIO(Path(dl.value.path()).read_text('utf-8-sig'))));assert len(filtered)==2 and float(filtered[1][10])==120
 page.locator('#product-brand-search').fill('');page.locator('#product-brand-search').dispatch_event('change');page.select_option('#product-brand-order','down');assert table.locator('tbody tr').first.locator('td').first.inner_text()=='C'
 page.select_option('#channel','enuri');assert table.locator('tbody tr').count()==1 and '100.0%' in table.inner_text()
 page.select_option('#channel','danawa');page.select_option('#section','침실가구');assert table.locator('tbody tr').count()==1 and '가구브랜드' in table.inner_text()
 assert not errors,errors;b.close()
print('PASS brand totals and signed adjustments, unknown brand, channel/category filters, scope shares, independent search/sort and CSV')
