"""실행: python tests/test_season.py (Playwright + Chromium 필요). 실데이터를 변경하지 않음."""
from pathlib import Path
from urllib.parse import urlparse,unquote
from playwright.sync_api import sync_playwright
import json
ROOT=Path(__file__).resolve().parents[1]
BASE={'channel':'danawa','brand':'테스트','mall':'테스트몰','mid':'침구/커튼/카페트','sub':'침구','det':'이불/패드/커버','cat':'','reg':'','rank':0,'sid':'','source':'synthetic.xls'}
def row(name,rev,qty=1,year=2026,**more):
 return {**BASE,'name':name,'rev':rev,'qty':qty,'year':year,'date':f'{year}-10-'+('02' if year==2025 else '01'),'pid':name,**more}
rows=[row('냉감 여름 시어서커 쿨 패드',100,2),row('구스 극세사 겨울 양모 울 이불',200,4),row('냉감 구스 혼합 이불',300,3),row('일반 면 이불',400,4),row('냉감 반품',-10,-1),row('서울 면이불',10),row('울트라 면이불',20),row('방울 면이불',30),row('메리노울 이불',40),row('여름 커튼',50,sub='커튼/블라인드'),row('냉감 매트리스',1000,mid='침실가구',sub='매트리스'),row('냉감 여름 시어서커 쿨 패드',80,2,year=2025),row('구스 극세사 겨울 양모 울 이불',100,2,year=2025),row('일반 면 이불',100,1,year=2025),row('일반 면 이불',0,0,date='2026-10-15'),row('일반 면 이불',0,0,year=2025,date='2025-10-16')]
payload={'version':30,'rows':rows,'audit':[],'internalSnapshots':[]}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1440,'height':1080});errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.method))
 def serve(route):
  path=unquote(urlparse(route.request.url).path).removeprefix('/sales-dashboard/') or 'index.html'
  if path=='data/public.json':route.fulfill(json=payload);return
  file=(ROOT/path).resolve();assert file.is_relative_to(ROOT);route.fulfill(path=str(file),content_type='text/javascript' if path.endswith('.js') else 'text/html')
 page.route('http://dashboard.test/sales-dashboard/**',serve);page.goto('http://dashboard.test/sales-dashboard/');page.wait_for_function('()=>publicReady');page.locator('[data-tab="season"]').click()
 for name,expected in [('냉감 쿨 시어서커 여름','summer'),('구스 극세사 겨울 울 양모','winter'),('냉감 구스','mixed'),('서울 울트라 방울 거울 저울 울산 울릉 울타리','other'),('겨울','winter'),('메리노울','winter'),('일반 면이불','other')]:
  assert page.evaluate('(n)=>seasonMatchName(n).group',name)==expected,name
 matched=page.evaluate('seasonAnalysis(lastContext,"all","bedding")')
 assert matched['rb']==630 and matched['ra']==180,(matched['rb'],matched['ra'])
 totals={r['key']:r['b'] for r in matched['groups']};assert totals=={'summer':90,'winter':240,'mixed':300,'other':460},totals
 assert sum(totals.values())==sum(r['rev'] for r in matched['baseB'])
 assert page.evaluate('seasonAnalysis(lastContext,"all","all-bedding").rb')==680
 print('KEYWORDS, WOOL FALSE POSITIVES, MIXED SINGLE COUNT, SCOPE, NEGATIVE ROW, PARTITION TOTALS PASS',flush=True)
 for mode in ['weekday','calendar']:
  page.select_option('#comparison',mode)
  for scope in ['bedding','all-bedding']:
   page.select_option('#season-scope',scope)
   for selection in ['summer','winter','mixed','all']:
    page.select_option('#season-choice',selection);assert not page.locator('#error').inner_text()
    current=page.evaluate('seasonAnalysis(lastContext)');chart=page.evaluate('charts[0].data.datasets.map(d=>d.data.reduce((s,n)=>s+n,0))');assert abs(chart[0]-current['ra'])<.001 and abs(chart[1]-current['rb'])<.001
    exported=page.evaluate('exportRows');assert abs(sum(r[15] for r in exported)-current['rb'])<.001
 with page.expect_download() as dl:page.locator('#csv').click()
 temp=Path('/tmp/season-export.csv');dl.value.save_as(str(temp));csv=temp.read_text(encoding='utf-8-sig');assert '당년매칭키워드' in csv and '구스' in csv
 print('16 MODE/SCOPE/SEASON COMBINATIONS, DAILY CHART TOTALS, PRODUCT TOTALS, CSV PASS',flush=True)
 page.select_option('#section','침실가구');assert '자료가 없습니다' in page.locator('#view').inner_text();page.locator('#season-reset-filter').click();assert page.locator('#section').input_value()=='침구/커튼/카페트'
 page.select_option('#subcategory',label='침구');assert all(r['sub']=='침구' for r in page.evaluate('seasonAnalysis(lastContext).baseB'))
 # Published data stays unchanged and the public site makes no write requests.
 assert page.evaluate('draftDirty')==False;assert all(m=='GET' for m in requests)
 # Actual published file regression, including all channels and both season selections.
 payload=json.loads((ROOT/'data/public.json').read_text());page.locator('#public-reload').click();page.wait_for_function('(n)=>data.length===n',arg=len(payload['rows']))
 for ch in ['all','danawa','enuri']:
  page.select_option('#channel',ch);page.select_option('#section','침구/커튼/카페트');page.select_option('#subcategory',label='침구')
  for selection in ['summer','winter','mixed','all']:
   page.select_option('#season-choice',selection);assert not page.locator('#error').inner_text();actual=page.evaluate('seasonAnalysis(lastContext)');assert abs(sum(r['b'] for r in actual['groups'])-sum(r['rev'] for r in actual['baseB']))<.01
 for tab in ['overview','malls','products','structure','report','internal','quality','season']:
  page.locator('[data-tab="'+tab+'"]').click();assert not page.locator('#error').inner_text()
 assert not errors,errors
 print('PARENT/SUB FILTERS, PUBLIC READONLY, ACTUAL PUBLISHED DATA, LEGACY TABS PASS',flush=True)
 browser.close()
