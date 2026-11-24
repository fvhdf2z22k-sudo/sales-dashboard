const fs=require('fs'),vm=require('vm'),assert=require('assert');
vm.runInThisContext(fs.readFileSync('assets/categories.js','utf8'));
for(const [code,name,sub,det] of [
 ['12082800','순면 폴란드 구스이불 SS','침구','이불/패드/커버'],
 ['1208','삶아쓰는 양모 침구 세트 Q','침구','이불/패드/커버'],
 ['12081700','오리지날 베개 S','침구','베개'],
 ['120816','이불 베개 세트 Q','침구','이불/패드/커버'],
 ['120816','차렵이불 베개 구성','침구','이불/패드/커버'],
 ['12080104','롤스크린 30x30','커튼/블라인드','커튼/블라인드'],
 ['12080104','블라인드 부품','커튼/블라인드','커튼/블라인드'],
 ['12022300','침대 SS+SS+패널','침대','패밀리침대'],
 ['12021100','침대 S + Q','침대','패밀리침대'],
 ['12023500','모션 매트리스 Q','침대','모션베드'],
 ['120828','베개커버','침구','베개'],
 ['12020200','다하스 돌소파 MS','침대','돌/침대.소파'],
 ['12021100','미암 흙침대 SS','침대','돌/침대.소파'],
 ['1202','황토 흙-쇼파 카우치','침대','돌/침대.소파']]){
 const r=_categoryFromName(code,name);assert.equal(r.sub,sub);assert.equal(r.det,det);
}
for(const [code,name] of [['12082802','이불 베개 세트'],['12021105','흙침대'],['12020406','돌소파'],['1208','벽시계'],['12020200','소파'],['12081700','쿠션'],['12021100','침대 SS/Q'],['12021100','침대 XS+XS'],['12021100','모델 Q4+S4'],['99170000','베개']])assert.equal(_categoryFromName(code,name),null);
const rows=JSON.parse(fs.readFileSync('data/public.json')).rows.filter(r=>r.channel==='enuri'&&r.date>='2025-11-02'&&r.date<='2025-11-23');
const counts={};for(const r of rows){const c=_categoryFromName(r.cat,r.name);if(c)counts[c.det]=(counts[c.det]||0)+1;}console.log('PASS name rules, pillow priority, known-code priority, scope and unrelated products; prior period corrected rows:',counts);
