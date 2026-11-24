from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
rows=[]
for year in [2025,2026]:
 for i,(name,cat) in enumerate([('침대 SS','12021100'),('침대 Q','12021100'),('침대 SS/Q','12021100'),('침대 Q','12021105'),('침대','12021100')]):
  rows.append(dict(channel='enuri',year=year,date=f'{year}-11-'+('02' if year==2025 else '01'),name=name,cat=cat,rev=100*(i+1),qty=1,brand='브랜드',mall='몰',pid=str(i)))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def serve(r):
  path=r.request.url.split('http://dashboard.test/')[1].split('?')[0]
  if path=='data/public.json':r.fulfill(json={'version':30,'rows':rows,'audit':[],'internalSnapshots':[]})
  else:r.fulfill(path=str(ROOT/path))
 page.route('http://dashboard.test/**',serve);page.goto('http://dashboard.test/index.html');page.wait_for_function('()=>publicReady')
 actual=page.evaluate('data.filter(r=>r.year===2026).map(r=>[r.cat,r.det,r.categoryBasis])')
 assert actual==[['12021100','슈퍼싱글(SS)','상품명 크기 보완'],['12021100','퀸(Q)','상품명 크기 보완'],['12021100','미확인 (00)','원본 코드'],['12021105','슈퍼싱글(SS)','원본 코드'],['12021100','미확인 (00)','원본 코드']]
 assert page.evaluate('[lastContext.ra,lastContext.rb]')==[1500,1500]
 audit=page.evaluate('categoryAudit(context())');assert '상품명으로 보완' in audit and '원본 세부 분류' in audit and '미확인 (00)' in audit
 report=page.evaluate('makeReport(context(),{products:false}).text');assert '슈퍼싱글(SS)' in report and '퀸(Q)' in report and '미확인 (00)' in report
 assert page.evaluate('sum(data)')==3000
 assert not errors and not page.locator('#error').inner_text(),errors
 b.close()
print('PASS corrected analysis detail, unchanged raw codes/totals, audit provenance, category reports and ambiguous names')
