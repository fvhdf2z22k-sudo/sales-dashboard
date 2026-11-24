from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
rows=[]
for year in [2025,2026]:
 for i,(name,cat) in enumerate([('구스이불','12082800'),('양모 침구 세트','1208'),('이불 베개 세트','12081700'),('흙침대 SS','12021100'),('돌소파','12020200'),('흙소파','120202'),('벽시계','1208'),('롤스크린','12080104'),('블라인드 부품','12080104'),('침대 SS+SS','12022300'),('모션 매트리스 Q','12023500'),('요 패드','12082800'),('롱쿠션','12081700'),('암막커튼','120801'),('현관매트','120813'),('침대 Q/K','120211'),('깔판 XS','12021100')]):
  rows.append(dict(channel='enuri',year=year,date=f'{year}-11-'+('02' if year==2025 else '01'),name=name,cat=cat,rev=100,qty=1,brand='브랜드',mall='몰',pid=str(i)))

with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def serve(r):
  path=r.request.url.split('http://dashboard.test/')[1].split('?')[0]
  if path=='data/public.json':r.fulfill(json={'version':30,'rows':rows,'audit':[],'internalSnapshots':[]})
  else:r.fulfill(path=str(ROOT/path))
 page.route('http://dashboard.test/**',serve);page.goto('http://dashboard.test/index.html');page.wait_for_function('()=>publicReady')
 actual=page.evaluate('data.filter(r=>r.year===2026).map(r=>[r.cat,r.sub,r.det])')
 assert actual==[['12082800','침구','이불/패드/커버'],['1208','침구','이불/패드/커버'],['12081700','침구','이불/패드/커버'],['12021100','침대','돌/침대.소파'],['12020200','침대','돌/침대.소파'],['120202','침대','돌/침대.소파'],['1208','코드 없음','코드 없음'],['12080104','커튼/블라인드','커튼/블라인드'],['12080104','커튼/블라인드','커튼/블라인드'],['12022300','침대','패밀리침대'],['12023500','침대','모션베드'],['12082800','침구','이불/패드/커버'],['12081700','침구','베개'],['120801','커튼/블라인드','커튼/블라인드'],['120813','카페트/대자리','카페트/대자리'],['120211','침대','킹(K)'],['12021100','침대','싱글(S)']]
 assert page.evaluate('[lastContext.ra,lastContext.rb]')==[1700,1700]
 audit=page.evaluate('categoryAudit(context())');assert '상품명으로 보완' in audit and '분석 적용 소분류' in audit and '돌/침대.소파' in audit
 report=page.evaluate('makeReport(context(),{products:false}).text');assert '패밀리침대' in report and '모션베드' in report and '커튼/블라인드' in report and '돌/침대.소파' in report and '이불/패드/커버' in report
 assert page.evaluate('sum(data)')==3400
 page.select_option('#section','침구/커튼/카페트');page.select_option('#subcategory',label='침구')
 assert page.evaluate('[lastContext.ra,lastContext.rb]')==[500,500]
 assert not errors and not page.locator('#error').inner_text(),errors
 b.close()
print('PASS bedding/pillow/stone-sofa classification, original codes and totals, provenance, reports and subcategory filters')
