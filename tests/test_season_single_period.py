"""Single-period seasonal shares must work independently of global comparison dates."""
from pathlib import Path
import csv,io
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
def row(ch,date,name,rev,**kw):return dict(channel=ch,date=date,year=int(date[:4]),name=name,brand='검증브랜드',rev=rev,qty=1,mid='침구/커튼/카페트',sub='침구',mall='테스트몰',pid=name,**kw)
rows=[row('danawa','2025-11-15','구스 이불',100),row('danawa','2025-11-20','일반 이불',300),row('danawa','2025-10-15','구스 이불',900),row('danawa','2026-10-15','구스 이불',50),row('enuri','2025-11-15','구스 이불',200,cat='12082802'),row('enuri','2025-11-20','일반 이불',200,cat='12082802'),{**row('danawa','2025-11-15','구스 커튼',10000),'sub':'커튼/블라인드'}]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def serve(r):
  path=r.request.url.split('http://dashboard.test/')[1].split('?')[0]
  if path=='data/public.json':r.fulfill(json={'version':30,'rows':rows,'audit':[],'internalSnapshots':[]})
  else:r.fulfill(path=str(ROOT/path))
 page.route('http://dashboard.test/**',serve);page.goto('http://dashboard.test/index.html');page.wait_for_function('()=>publicReady')
 # Even equal global comparison years cannot block this view.
 page.evaluate("()=>{$('current').value='2025';$('previous').value='2025';}")
 page.locator('[data-tab="season"]').click();assert not page.locator('#error').inner_text()
 page.select_option('#season-single-year','2025');page.select_option('#season-single-month','11')
 assert page.locator('#season-single-start').input_value()=='2025-11-01';assert page.locator('#season-single-end').input_value()=='2025-11-30'
 def goose():return page.locator('[data-single-keyword="구스"]').locator('xpath=ancestor::tr[1]').inner_text()
 assert '37.5%' in goose(),goose() # 300 / 800; no October rows or curtains in denominator
 page.select_option('#channel','danawa');assert page.locator('#season-single-start').input_value()=='2025-11-01';assert '25.0%' in goose(),goose()
 assert '브랜드 TOP5' in page.locator('#view').inner_text()
 with page.expect_download() as dl:page.locator('#csv').click()
 assert dl.value.suggested_filename=='시즌상품_2025-11-01_2025-11-30.csv'
 text=Path(dl.value.path()).read_text('utf-8-sig');records=list(csv.reader(io.StringIO(text)));r=next(r for r in records[1:] if r[3]=='구스');assert r[0:2]==['2025-11-01','2025-11-30'] and float(r[6])==25
 page.locator('#season-single-start').fill('2025-11-16');page.locator('#season-single-start').dispatch_event('change');page.locator('#season-single-end').fill('2025-11-30');page.locator('#season-single-apply').click();assert '0.0%' in goose()
 page.locator('#season-single-start').fill('2024-02-01');page.locator('#season-single-start').dispatch_event('change');page.locator('#season-single-end').fill('2024-02-29');page.locator('#season-single-apply').click();assert '이 기간에 조회할 침구 자료가 없습니다' in page.locator('#view').inner_text();assert '—' in goose()
 page.select_option('#season-single-month','2');assert page.locator('#season-single-end').input_value()=='2024-02-29'
 page.locator('#season-single-start').fill('2025-12-01');page.locator('#season-single-apply').click();assert '올바른 조회 시작일' in page.locator('#view').inner_text()
 page.select_option('#season-period-mode','compare');assert '서로 다른 비교 연도' in page.locator('#error').inner_text();page.select_option('#season-period-mode','single');assert not page.locator('#error').inner_text()
 assert not errors,errors;b.close()
print('PASS November 2025, whole-bedding denominator, independent comparison/channel/date filters, CSV, missing data, leap month and recovery')
