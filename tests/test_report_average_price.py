"""Report unit prices: weighted totals, precise changes, missing quantities and exports."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
rows=[]
for year,rev,qty in [(2025,100000,4),(2026,120000,3)]:
 rows.append(dict(channel='danawa',year=year,date=f'{year}-10-'+('02' if year==2025 else '01'),rev=rev,qty=qty,brand='브랜드A',mall='몰A',name='구스 이불',pid='A',mid='침구/커튼/카페트',sub='침구',det='이불'))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def serve(route):
  path=route.request.url.split('http://dashboard.test/')[1].split('?')[0]
  if path=='data/public.json':route.fulfill(json={'version':30,'rows':rows,'audit':[],'internalSnapshots':[]})
  else:route.fulfill(path=str(ROOT/path))
 page.route('http://dashboard.test/**',serve);page.goto('http://dashboard.test/index.html');page.wait_for_function('()=>publicReady')
 page.locator('[data-tab="report"]').click()
 expected='전년 25,000원 → 당년 40,000원 / 증감액 +15,000원 / 증감률 +60.0% (매출÷판매수량)'
 for format in ['category']:
  page.select_option('#report-format',format)
  text=page.locator('#report-text').input_value()
  assert expected in text and expected in page.locator('#report-rich').inner_text()
  assert '브랜드A' in text and '몰A' in text and '구스 이불' in text
  if format=='category':
   nodes=page.evaluate('makeReport(context(),{products:false}).nodes')
   assert {n['depth'] for n in nodes}=={0,1,2}
   assert all(expected in '\n'.join(n['lines']) for n in nodes)
   for n in nodes:
    i=next(i for i,line in enumerate(n['lines']) if '◈ 매출 분해:' in line)
    assert '전체 평균 판매단가: '+expected in n['lines'][i+1]
    assert all('평균 판매단가' not in line for line in n['lines'] if any(marker in line for marker in ['▲ 브랜드','▼ 브랜드','▲ 쇼핑몰','▼ 쇼핑몰']))
   seasonal=page.evaluate("seasonReportLines(context()).join('\\n')")
   assert '평균 판매단가' not in seasonal
  for button in ['#report-txt','#report-html']:
   with page.expect_download() as dl:page.locator(button).click()
   assert expected in Path(dl.value.path()).read_text('utf-8-sig')
 page.select_option('#report-format','detailed')
 assert expected not in page.locator('#report-text').input_value()
 cases=page.evaluate('''()=>[
 reportAveragePrice(100,200,0,2),reportAveragePrice(100,200,2,0),
 reportAveragePrice(0,0,0,-1),reportAveragePrice(0,200,2,2),
 reportAveragePrice(100000,50000,4,4),reportAveragePrice(100001,120000,3,3),
 reportAveragePrice(100000,100000,4,4)]''')
 assert cases[0].startswith('전년 산출 불가') and '당년 100원' in cases[0] and '증감 비교 불가' in cases[0]
 assert '당년 산출 불가' in cases[1] and '증감 비교 불가' in cases[2]
 assert '전년 비교 기준 없음' in cases[3]
 assert '증감액 -12,500원 / 증감률 -50.0%' in cases[4]
 assert '전년 33,334원 → 당년 40,000원 / 증감액 +6,666원' in cases[5]
 assert '증감액 0원 / 증감률 0.0%' in cases[6]
 assert not errors and not page.locator('#error').inner_text(),errors
 b.close()
print('PASS report category/detail prices, weighted totals, all category depths, TXT/HTML, zero/negative quantities, zero baseline, decline, unchanged and rounding')
