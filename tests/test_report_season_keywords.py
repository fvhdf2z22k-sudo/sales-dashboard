"""Season report: nonoverlapping groups, overlapping keywords, scoped denominators and exports."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
rows=[]
def add(ch,year,name,rev,mall='몰A',**kw):
 rows.append(dict(channel=ch,year=year,date=f'{year}-10-'+('02' if year==2025 else '01'),name=name,rev=rev,qty=2,brand='브랜드'+name,mall=mall,mid='침구/커튼/카페트',sub='침구',det='이불',pid=name,cat='12082802' if ch=='enuri' else '',**kw))
for year,s,w,m,n in [(2025,100,200,50,650),(2026,200,100,100,600)]:
 add('danawa',year,'냉감 여름 이불',s);add('danawa',year,'구스 겨울 이불',w);add('danawa',year,'냉감 구스 혼합',m);add('danawa',year,'일반 이불',n,'몰B');add('danawa',year,'구스 커튼',999);rows[-1]['sub']='커튼/블라인드'
 add('enuri',year,'구스 이불',400 if year==2025 else 800);add('enuri',year,'일반 이불',600 if year==2025 else 200)
 add('danawa',year,'침대',1000);rows[-1]['mid']='침실가구';rows[-1]['sub']='침대'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def serve(r):
  path=r.request.url.split('http://dashboard.test/')[1].split('?')[0]
  if path=='data/public.json':r.fulfill(json={'version':30,'rows':rows,'audit':[],'internalSnapshots':[]})
  else:r.fulfill(path=str(ROOT/path))
 page.route('http://dashboard.test/**',serve);page.goto('http://dashboard.test/index.html');page.wait_for_function('()=>publicReady');page.select_option('#section','침구/커튼/카페트');page.locator('[data-tab="report"]').click()
 assert not page.locator('#error').inner_text()
 text=page.locator('#report-text').input_value();assert text.count('[다나와] 침구 시즌 키워드 분석')==1 and text.count('[에누리] 침구 시즌 키워드 분석')==1
 block=page.evaluate("()=>seasonReportLines(context()).join('\\n')")
 assert '구스: 거래액 250원 → 200원' in block,block
 assert '전체 침구 대비 25.0% → 20.0%' in block
 assert '여름 키워드 상품 (혼합 제외): 거래액 100원 → 200원' in block
 assert '겨울 키워드 상품 (혼합 제외): 거래액 200원 → 100원' in block
 assert '여름·겨울 혼합 상품: 거래액 50원 → 100원' in block
 assert '여름 키워드별 실적' in block and '겨울 키워드별 실적' in block and '합산하지 않습니다' in block
 scoped=page.evaluate("()=>seasonReportLines(context(),{mall:'몰A'}).join('\\n')");assert '전체 침구 대비 71.4% → 50.0%' in scoped
 page.select_option('#report-format','detailed');assert '침구 시즌 키워드 분석' in page.locator('#report-text').input_value()
 for selector,extension in [('#report-txt','.txt'),('#report-html','.html')]:
  with page.expect_download() as dl:page.locator(selector).click()
  assert dl.value.suggested_filename.endswith(extension);exported=Path(dl.value.path()).read_text('utf-8-sig');assert '침구 시즌 키워드 분석' in exported and '겨울 키워드별 실적' in exported
 page.select_option('#section','침실가구');assert '침구 시즌 키워드 분석' not in page.locator('#report-text').input_value()
 page.select_option('#section','침구/커튼/카페트');page.select_option('#subcategory',label='커튼/블라인드');assert '해당하는 침구 판매 자료가 없어' in page.locator('#report-text').input_value()
 assert not errors,errors;b.close()
print('PASS season report groups/keywords, channel/mall scope, whole-bedding denominator, detailed/category formats, TXT/HTML exports, nonbedding exclusion')
