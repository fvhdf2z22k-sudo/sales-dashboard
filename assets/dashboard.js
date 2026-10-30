'use strict';
const BUILTIN=[],AUDIT=[];
const IS_EDITOR=document.body.dataset.mode==='editor';
let draftDirty=false,publishedText='',publicLoading=false,publicReady=false;
const PUBLIC_DATA_URL=new URL('data/public.json',document.baseURI);
const DRAFT_KEY='sales-dashboard-local-draft-v1';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>Number.isFinite(n)?Math.round(n).toLocaleString('ko-KR'):'—', signed=n=>(n>0?'+':'')+won(n), ratio=(a,b)=>a>0?(b-a)/a*100:null;
const percent=n=>n===null?'비교 기준 없음':(n>0?'+':'')+n.toFixed(1)+'%', cls=n=>n>=0?'up':'down';
const sum=(r,k='rev')=>r.reduce((s,x)=>s+x[k],0), cname=c=>c==='danawa'?'다나와':'에누리';
const goodDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const normalizedDate=s=>{s=String(s||'').trim().split(/[ T]/)[0].replace(/[/.]/g,'-');const m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:s;};
function clean(r){
 const x={...r};x.date=normalizedDate(x.date);x.reg=normalizedDate(x.reg);x.year=goodDate(x.date)?+x.date.slice(0,4):+x.year;
 if(x.channel==='enuri'){
  const c=_decodeCatStr(String(x.cat));x.mid=c.mid;x.sub=c.sub;x.det=c.det;
  x.major=c.major;x.catParts=c.parts;x.categoryKnown=c.known;
  const malls={536:'G마켓',4027:'옥션',5910:'11번가',7861:'쿠팡',47:'신세계몰',49:'롯데ON',663:'롯데홈쇼핑',57:'현대Hmall',75:'GS SHOP',6252:'하이마트',29297:'오늘의집'};
  x.mall=malls[x.mall]||x.mall||'미확인';
 }
 if(x.mid==='침대/매트리스')x.mid='침실가구';
 x.mid=x.mid||'미분류';x.sub=x.sub||'미분류';x.det=x.det||'미분류';x.brand=x.brand||'미확인';x.name=x.name||'미확인';x.mall=x.mall||'미확인';
 const pid=x.pid&& !/^0+$/.test(x.pid)?x.pid:'';
 // Catalog IDs are channel-scoped. Without one, a mall-scoped merchant code is safer than a product name.
 x.productKey=JSON.stringify([x.channel,pid?'catalog':x.sid?'merchant':'name',pid|| (x.sid?x.mall+'|'+x.sid:x.brand+'|'+x.name)]);
 x.matchType=pid?'상품코드':x.sid?'쇼핑몰 상품코드':'상품명';return x;
}
let data=BUILTIN.map(clean),audit=AUDIT.slice(),tab='overview',charts=[],exportRows=[],exportHeaders=[],lastContext=null;
const INTERNAL_KEYS=['major','mid','sub','det'];
let internalSnapshots=[];
const STORE='furniture_sales_v30_user_data';
let restoreError='';
if(IS_EDITOR){try{const saved=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');if(saved?.payload){const payload=checkPublicPayload(saved.payload);data=payload.rows.map(clean);audit=payload.audit;internalSnapshots=payload.internalSnapshots;draftDirty=!!saved.dirty;}}catch(e){restoreError='이 브라우저의 편집 초안을 복원하지 못했습니다. JSON 백업을 불러와 주세요.';}}
function validateRows(rows){if(!Array.isArray(rows)||rows.length>200000)throw Error('데이터 행 수를 확인해 주세요.');for(const r of rows)if(!['danawa','enuri'].includes(r.channel)||!goodDate(normalizedDate(r.date))||!Number.isFinite(r.rev)||!Number.isFinite(r.qty)||r.qty<0&&r.rev>0)throw Error('채널·날짜·매출·수량이 올바르지 않은 행이 있습니다.');}
function saveData(){if(!IS_EDITOR){$('error').textContent='공개 자료는 GitHub 저장소 소유자만 변경할 수 있습니다.';return false;}draftDirty=true;try{localStorage.setItem(DRAFT_KEY,JSON.stringify({dirty:true,payload:currentPayload()}));updatePublicStatus('이 브라우저의 편집 초안입니다. 아직 공개 자료에 반영되지 않았습니다.');return true;}catch(e){$('error').textContent='초안 저장 공간이 부족합니다. 공개 자료용 JSON을 내려받아 보관하세요.';return false;}}
function selectedSubcategory(){const value=$('subcategory').value;return value==='all'?null:JSON.parse(value);}
function subcategoryLabel(){return $('subcategory').selectedOptions[0]?.text||'전체 소분류';}
function updateSubcategories(){
 const old=$('subcategory').value,rows=data.filter(r=>($('channel').value==='all'||r.channel===$('channel').value)&&($('section').value==='all'||r.mid===$('section').value));
 const values=[...new Set(rows.map(r=>JSON.stringify([r.mid,r.sub])))].sort((a,b)=>a.localeCompare(b,'ko'));
 $('subcategory').innerHTML='<option value="all">전체 소분류</option>'+values.map(v=>{const [mid,sub]=JSON.parse(v);return `<option value="${esc(v)}">${esc($('section').value==='all'?mid+' / '+sub:sub)}</option>`;}).join('');
 if(values.includes(old))$('subcategory').value=old;
}
function filteredBase(ignoreSub=false){const sub=ignoreSub?null:selectedSubcategory();return data.filter(r=>($('channel').value==='all'||r.channel===$('channel').value)&&($('section').value==='all'||r.mid===$('section').value)&&(!sub||r.mid===sub[0]&&r.sub===sub[1]));}
function setupSelectors(){
 const years=[...new Set(data.map(r=>r.year))].sort((a,b)=>b-a);if(!years.length){const year=new Date().getFullYear();years.push(year,year-1);}for(const id of ['current','previous'])$(id).innerHTML=years.map(y=>`<option>${y}</option>`).join('');
 $('current').value=years[0];$('previous').value=years[1]??years[0];
 $('section').innerHTML='<option value="all">전체</option>'+[...new Set(data.map(r=>r.mid))].sort().map(s=>`<option>${esc(s)}</option>`).join('');updateSubcategories();resetRange();
}
const DAY_MS=86400000;
function shiftDate(date,days){return new Date(Date.parse(date+'T00:00:00Z')+days*DAY_MS).toISOString().slice(0,10);}
function comparisonPeriod(start,end,previousYear,mode=$('comparison').value){
 const days=(Date.parse(end)-Date.parse(start))/DAY_MS;
 let ps=previousYear+start.slice(4);
 if(mode==='weekday'){
  // Anchor at the closest same weekday to the prior-year calendar anniversary (±3 days).
  if(!goodDate(ps)&&start.slice(5)==='02-29')ps=previousYear+'-02-28';
  if(!goodDate(ps))throw Error('비교 기준일을 계산할 수 없습니다.');
  const weekday=d=>new Date(d+'T00:00:00Z').getUTCDay();
  let delta=(weekday(start)-weekday(ps)+7)%7;if(delta>3)delta-=7;
  ps=shiftDate(ps,delta);
  return {ps,pe:shiftDate(ps,days),mode,label:'동일 요일'};
 }
 const pe=previousYear+end.slice(4);
 if(!goodDate(ps)||!goodDate(pe))throw Error('비교 연도에 없는 날짜입니다. 동일 요일을 선택하거나 2월 29일을 조정해 주세요.');
 if((Date.parse(pe)-Date.parse(ps))/DAY_MS!==days)throw Error('윤년 차이로 두 기간의 일수가 다릅니다. 동일 요일 비교 또는 기간 조정이 필요합니다.');
 return {ps,pe,mode,label:'동일 날짜'};
}
function commonRange(){
 const base=filteredBase(true),y=+$('current').value,p=+$('previous').value,channels=$('channel').value==='all'?['danawa','enuri']:[$('channel').value];
 const current=[],previous=[],missing=[];
 for(const year of [y,p])for(const ch of channels){const ds=base.filter(r=>r.year===year&&r.channel===ch&&goodDate(r.date)).map(r=>r.date).sort();if(ds.length)(year===y?current:previous).push({start:ds[0],end:ds.at(-1)});else missing.push(year+' '+cname(ch));}
 if(!current.length)return {start:null,end:null,missing};
 let start=current.map(x=>x.start).sort().at(-1),end=current.map(x=>x.end).sort()[0];
 if($('comparison').value==='weekday'){
  const mapped=comparisonPeriod(start,start,p,'weekday'),offset=(Date.parse(start)-Date.parse(mapped.ps))/DAY_MS;
  for(const r of previous){const lo=shiftDate(r.start,offset),hi=shiftDate(r.end,offset);if(lo>start)start=lo;if(hi<end)end=hi;}
 }else{
  for(const r of previous){const lo=y+r.start.slice(4),hi=y+r.end.slice(4);if(lo>start)start=lo;if(hi<end)end=hi;}
 }
 if(start>end)return {start:null,end:null,missing};
 return {start:start.slice(5),end:end.slice(5),startFull:start,endFull:end,missing};
}
function resetRange(){const c=commonRange();$('start').value=c.startFull||'';$('end').value=c.endFull||'';render();}
function context(){
 const y=+$('current').value,p=+$('previous').value,s=$('start').value,e=$('end').value;
 if(y===p)throw Error('서로 다른 비교 연도를 선택해 주세요.');
 if(!goodDate(s)||!goodDate(e)||s>e||+s.slice(0,4)!==y||+e.slice(0,4)!==y)throw Error('기준 연도 안에서 올바른 시작일·종료일을 선택해 주세요.');
 const mapped=comparisonPeriod(s,e,p),{ps,pe}=mapped;
 const base=filteredBase(),a=base.filter(r=>r.date>=ps&&r.date<=pe),b=base.filter(r=>r.date>=s&&r.date<=e);
 return {y,p,s,e,...mapped,a,b,base,ra:sum(a),rb:sum(b),qa:sum(a,'qty'),qb:sum(b,'qty'),days:(Date.parse(e)-Date.parse(s))/DAY_MS+1};
}
function outsideCoverage(c){
 const channels=$('channel').value==='all'?['danawa','enuri']:[$('channel').value];
 for(const ch of channels)for(const [start,end] of [[c.s,c.e],[c.ps,c.pe]]){
  const ds=filteredBase(true).filter(r=>r.channel===ch&&r.year===+start.slice(0,4)).map(r=>r.date).sort();
  if(!ds.length||start<ds[0]||end>ds.at(-1))return true;
 }
 return false;
}
function group(rows,key){const m=new Map();for(const r of rows){const k=typeof key==='function'?key(r):r[key];if(!m.has(k))m.set(k,{key:k,rev:0,qty:0,rows:[],sample:r});const v=m.get(k);v.rev+=r.rev;v.qty+=r.qty;v.rows.push(r);}return m;}
function compare(a,b,key){const aa=group(a,key),bb=group(b,key);return [...new Set([...aa.keys(),...bb.keys()])].map(k=>{const x=aa.get(k),z=bb.get(k);return {key:k,a:x?.rev||0,b:z?.rev||0,qa:x?.qty||0,qb:z?.qty||0,diff:(z?.rev||0)-(x?.rev||0),sample:(z||x).sample,rowsA:x?.rows||[],rowsB:z?.rows||[],state:x&&z?'양년 판매':z?'선택 기간 신규 판매':'선택 기간 판매 없음'};});}
function table(headers,rows){return rows.length?`<div class="table"><table><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>'<tr>'+r.map(x=>`<td>${x}</td>`).join('')+'</tr>').join('')}</tbody></table></div>`:'<div class="empty">선택한 조건의 데이터가 없습니다.</div>';}
const panel=(title,body)=>`<section class="panel"><h2>${title}</h2>${body}</section>`;
function kpi(label,value,detail){return `<div class="card"><small>${label}</small><div class="value">${value}</div><div>${detail}</div></div>`;}
function chart(id,labels,sets,type='bar'){if(!$(id))return;charts.push(new Chart($(id),{type,data:{labels,datasets:sets.map((s,i)=>({label:s.label,data:s.data,backgroundColor:i?'#285ca0':'#a8b9cc',borderColor:i?'#285ca0':'#a8b9cc',borderWidth:2,tension:.15,pointRadius:2}))},options:{animation:false,responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'},tooltip:{callbacks:{label:c=>c.dataset.label+': '+won(c.parsed.y)+'원'}}},scales:{y:{beginAtZero:true,ticks:{callback:v=>Math.abs(v)>=1e8?(v/1e8).toFixed(1)+'억':Math.abs(v)>=1e4?(v/1e4).toFixed(0)+'만':v}}}}}));}
function setExport(headers,rows){exportHeaders=headers;exportRows=rows;}
function overview(c){
 const d=c.rb-c.ra,avgA=c.qa>0?c.ra/c.qa:null,avgB=c.qb>0?c.rb/c.qb:null;
 const decomp=avgA!==null&&avgB!==null?{vol:(c.qb-c.qa)*avgA,price:(avgB-avgA)*c.qb}:null;
 const ch=compare(c.a,c.b,'channel'),cats=compare(c.a,c.b,'mid');
 const rr=r=>[esc(r.key==='danawa'?'다나와':r.key==='enuri'?'에누리':r.key),won(r.a),won(r.b),`<span class="${cls(r.diff)}">${signed(r.diff)}</span>`,percent(ratio(r.a,r.b)),won(r.qa)+' → '+won(r.qb)];
 $('view').innerHTML=`<div class="cards">${kpi(c.y+'년 매출',won(c.rb)+'원',`<span class="${cls(d)}">${percent(ratio(c.ra,c.rb))} · ${signed(d)}원</span>`)}${kpi(c.p+'년 동기간 매출',won(c.ra)+'원',c.ps+' ~ '+c.pe)}${kpi('판매수량',won(c.qb)+'개',`${won(c.qa)}개 → ${won(c.qb)}개 · ${percent(ratio(c.qa,c.qb))}`)}${kpi('평균 판매단가',won(avgB)+'원',`${won(avgA)}원 → ${won(avgB)}원`)}</div>`+
 panel('매출 변화 요약',`<div class="notice">${c.label} ${c.days}일 기준, 매출은 ${d>=0?'증가':'감소'}했습니다. 전년 대비 <b>${signed(d)}원 (${percent(ratio(c.ra,c.rb))})</b>입니다.</div>${decomp?`<p>매출 증감 ${signed(d)}원 = 판매량 변화 ${signed(decomp.vol)}원 + 평균단가 변화 ${signed(decomp.price)}원</p><small>전년 평균단가를 고정한 판매량 효과 + 당년 판매량 기준 평균단가 효과입니다. 평균단가 효과에는 상품 구성 변화가 포함되며, 가격 인상·인하의 직접적인 증거가 아닙니다.</small>`:'<p>양년 판매수량이 양수일 때 매출 변화를 분해합니다.</p>'}`)+
 `<div class="grid">${panel('일별 매출 ('+c.label+' 비교)','<div class="chart"><canvas id="daily"></canvas></div>')}${panel('카테고리별 매출','<div class="chart"><canvas id="cats"></canvas></div>')}</div>`+
 panel('채널별 실적',table(['채널',c.p+'년 매출',c.y+'년 매출','증감액','증감률','판매수량'],ch.map(rr)))+panel('카테고리별 실적',table(['중분류',c.p+'년 매출',c.y+'년 매출','증감액','증감률','판매수량'],cats.map(rr)));
 const labels=[],a=[],b=[];for(let t=Date.parse(c.s);t<=Date.parse(c.e);t+=86400000){const dt=new Date(t).toISOString().slice(0,10),pd=shiftDate(c.ps,(t-Date.parse(c.s))/DAY_MS);labels.push(dt.slice(5)+' ↔ '+pd.slice(5));a.push(sum(c.a.filter(r=>r.date===pd)));b.push(sum(c.b.filter(r=>r.date===dt)));}
 chart('daily',labels,[{label:String(c.p),data:a},{label:String(c.y),data:b}],'line');chart('cats',cats.map(r=>r.key),[{label:String(c.p),data:cats.map(r=>r.a)},{label:String(c.y),data:cats.map(r=>r.b)}]);
 setExport(['중분류',c.p+'년 매출',c.y+'년 매출','증감액','전년수량','당년수량'],cats.map(r=>[r.key,r.a,r.b,r.diff,r.qa,r.qb]));
}
let driverKey='sub',driverOrder='down';
function drivers(c){
 const key=driverKey==='sub'?r=>r.mid+' / '+r.sub:driverKey==='det'?r=>r.mid+' / '+r.sub+' / '+r.det:driverKey;
 const all=compare(c.a,c.b,key),loss=-all.filter(r=>r.diff<0).reduce((s,r)=>s+r.diff,0),gain=all.filter(r=>r.diff>0).reduce((s,r)=>s+r.diff,0);
 all.sort(driverOrder==='down'?(a,b)=>a.diff-b.diff:driverOrder==='up'?(a,b)=>b.diff-a.diff:(a,b)=>b.b-a.b);
 const rows=all.map(r=>[esc(cnameOrKey(r.key)),won(r.a),won(r.b),`<span class="${cls(r.diff)}">${signed(r.diff)}</span>`,percent(ratio(r.a,r.b)),c.ra>0?(r.diff/c.ra*100).toFixed(2)+'%p':'—',r.diff<0&&loss>0?(-r.diff/loss*100).toFixed(1)+'%':'—',`<span class="badge">${esc(r.state)}</span>`]);
 $('view').innerHTML=panel('어디서 매출이 변했나요?',`<div class="sectionhead"><label>분석 단위<select id="driver-key">${[['sub','소분류'],['det','세분류'],['brand','브랜드'],['mall','쇼핑몰'],['channel','채널']].map(([v,l])=>`<option value="${v}" ${driverKey===v?'selected':''}>${l}</option>`).join('')}</select></label><label>정렬<select id="driver-order">${[['down','감소액 큰 순'],['up','증가액 큰 순'],['sales','당년 매출 큰 순']].map(([v,l])=>`<option value="${v}" ${driverOrder===v?'selected':''}>${l}</option>`).join('')}</select></label></div><div class="cards">${kpi('감소 항목 합계',won(loss)+'원','감소 항목의 절대 감소액 합계')}${kpi('증가 항목 합계',won(gain)+'원','증가 항목의 증가액 합계')}${kpi('순증감',signed(c.rb-c.ra)+'원','증가액 − 감소액')}${kpi('집계 대사',Math.abs(gain-loss-(c.rb-c.ra))<.01?'일치':'불일치','모든 항목 포함 · 상위 항목 절단 없음')}</div><small>전체 성장 기여도 = 항목 증감액 ÷ 전년 전체 매출. 감소액 비중 = 해당 감소액 ÷ 감소 항목 합계. 신규·판매 없음은 선택 기간 내 거래 유무이며 출시·단종을 뜻하지 않습니다.</small>`+table(['항목',c.p+'년 매출',c.y+'년 매출','증감액','증감률','전체 성장 기여도','감소액 비중','거래 상태'],rows));
 $('driver-key').onchange=e=>{driverKey=e.target.value;render();};$('driver-order').onchange=e=>{driverOrder=e.target.value;render();};setExport(['항목','전년매출','당년매출','증감액','성장기여도(%p)'],all.map(r=>[cnameOrKey(r.key),r.a,r.b,r.diff,c.ra>0?r.diff/c.ra*100:'']));
}
function cnameOrKey(k){return ['danawa','enuri'].includes(k)?cname(k):k;}
let productOrder='down',productSearch='';
function products(c){
 const all=compare(c.a,c.b,'productKey');const comparable=all.filter(r=>r.qa>0&&r.qb>0),revA=sum(comparable,'a'),revB=sum(comparable,'b');
 let purePrice=0,volume=0;for(const r of comparable){purePrice+=(r.b/r.qb-r.a/r.qa)*r.qb;volume+=(r.qb-r.qa)*(r.a/r.qa);}
 const coverageA=c.ra>0?revA/c.ra*100:0,coverageB=c.rb>0?revB/c.rb*100:0;
 const list=all.filter(r=>!productSearch||(r.sample.name+' '+r.sample.brand).toLowerCase().includes(productSearch.toLowerCase())).sort(productOrder==='down'?(a,b)=>a.diff-b.diff:productOrder==='up'?(a,b)=>b.diff-a.diff:(a,b)=>b.b-a.b);
 const makeRows=rs=>rs.map(r=>[esc(r.sample.name),esc(r.sample.brand),cname(r.sample.channel),won(r.a),won(r.b),signed(r.diff),won(r.qa)+' → '+won(r.qb),r.qa>0?won(r.a/r.qa):'—',r.qb>0?won(r.b/r.qb):'—',`<span class="badge">${esc(r.state)}</span><br><small>${esc(r.sample.matchType)}</small>`]);
 $('view').innerHTML=panel('동일 상품의 평균 판매단가 변화',`<div class="cards">${kpi('양년 공통 상품',won(comparable.length)+'개','채널별 상품코드 우선 매칭')}${kpi('공통 상품 매출 비중',coverageB.toFixed(1)+'%',`${c.p}년 ${coverageA.toFixed(1)}% · ${c.y}년 ${coverageB.toFixed(1)}%`)}${kpi('공통 상품 단가 효과',signed(purePrice)+'원','(당년 상품단가 − 전년 상품단가) × 당년 수량')}${kpi('공통 상품 수량 효과',signed(volume)+'원','(당년 수량 − 전년 수량) × 전년 상품단가')}</div><small>같은 상품코드라도 옵션·쇼핑몰·프로모션 구성이 달라질 수 있습니다. 공통 상품의 단가 효과 역시 순수한 가격 변경 효과로 확정할 수 없습니다. 상품코드가 없으면 쇼핑몰 상품코드, 그마저 없으면 브랜드+상품명으로 비교합니다. 채널 간 상품은 합치지 않습니다.</small>`)+
 panel('전체 상품 증감',`<div class="sectionhead"><label>상품·브랜드 검색<input id="product-search" value="${esc(productSearch)}" placeholder="상품명 또는 브랜드"></label><label>정렬<select id="product-order">${[['down','감소액 큰 순'],['up','증가액 큰 순'],['sales','당년 매출 큰 순']].map(([v,l])=>`<option value="${v}" ${v===productOrder?'selected':''}>${l}</option>`).join('')}</select></label><small>${list.length.toLocaleString()}개 상품 · 모든 상품 집계 후 정렬</small></div>`+table(['상품명','브랜드','채널',c.p+'년 매출',c.y+'년 매출','증감액','수량','전년 평균단가','당년 평균단가','비교 상태'],makeRows(list)));
 $('product-search').onchange=e=>{productSearch=e.target.value;render();};$('product-order').onchange=e=>{productOrder=e.target.value;render();};setExport(['상품명','브랜드','채널','상품코드','매칭기준','전년매출','당년매출','증감액','전년수량','당년수량','상태'],list.map(r=>[r.sample.name,r.sample.brand,cname(r.sample.channel),r.sample.pid||r.sample.sid,r.sample.matchType,r.a,r.b,r.diff,r.qa,r.qb,r.state]));
}
function newStatus(r){if(r.channel!=='danawa'||!goodDate(r.reg)||!goodDate(r.date))return '등록일 미확인';const age=(Date.parse(r.date)-Date.parse(r.reg))/86400000;return age<0?'등록일 오류':age<=90?'신상품 (0~90일)':'기존 상품';}
function structureRanking(rows,key,n){
 const positive=rows.filter(r=>r.rev>0),total=sum(positive);
 const items=[...group(positive,key).values()].sort((a,b)=>b.rev-a.rev||String(a.key).localeCompare(String(b.key),'ko')).slice(0,n).map((r,i)=>({...r,rank:i+1,share:total>0?r.rev/total*100:0}));
 return {items,total,topRev:items.reduce((s,r)=>s+r.rev,0),share:total>0?items.reduce((s,r)=>s+r.rev,0)/total*100:null};
}
function structure(c){
 const a=c.a.filter(r=>r.channel==='danawa'),b=c.b.filter(r=>r.channel==='danawa'),newRows=compare(a,b,newStatus);
 const defs=[['브랜드 TOP1','brand',1],['브랜드 TOP5','brand',5],['브랜드 TOP10','brand',10],['상품 TOP10','productKey',10],['상품 TOP30','productKey',30]];
 const ranked=defs.map(([label,key,n])=>({label,key,n,prior:structureRanking(c.a,key,n),current:structureRanking(c.b,key,n)}));
 const itemTable=(ranking,key,other)=>{
  const others=new Map(other.items.map(x=>[x.key,x.rank]));
  return table(key==='brand'?['순위','브랜드','매출','양수 매출 비중','수량','상대 연도 TOP 내 순위']:['순위','상품명','브랜드','채널','상품코드','매출','양수 매출 비중','수량','상대 연도 TOP 내 순위'],ranking.items.map(r=>[won(r.rank),esc(key==='brand'?r.key:r.sample.name),...(key==='brand'?[]:[esc(r.sample.brand),cname(r.sample.channel),esc(r.sample.pid||r.sample.sid||'코드 없음')]),won(r.rev),r.share.toFixed(2)+'%',won(r.qty),others.has(r.key)?won(others.get(r.key))+'위':'TOP 밖·거래 미확인']));
 };
 const contents=(ranked,key)=>`<div class="grid"><div><h3>${c.p}년 구성 · ${ranked.prior.items.length}개</h3>${itemTable(ranked.prior,key,ranked.current)}</div><div><h3>${c.y}년 구성 · ${ranked.current.items.length}개</h3>${itemTable(ranked.current,key,ranked.prior)}</div></div>`;
 const detail=ranked.map((x,i)=>`<details id="concentration-detail-${i}" ${i===0?'open':''}><summary>${x.label} 구성 보기 — ${c.p}년 ${x.prior.share===null?'—':x.prior.share.toFixed(1)+'%'} / ${c.y}년 ${x.current.share===null?'—':x.current.share.toFixed(1)+'%'}</summary>${contents(x,x.key)}</details>`).join('');
 const newA=a.filter(r=>newStatus(r)==='신상품 (0~90일)'),newB=b.filter(r=>newStatus(r)==='신상품 (0~90일)');
 const newRank=[['신상품 매출 브랜드 TOP10','brand',10],['신상품 매출 상품 TOP30','productKey',30]].map(([label,key,n])=>({label,key,n,prior:structureRanking(newA,key,n),current:structureRanking(newB,key,n)}));
 const newDetails=newRank.map((x,i)=>`<details id="newproduct-detail-${i}" ${i===0?'open':''}><summary>${x.label} — 이름·매출·비중 보기</summary>${contents(x,x.key)}</details>`).join('');
 const priceBand=r=>r.qty<=0?'수량 0 이하':r.rev/r.qty<200000?'20만원 미만':r.rev/r.qty<400000?'20~40만원':r.rev/r.qty<600000?'40~60만원':r.rev/r.qty<1000000?'60~100만원':r.rev/r.qty<2000000?'100~200만원':'200만원 이상';
 const bands=compare(c.a,c.b,priceBand),order=['20만원 미만','20~40만원','40~60만원','60~100만원','100~200만원','200만원 이상','수량 0 이하'];bands.sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key));
 $('view').innerHTML=panel('신상품·기존 상품 (다나와 등록일 기준)',`<small>판매일 − 등록일이 0~90일인 행만 신상품입니다. 미래 등록일은 오류로 분리합니다. 등록일은 실제 출시일과 다를 수 있습니다. 에누리는 등록일이 없어 이 분석에서 제외합니다.</small>`+table(['구분',c.p+'년 매출',c.y+'년 매출','증감액','당년 다나와 매출 비중'],newRows.map(r=>[esc(r.key),won(r.a),won(r.b),signed(r.diff),sum(b)>0?(r.b/sum(b)*100).toFixed(1)+'%':'—'])))+
 panel('어떤 브랜드·상품이 신상품 매출을 만들었나요?',`<p>다나와 신상품으로 분류된 판매 행만 집계했습니다. 아래 비중의 분모는 각 연도 다나와의 양수 신상품 매출입니다. 상품이 조회 기간 중 90일을 넘으면 신상품으로 분류된 날짜의 실적만 포함합니다.</p>${newDetails}`)+
 panel('매출 집중도',`<p>상위 브랜드와 상품의 실제 구성은 아래 항목을 펼쳐 확인하세요. 전체 상품을 집계한 후 순위를 정합니다. 상품은 채널별 상품코드 우선으로 구분합니다.</p><small>미확인 브랜드도 별도 항목으로 포함합니다. 집중도와 상세 목록은 모두 양수 판매 행 기준이며, 음수 조정액을 포함한 다른 화면의 매출 합계와 다를 수 있습니다. 상대 연도 TOP 밖이라는 표시는 신규 출시·단종을 의미하지 않습니다.</small>`+table(['구분',c.p+'년',c.y+'년','변화'],ranked.map(x=>[x.label,x.prior.share===null?'—':x.prior.share.toFixed(1)+'%',x.current.share===null?'—':x.current.share.toFixed(1)+'%',x.prior.share===null||x.current.share===null?'—':(x.current.share-x.prior.share).toFixed(1)+'%p']))+`<p><button id="structure-rank-csv">브랜드·상품 구성 CSV</button></p>${detail}`)+
 panel('가격대별 판매 구성',table(['행 평균단가 구간','전년 매출','당년 매출','전년수량','당년수량'],bands.map(r=>[esc(r.key),won(r.a),won(r.b),won(r.qa),won(r.qb)])));
 const detailRows=[...ranked,...newRank].flatMap(x=>[[c.p,x.prior],[c.y,x.current]].flatMap(([year,rank])=>rank.items.map(r=>[x.label,year,r.rank,x.key==='brand'?r.key:r.sample.name,x.key==='brand'?'':r.sample.brand,x.key==='brand'?(x.label.startsWith('신상품')?'다나와':$('channel').value==='all'?'다나와+에누리':cname($('channel').value)):cname(r.sample.channel),x.key==='brand'?'':r.sample.pid||r.sample.sid||'',r.rev,r.qty,r.share,rank.total])));
 const headers=['구분','연도','순위','브랜드 또는 상품명','상품 브랜드','채널','상품코드','양수 매출','판매수량','비중(%)','비중 분모 매출'];
 $('structure-rank-csv').onclick=()=>{const cell=x=>'"'+String(x??'').replace(/^[=+@\t\r]/,"'").replace(/"/g,'""')+'"';download(`신상품_집중도_구성_${c.mode}_${c.s}_${c.e}.csv`,'\ufeff'+[headers,...detailRows].map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');};
 setExport(headers,detailRows);
}

function quality(c){
 const files=[...group(c.base,'source').values()].map(g=>{const rs=g.rows,year=g.sample.year,isCurrent=year===c.y,isPrev=year===c.p,start=isCurrent?c.s:isPrev?c.ps:null,end=isCurrent?c.e:isPrev?c.pe:null,used=start?rs.filter(r=>r.date>=start&&r.date<=end):[],dates=rs.map(r=>r.date).sort();return {name:g.key,year,start:dates[0],end:dates.at(-1),rows:rs.length,used:used.length,rev:g.rev,selected:sum(used),excluded:g.rev-sum(used),negative:rs.filter(r=>r.rev<0).length,zero:rs.filter(r=>r.qty===0).length};});
 const inScope=c.a.concat(c.b),unknown=inScope.filter(r=>!r.pid||/^0+$/.test(r.pid)),future=inScope.filter(r=>newStatus(r)==='등록일 오류');
 const unclassified=inScope.filter(r=>r.mid==='기타'||r.mid==='미분류'||r.sub==='기타'||r.sub==='미분류'||r.channel==='enuri'&&!r.categoryKnown);
 const cm=commonRange();
 $('view').innerHTML=panel('데이터 검증 결과',`<div class="notice">ファイル名ではなく実際の販売日で比較します。</div>`.replace('ファイル名ではなく実際の販売日で比較します。','파일명이 아닌 실제 판매일을 기준으로 비교합니다. 거래가 없는 날과 자료가 누락된 날은 이 파일만으로 구별할 수 없습니다.')+`<div class="cards">${kpi('선택 기간 원본 행',won(inScope.length)+'행','거래 건수·주문 건수와 다름')}${kpi('상품코드 미확인',won(unknown.length)+'행','쇼핑몰 상품코드·상품명으로 보완')}${kpi('미래 등록일',won(future.length)+'행','신상품 집계에서 별도 분리')}${kpi('미분류 행',won(unclassified.length)+'행','합계에서 제외하지 않음')}</div>${cm.missing.length?`<div class="notice warn">자료가 없는 조합: ${esc(cm.missing.join(', '))}</div>`:''}`+table(['파일','실제 시작일','실제 종료일','전체 행','선택 행','전체 매출','선택 매출','기간 밖 매출','음수 매출 행','수량 0 행'],files.map(f=>[esc(f.name),f.start,f.end,won(f.rows),won(f.used),won(f.rev),won(f.selected),won(f.excluded),won(f.negative),won(f.zero)])))+
 categoryAudit(c)+panel('해석 기준',`<ul><li>선택 기간 밖의 매출은 비교에서 제외하며 위 표에 금액을 표시합니다.</li><li>음수·0원 매출은 삭제하지 않습니다. 반품 여부는 원본 행의 의미를 확인해야 합니다.</li><li>월 전체 실적이 아닌 선택 일수의 누적 실적입니다. 동일 요일 비교는 같은 요일의 시작일과 같은 일수를 맞추며, 명절·공휴일 차이는 보정하지 않습니다.</li><li>다나와 판매액과 에누리 주문액은 집계 정의가 다를 수 있습니다. 채널별 수치를 함께 확인하세요.</li><li>상품·브랜드 순위 밖의 데이터를 0원으로 가정하지 않습니다. 전년에만 있던 카테고리도 포함합니다.</li><li>원가·수수료·광고비·방문수·목표 자료가 없으므로 이익, ROAS, 전환율, 목표 달성률은 계산하지 않습니다.</li></ul>`);
 setExport(['파일','시작일','종료일','전체행','선택행','전체매출','선택매출','기간밖매출','음수행'],files.map(f=>[f.name,f.start,f.end,f.rows,f.used,f.rev,f.selected,f.excluded,f.negative]));
}
function download(name,content,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function manage(){if(!IS_EDITOR){$('view').innerHTML=panel('공개 자료 조회',`<p>모든 컴퓨터에서 GitHub에 공개된 같은 자료를 읽습니다. 원본 자료를 바꾸려면 저장소 소유자의 GitHub 로그인이 필요합니다.</p><p><a href="editor.html">자료 업데이트 준비 화면</a> · <a href="https://github.com/fvhdf2z22k-sudo/sales-dashboard/upload/main/data" target="_blank" rel="noopener">GitHub에서 공개 JSON 교체</a></p><button id="public-json-download">현재 공개 자료 JSON 다운로드</button>`);$('public-json-download').onclick=()=>download('public.json',JSON.stringify(currentPayload(),null,2),'application/json');setExport([],[]);return;}
 $('view').innerHTML=panel('최신 매출 파일 업로드',`<p>다나와·에누리 XLS 파일을 함께 선택하세요. 현재와 동일한 HTML 표 형식의 XLS 및 일반 XLSX를 지원합니다. 파일의 헤더와 판매일로 채널·연도를 자동 판별합니다.</p><input type="file" id="files" multiple accept=".xls,.xlsx"><p class="muted">실수로 기존 자료를 지우지 않도록 교체 대상을 확인한 뒤 적용합니다. 같은 채널·연도·중분류의 기존 행 전체를 새 파일 묶음으로 교체하므로, 해당 분류의 파일은 한 번에 선택하세요.</p><div id="upload-preview"></div>`)+
 panel('백업과 복원',`<button id="backup">전체 데이터 JSON 백업</button> <label style="display:inline-block">백업 불러오기 <input id="restore" type="file" accept=".json"></label><p>복원은 현재 데이터 전체를 대체합니다. 업로드 후에는 백업을 보관하세요. 현재 변경은 이 브라우저의 초안입니다. 공개 자료용 JSON을 내려받아 GitHub의 data/public.json을 교체해야 공개 화면에 반영됩니다.</p><button id="builtin">파일 분석 데이터 비우기</button><div id="manage-status" role="status"></div>`);
 $('files').onchange=previewUpload;$('backup').onclick=()=>download('가구침구_매출백업.json',JSON.stringify({version:30,rows:data,audit,internalSnapshots},null,2),'application/json');
 $('restore').onchange=async e=>{try{const obj=JSON.parse(await e.target.files[0].text());if(![26,27,30].includes(obj.version))throw Error('지원하는 대시보드 백업 형식이 아닙니다.');validateRows(obj.rows);if(!confirm('백업 데이터로 현재 파일 자료와 내부 카테현황을 모두 교체할까요?'))return;if(obj.internalSnapshots)validateInternal(obj.internalSnapshots);data=obj.rows.map(clean);internalSnapshots=obj.internalSnapshots||[];audit=Array.isArray(obj.audit)?obj.audit:[];saveData();setupSelectors();}catch(e){$('manage-status').textContent='복원 실패: '+e.message;}};
 $('builtin').onclick=()=>{if(confirm('브라우저의 파일 분석 데이터를 비울까요? 내부 카테현황은 유지됩니다. 먼저 JSON 백업을 보관하세요.')){data=BUILTIN.map(clean);audit=AUDIT.slice();saveData();setupSelectors();}};
 setExport([],[]);
}
function numeric(s,label){const t=String(s??'').trim().replace(/,/g,'').replace(/원$/,'');if(!t)return 0;const n=Number(t);if(!Number.isFinite(n))throw Error(label+'에 숫자가 아닌 값이 있습니다: '+t.slice(0,40));return n;}
async function parseFile(file){
 const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);let rows,warnings=[];
 if(bytes[0]===0x50&&bytes[1]===0x4b||bytes[0]===0xd0&&bytes[1]===0xcf){const wb=XLSX.read(buffer,{type:'array',cellDates:true});rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:''});}
 else{let text;const utf8=new TextDecoder('utf-8').decode(buffer),utf8BOM=bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf;
  // A malformed product-name byte must not switch a UTF-8 document to EUC-KR.
  if(utf8BOM)text=utf8;
  else{try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch(e){text=/<(?:th|td)\b[^>]*>\s*(?:판매액|주문액)\s*<\//i.test(utf8)?utf8:new TextDecoder('euc-kr').decode(buffer);}}
  const damaged=(text.match(/\ufffd/g)||[]).length;if(damaged)warnings.push('원본에서 읽을 수 없는 문자가 '+damaged+'개 있어 �로 표시합니다. 상품명·상품코드 등을 원본과 확인해 주세요.');
  const doc=new DOMParser().parseFromString(text,'text/html');rows=Array.from(doc.querySelectorAll('tr')).map(r=>Array.from(r.querySelectorAll('td,th')).map(x=>x.textContent.trim()));}
 const hi=rows.findIndex(r=>r.includes('판매액')||r.some(x=>String(x).includes('주문액')));if(hi<0)throw Error(file.name+': 판매액·주문액 헤더를 찾지 못했습니다.');const headers=rows[hi].map(x=>String(x).trim()),d=headers.includes('판매액');
 const get=(r,n)=>r[headers.indexOf(n)]??'',has=n=>headers.includes(n);
 for(const name of d?['판매액','판매량','판매일','중분류']:['주문액','주문수량','체결일','카테고리'])if(!has(name))throw Error(file.name+': 필수 컬럼 누락 ('+name+')');
 const output=[];for(const [i,r] of rows.slice(hi+1).entries()){
  if(r.every(x=>!String(x).trim()))continue;
  const dt=normalizedDate(get(r,d?'판매일':'체결일'));if(!goodDate(dt))throw Error(file.name+': '+(i+hi+2)+'행 판매일을 확인해 주세요. 합계 행은 제거해 주세요.');
  output.push(clean({channel:d?'danawa':'enuri',year:+dt.slice(0,4),date:dt,rev:numeric(get(r,d?'판매액':'주문액'),'매출'),qty:numeric(get(r,d?'판매량':'주문수량'),'수량'),brand:get(r,d?'브랜드':'제조사'),mall:String(get(r,'쇼핑몰')),name:get(r,d?'다나와상품명':'상품명')||get(r,d?'협력사 상품명':'쇼핑몰 상품명'),pid:String(get(r,d?'D코드':'에누리 모델번호')),sid:String(get(r,d?'협력사 상품코드':'상품코드')),mid:get(r,'중분류'),sub:get(r,'소분류'),det:get(r,'세분류'),cat:String(get(r,'카테고리')),reg:get(r,'등록일'),rank:numeric(get(r,'인기순위'),'인기순위'),source:file.name}));
 }
 validateRows(output);output.warnings=warnings;return output;
}
const replaceKey=r=>JSON.stringify([r.channel,r.year,r.mid]);
async function previewUpload(e){if(!IS_EDITOR)return;
 const target=$('upload-preview');target.textContent='파일을 읽고 검증하고 있습니다…';
 try{
 const files=Array.from(e.target.files);if(!files.length){target.textContent='';return;}
 if(new Set(files.map(f=>f.name)).size!==files.length)throw Error('동일한 이름의 파일을 중복 선택했습니다.');
 const parsed=await Promise.all(files.map(parseFile)),incoming=parsed.flat(),keys=new Set(incoming.map(replaceKey));
 const removed=data.filter(r=>keys.has(replaceKey(r))),ds=incoming.map(r=>r.date).sort();
 target.innerHTML=`<div class="notice">${files.length}개 파일 · ${incoming.length.toLocaleString()}행 · ${won(sum(incoming))}원<br>실제 판매일: ${ds[0]} ~ ${ds.at(-1)}<br>교체 대상: ${[...keys].map(esc).join(' / ')}<br>기존 ${removed.length.toLocaleString()}행 (${won(sum(removed))}원)을 교체합니다.</div><div class="filelist">${files.map(f=>esc(f.name)).join('\n')}</div>${parsed.flatMap((rows,i)=>(rows.warnings||[]).map(w=>'<div class="notice warn">'+esc(files[i].name+': '+w)+'</div>')).join('')}<button id="apply-upload" class="primary">확인한 파일 적용</button>`;
 $('apply-upload').onclick=()=>{data=data.filter(r=>!keys.has(replaceKey(r))).concat(incoming);audit=files.map((f,i)=>({file:f.name,rows:parsed[i].length,rev:sum(parsed[i])}));const saved=saveData();setupSelectors();if(!saved)$('error').textContent='현재 화면에는 반영됐지만 브라우저 저장에 실패했습니다. JSON 백업을 내려받아 주세요.';};
 }catch(e){target.textContent='업로드 실패: '+e.message;}
}
function render(){
 charts.forEach(c=>c.destroy());charts=[];$('error').textContent='';
 document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 try{if(!data.length&&tab!=='internal'&&tab!=='upload'){renderWebWelcome();return;}if(tab==='internal'){$('period-info').innerHTML='<div class="notice">카테현황은 여기 입력한 내부 자료끼리만 비교합니다. XLS 파일의 실적·금액은 사용하지 않으며, 상단 파일 분석용 필터도 적용되지 않습니다. 이 화면에서 조회 자료와 비교 자료를 선택하세요.</div>';internalView();return;}if(tab==='upload'){$('period-info').innerHTML='';manage();return;}const c=context();lastContext=c;const com=commonRange();const outside=c.base.filter(r=>(r.year===c.p||r.year===c.y)&&!(r.year===c.p?r.date>=c.ps&&r.date<=c.pe:r.date>=c.s&&r.date<=c.e));
 $('period-info').innerHTML=`<div class="notice"><b>${c.y}년 ${c.s.slice(5)} ~ ${c.e.slice(5)} ↔ ${c.p}년 ${c.ps.slice(5)} ~ ${c.pe.slice(5)}</b> · ${c.label} · 각 ${c.days}일 누적 · ${esc($('channel').selectedOptions[0].text)} · ${esc($('section').value==='all'?'전체 분류':$('section').value)} · ${esc(subcategoryLabel())}<br><small>선택 기간 밖 ${outside.length.toLocaleString()}행, ${won(sum(outside))}원은 제외했습니다. 자세한 내역은 데이터 검증에서 확인하세요.</small></div>`;
 if(com.missing.length)$('period-info').innerHTML+='<div class="notice warn">채널·연도 자료 누락: '+esc(com.missing.join(', '))+'. 합산 비교가 불완전할 수 있습니다.</div>';
 const beyond=outsideCoverage(c);
 if(beyond)$('period-info').innerHTML+='<div class="notice warn">선택 기간이 일부 파일의 실제 거래일 범위를 벗어납니다. 미판매와 자료 누락을 구분할 수 없으므로 공통 기간 비교를 권장합니다.</div>';
 ({overview,drivers,products,structure,quality,malls,report,season,price:window.priceAnalysis}[tab]||overview)(c);
 }catch(e){$('error').textContent=e.message;$('view').innerHTML='';setExport([],[]);}
}
$('tabs').onclick=e=>{if(e.target.dataset.tab){tab=e.target.dataset.tab;render();}};
for(const id of ['channel','section'])$(id).onchange=()=>{updateSubcategories();resetRange();};
for(const id of ['current','previous'])$(id).onchange=resetRange;
$('subcategory').onchange=render;
$('comparison').onchange=render;
for(const id of ['start','end'])$(id).onchange=render;$('reset').onclick=resetRange;
$('csv').onclick=()=>{if(!exportHeaders.length){$('error').textContent='이 화면에는 내보낼 표가 없습니다. 분석 화면에서 내려받아 주세요.';return;}const cell=x=>'"'+String(x??'').replace(/^[=+@\t\r]/,"'").replace(/^-([^\d])/ ,"'-$1").replace(/"/g,'""')+'"';const snap=internalSnapshots.find(s=>s.id===internalCurrent);download(tab==='internal'&&snap?'카테현황_'+snap.channel+'_'+snap.start+'_'+snap.end+'.csv':'가구침구_'+tab+'_'+$('comparison').value+'_'+$('start').value+'_'+$('end').value+'.csv','\ufeff'+[exportHeaders,...exportRows].map(r=>r.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');};
setupSelectors();if(restoreError)$('error').textContent=restoreError;

let selectedMall='all',mallSort='sales';
function malls(c){
 const all=compare(c.a,c.b,'mall');
 all.sort(mallSort==='down'?(a,b)=>a.diff-b.diff:mallSort==='up'?(a,b)=>b.diff-a.diff:(a,b)=>b.b-a.b);
 if(selectedMall!=='all'&&!all.some(x=>x.key===selectedMall))selectedMall='all';
 const a=selectedMall==='all'?c.a:c.a.filter(r=>r.mall===selectedMall),b=selectedMall==='all'?c.b:c.b.filter(r=>r.mall===selectedMall);
 const ra=sum(a),rb=sum(b),qa=sum(a,'qty'),qb=sum(b,'qty');
 const share=(r,t)=>t>0?r/t*100:null,pp=(a,b)=>a===null||b===null?'—':(b-a>=0?'+':'')+(b-a).toFixed(1)+'%p';
 const summary=table(['쇼핑몰',c.p+'년 매출',c.y+'년 매출','증감액','증감률','전년 비중','당년 비중','비중 변화','전년 수량','당년 수량','전년 평균단가','당년 평균단가'],all.map(r=>[esc(r.key),won(r.a),won(r.b),`<span class="${cls(r.diff)}">${signed(r.diff)}</span>`,percent(ratio(r.a,r.b)),c.ra>0?(r.a/c.ra*100).toFixed(1)+'%':'—',c.rb>0?(r.b/c.rb*100).toFixed(1)+'%':'—',pp(share(r.a,c.ra),share(r.b,c.rb)),won(r.qa),won(r.qb),r.qa>0?won(r.a/r.qa):'—',r.qb>0?won(r.b/r.qb):'—']));
 const dimTable=(key)=>{const rows=compare(a,b,key).sort((x,y)=>y.b-x.b);return table(['항목','전년 매출','당년 매출','증감액','증감률'],rows.map(r=>[esc(cnameOrKey(r.key)),won(r.a),won(r.b),signed(r.diff),percent(ratio(r.a,r.b))]));};
 const prods=compare(a,b,'productKey').sort((x,y)=>y.b-x.b);
 $('view').innerHTML=panel('쇼핑몰별 매출 분석',`<div class="sectionhead"><label>상세 분석 쇼핑몰<select id="mall-select"><option value="all">전체 쇼핑몰</option>${all.map(r=>`<option value="${esc(r.key)}" ${r.key===selectedMall?'selected':''}>${esc(r.key)}</option>`).join('')}</select></label><label>전체 쇼핑몰 표 정렬<select id="mall-sort">${[['sales','당년 매출 큰 순'],['down','감소액 큰 순'],['up','증가액 큰 순']].map(([v,n])=>`<option value="${v}" ${v===mallSort?'selected':''}>${n}</option>`).join('')}</select></label><button id="mall-detail-csv">선택 쇼핑몰 상품 CSV</button></div><p class="muted">상단 채널·중분류·기간 조건을 반영합니다. 아래 전체 쇼핑몰 표는 같은 조건의 모든 쇼핑몰을 비교하고, 상세 영역은 선택한 쇼핑몰만 표시합니다.</p>`+summary)+
 panel(esc(selectedMall==='all'?'전체 쇼핑몰':selectedMall)+' 상세',`<div class="cards">${kpi('당년 매출',won(rb)+'원',`<span class="${cls(rb-ra)}">${percent(ratio(ra,rb))} · ${signed(rb-ra)}원</span>`)}${kpi('판매수량',won(qb)+'개',won(qa)+'개 → '+won(qb)+'개')}${kpi('평균 판매단가',won(qb>0?rb/qb:null)+'원',won(qa>0?ra/qa:null)+'원 → '+won(qb>0?rb/qb:null)+'원')}${kpi('선택 조건 내 매출 비중',c.rb>0?(rb/c.rb*100).toFixed(1)+'%':'—','전년 대비 '+pp(share(ra,c.ra),share(rb,c.rb)))}</div><div class="chart"><canvas id="mall-daily"></canvas></div>`)+
 `<div class="grid">${panel('채널별 실적',dimTable('channel'))}${panel('소분류별 실적',dimTable(r=>r.mid+' / '+r.sub))}</div>`+
 panel('브랜드별 실적',dimTable('brand'))+panel('주요 상품 TOP30 (당년 매출순)',table(['상품명','브랜드','채널','전년 매출','당년 매출','증감액','당년 수량','당년 평균단가'],prods.slice(0,30).map(r=>[esc(r.sample.name),esc(r.sample.brand),cname(r.sample.channel),won(r.a),won(r.b),signed(r.diff),won(r.qb),won(r.qb>0?r.b/r.qb:null)]))+'<small>모든 상품을 집계한 뒤 30개를 표시합니다. 상세 상품 CSV에는 전체 상품을 포함합니다.</small>');
 const labels=[],va=[],vb=[];for(let t=Date.parse(c.s);t<=Date.parse(c.e);t+=86400000){const dt=new Date(t).toISOString().slice(0,10),pd=shiftDate(c.ps,(t-Date.parse(c.s))/DAY_MS);labels.push(dt.slice(5)+' ↔ '+pd.slice(5));va.push(sum(a.filter(r=>r.date===pd)));vb.push(sum(b.filter(r=>r.date===dt)));}
 chart('mall-daily',labels,[{label:String(c.p),data:va},{label:String(c.y),data:vb}],'line');
 $('mall-select').onchange=e=>{selectedMall=e.target.value;render();};$('mall-sort').onchange=e=>{mallSort=e.target.value;render();};
 $('mall-detail-csv').onclick=()=>{const headers=['쇼핑몰','상품명','브랜드','채널','전년매출','당년매출','증감액','전년수량','당년수량'];const rows=prods.map(r=>[selectedMall,r.sample.name,r.sample.brand,cname(r.sample.channel),r.a,r.b,r.diff,r.qa,r.qb]);download('쇼핑몰_상품분석_'+c.s+'_'+c.e+'.csv','\ufeff'+[headers,...rows].map(r=>r.map(x=>'"'+String(x??'').replace(/^[=+@\t\r]/,"'").replace(/"/g,'""')+'"').join(',')).join('\r\n'),'text/csv;charset=utf-8');};
 setExport(['쇼핑몰','전년매출','당년매출','증감액','전년수량','당년수량','전년비중(%)','당년비중(%)'],all.map(r=>[r.key,r.a,r.b,r.diff,r.qa,r.qb,share(r.a,c.ra),share(r.b,c.rb)]));
}
function categoryAudit(c){
 const rows=[...group(c.a.concat(c.b).filter(r=>r.channel==='enuri'),'cat').values()].sort((a,b)=>b.rev-a.rev);
 return panel('에누리 카테고리 코드 대조',`<p>코드를 왼쪽부터 두 자리씩 읽습니다. 이름은 상위 분류와 함께 판별합니다. 알려주신 표에 없는 코드는 추정하지 않고 미확인으로 남기며, 해당 매출은 합계에 포함합니다. 중분류 침대/매트리스는 채널 합산을 위해 상단 필터에서 침실가구로 묶습니다.</p><small>커튼은 소분류 01·08 모두 하위 00을 커튼/블라인드로 처리합니다. 4·6자리 코드처럼 하위 코드가 없으면 코드 없음으로 표시합니다. 상품명에서 침대 사이즈를 추정하지 않습니다.</small>`+table(['원본 코드','두 자리 구분','대분류','중분류','소분류','미분류','행 수','양년 선택기간 매출','상태'],rows.map(r=>{const x=_decodeCatStr(r.key);return [esc(r.key),esc(x.parts.join(' / ')),esc(x.major),esc(x.mid),esc(x.sub),esc(x.det),won(r.rows.length),won(r.rev),x.known?'확인':'미확인·누락'];})));
}

let reportMall='all',reportTop=5,reportMinQty=3,reportText='',reportFormat='category',reportIncludeDetails=true,reportIncludeProducts=true,reportFlatPct=5;
const reportPct=(a,b)=>{const p=ratio(a,b);return p===null?'전년 비교 기준 없음':percent(p);};
const reportMove=(a,b,unit='원')=>`${won(a)}${unit} → ${won(b)}${unit} (${signed(b-a)}${unit}, ${reportPct(a,b)})`;
function reportProduct(r,c){
 const pa=r.a/r.qa,pb=r.b/r.qb,pctP=ratio(pa,pb),pctQ=ratio(r.qa,r.qb),vol=(r.qb-r.qa)*pa,price=(pb-pa)*r.qb;
 let comment;
 if(Math.abs(pctP)<1&&Math.abs(pctQ)<1)comment='평균단가·판매수량 모두 변동 폭이 1% 미만입니다.';
 else if(Math.abs(pctP)<1)comment=`평균단가는 유사한 수준(변동 1% 미만)이며, 판매수량 ${r.qb>r.qa?'증가':'감소'}가 매출 변화에 주로 반영됐습니다.`;
 else if(Math.abs(pctQ)<1)comment=`판매수량은 유사한 수준(변동 1% 미만)이며, 평균단가 ${pb>pa?'상승':'하락'}이 매출 변화에 주로 반영됐습니다.`;
 else if(pb<pa&&r.qb>r.qa)comment=`평균단가 하락과 판매수량 증가가 함께 나타났습니다. ${r.diff>0?'수량 증가 효과가 단가 하락 효과를 상쇄해 매출이 증가했습니다.':r.diff<0?'수량이 늘었지만 단가 하락 효과를 상쇄하지 못해 매출은 감소했습니다.':'단가와 수량 효과가 상쇄돼 매출은 동일합니다.'}`;
 else if(pb>pa&&r.qb<r.qa)comment=`평균단가 상승과 판매수량 감소가 함께 나타났습니다. ${r.diff<0?'단가 상승 효과보다 수량 감소 효과가 커 매출이 감소했습니다.':r.diff>0?'수량이 줄었지만 단가 상승 효과가 이를 상쇄해 매출은 증가했습니다.':'단가와 수량 효과가 상쇄돼 매출은 동일합니다.'}`;
 else if(pb>pa&&r.qb>r.qa)comment='평균단가와 판매수량이 모두 상승해 매출 증가에 함께 기여했습니다.';
 else if(pb<pa&&r.qb<r.qa)comment='평균단가와 판매수량이 모두 하락해 매출 감소에 함께 기여했습니다.';
 else comment='단가·수량 변화를 함께 확인하세요.';
 return [`• ${r.sample.name} / ${r.sample.brand} / ${cname(r.sample.channel)}`,
 `  매출: ${reportMove(r.a,r.b)}`,
 `  판매수량: ${reportMove(r.qa,r.qb,'개')}`,
 `  평균 판매단가: ${reportMove(pa,pb)}`,
 `  매출 증감 분해: 수량 효과 ${signed(vol)}원 + 단가 효과 ${signed(price)}원 = ${signed(r.diff)}원`,
 `  해석: ${comment}`,
 `  매칭: ${r.sample.matchType}${r.sample.pid||r.sample.sid?' '+(r.sample.pid||r.sample.sid):' (이름 일치 기준이므로 동일성 추가 확인 필요)'}`].join('\n');
}
function makeDetailedReport(c,options){
 const mall=options.mall??'all',top=options.top??5,minQty=options.minQty??3;
 const a=mall==='all'?c.a:c.a.filter(r=>r.mall===mall),b=mall==='all'?c.b:c.b.filter(r=>r.mall===mall);
 const ra=sum(a),rb=sum(b),qa=sum(a,'qty'),qb=sum(b,'qty'),delta=rb-ra;
 const lines=[],section=name=>lines.push('\n'+name+'\n'+'─'.repeat(38));
 lines.push('가구·침구 매출 분석 보고서');
 lines.push(`분석 범위: ${$('channel').selectedOptions[0].text} / ${$('section').value==='all'?'전체 분류':$('section').value} / ${subcategoryLabel()} / ${mall==='all'?'전체 쇼핑몰':mall}`);
 lines.push(`당년: ${c.s} ~ ${c.e} / 전년: ${c.ps} ~ ${c.pe} (${c.label}, 각 ${c.days}일)`);
 lines.push(`표시 기준: 증감별 상위 ${top}개 / 동일 상품은 양년 수량 각각 ${minQty}개 이상·매출 양수`);
 section('1. 전체 실적');
 lines.push(`매출: ${reportMove(ra,rb)}`);
 lines.push(`판매수량: ${reportMove(qa,qb,'개')}`);
 if(qa>0&&qb>0){lines.push(`평균 판매단가: ${reportMove(ra/qa,rb/qb)}`);const vol=(qb-qa)*(ra/qa),price=delta-vol;lines.push(`매출 증감 ${signed(delta)}원 = 판매수량 변화 효과 ${signed(vol)}원 + 평균단가 변화 효과 ${signed(price)}원`);}
 else lines.push('평균 판매단가·매출 분해: 양년 수량이 양수일 때 계산합니다.');
 const summaries={};
 for(const [key,label] of [['brand','브랜드'],['mall','쇼핑몰']]){
  section((key==='brand'?'2. ':'3. ')+label+'별 증가·감소 원인');
  const rows=compare(a,b,key),up=rows.filter(r=>r.diff>0).sort((x,y)=>y.diff-x.diff),down=rows.filter(r=>r.diff<0).sort((x,y)=>x.diff-y.diff),gain=up.reduce((s,r)=>s+r.diff,0),loss=-down.reduce((s,r)=>s+r.diff,0);
  summaries[key]={gain,loss,rows,up,down};
  lines.push(`증가 항목 합계 +${won(gain)}원 / 감소 항목 합계 -${won(loss)}원 / 순증감 ${signed(gain-loss)}원`);
  if(key==='mall'&&mall!=='all')lines.push('특정 쇼핑몰을 선택했으므로 쇼핑몰 간 순위 대신 해당 쇼핑몰의 변화만 표시합니다.');
  for(const [heading,list] of [['감소',down],['증가',up]]){
   lines.push('\n['+label+' '+heading+' 상위]');
   if(!list.length)lines.push('해당 항목이 없습니다.');
   list.slice(0,top).forEach((r,i)=>{
    const state=r.state==='양년 판매'?'':r.state==='선택 기간 신규 판매'?' / 자료 내 당년만 판매':' / 자료 내 당년 판매 없음';
    const contrib=ra>0?` / 전체 성장 기여도 ${(r.diff/ra*100>=0?'+':'')+(r.diff/ra*100).toFixed(2)}%p`:'';
    lines.push(`${i+1}) ${r.key}: ${reportMove(r.a,r.b)}${contrib}${state}`);
    lines.push(`   수량 ${won(r.qa)}개 → ${won(r.qb)}개${r.qa>0&&r.qb>0?` / 평균단가 ${won(r.a/r.qa)}원 → ${won(r.b/r.qb)}원`:''}`);
   });
   const shown=list.slice(0,top).reduce((s,r)=>s+r.diff,0),rest=list.slice(top).reduce((s,r)=>s+r.diff,0);
   if(list.length>top)lines.push(`표시 ${Math.min(top,list.length)}개 증감 합계 ${signed(shown)}원 / 나머지 ${list.length-top}개 증감 합계 ${signed(rest)}원`);
  }
 }
 section('4. 동일 상품의 매출·수량·평균단가 변화');
 const all=compare(a,b,'productKey'),common=all.filter(r=>r.rowsA.length&&r.rowsB.length),eligible=common.filter(r=>r.qa>=minQty&&r.qb>=minQty&&r.a>0&&r.b>0);
 const ca=eligible.reduce((s,r)=>s+r.a,0),cb=eligible.reduce((s,r)=>s+r.b,0);
 lines.push(`전체 상품 ${all.length}개 / 양년 거래 상품 ${common.length}개 / 분석 조건 충족 ${eligible.length}개`);
 lines.push(`조건 충족 상품의 매출 비중: 전년 ${ra>0?(ca/ra*100).toFixed(1)+'%':'—'} / 당년 ${rb>0?(cb/rb*100).toFixed(1)+'%':'—'}. 미충족 ${common.length-eligible.length}개 공통 상품은 아래 단가·수량 분석에서 제외됩니다.`);
 lines.push('동일 상품코드 우선 비교입니다. 상품코드가 없으면 쇼핑몰 상품코드 또는 브랜드+상품명을 사용하며 채널 간 상품은 합치지 않습니다.');
 for(const [title,list] of [['매출 감소 상품',eligible.filter(r=>r.diff<0).sort((x,y)=>x.diff-y.diff)],['매출 증가 상품',eligible.filter(r=>r.diff>0).sort((x,y)=>y.diff-x.diff)]]){
  lines.push('\n['+title+' 상위]');if(!list.length)lines.push('조건에 해당하는 상품이 없습니다.');
  list.slice(0,top).forEach(r=>lines.push(reportProduct(r,c)));
 }
 section('5. 단가와 수량의 동반 변화');
 const patterns=[['평균단가 하락·판매수량 증가',r=>r.b/r.qb<r.a/r.qa*.99&&r.qb>r.qa*1.01],['평균단가 상승·판매수량 감소',r=>r.b/r.qb>r.a/r.qa*1.01&&r.qb<r.qa*.99],['평균단가·판매수량 모두 하락',r=>r.b/r.qb<r.a/r.qa*.99&&r.qb<r.qa*.99],['평균단가·판매수량 모두 상승',r=>r.b/r.qb>r.a/r.qa*1.01&&r.qb>r.qa*1.01]];
 for(const [label,fn] of patterns){
  const rs=eligible.filter(fn).sort((x,y)=>Math.abs(y.diff)-Math.abs(x.diff));lines.push(`\n${label}: ${rs.length}개 (변화율 각각 1% 초과 기준)`);
  rs.slice(0,top).forEach(r=>lines.push(`• ${r.sample.name} (${cname(r.sample.channel)}): 평균단가 ${reportPct(r.a/r.qa,r.b/r.qb)} / 수량 ${reportPct(r.qa,r.qb)} / 매출 ${signed(r.diff)}원`));
 }
 section('6. 확인할 항목');
 const worstBrand=summaries.brand.down[0],worstMall=summaries.mall.down[0];
 if(worstBrand)lines.push(`• ${worstBrand.key}: 브랜드 감소액 ${won(-worstBrand.diff)}원. 하위 상품·판매 쇼핑몰의 수량 감소와 단가 변화를 확인하세요.`);
 if(worstMall)lines.push(`• ${worstMall.key}: 쇼핑몰 감소액 ${won(-worstMall.diff)}원. 상품 구성·노출·행사·재고·경쟁 가격 자료를 대조하세요.`);
 const onlyA=all.filter(r=>!r.rowsB.length),onlyB=all.filter(r=>!r.rowsA.length);
 lines.push(`• 전년에만 거래가 있는 상품 ${onlyA.length}개 / 당년에만 거래가 있는 상품 ${onlyB.length}개. 매칭 변경·누락·판매 중단 여부를 확인해야 하며, 신규 출시·단종으로 단정하지 않습니다.`);
 const noCode=a.concat(b).filter(r=>r.matchType!=='상품코드').length,unknown=a.concat(b).filter(r=>r.channel==='enuri'&&!r.categoryKnown).length,negative=a.concat(b).filter(r=>r.rev<0).length;
 section('7. 보고서 기준 및 해석 주의');
 const com=commonRange();
 if(com.missing.length)lines.push('• 채널·연도 자료 누락: '+com.missing.join(', ')+'. 합산 비교가 불완전합니다.');
 if(outsideCoverage(c))lines.push('• 선택 기간이 일부 자료의 실제 거래일 범위를 벗어납니다. 미판매와 자료 누락은 구분할 수 없습니다.');
 lines.push(`• 선택 범위 원본 ${a.length+b.length}행 / 카탈로그 상품코드 미확인 ${noCode}행 / 에누리 분류 미확인·누락 ${unknown}행 / 음수 매출 ${negative}행.`);
 lines.push('• 미확인·기타 브랜드는 식별되지 않은 매출 묶음이며 실제 브랜드로 해석하지 않습니다.');
 lines.push('• 판매액은 제공된 매출금액이고 평균 판매단가는 매출÷판매수량입니다. 매출 감소와 단가 하락은 서로 다른 현상입니다.');
 lines.push('• 단가·수량의 동반 변화는 관찰 결과입니다. 가격 변화가 판매량 변화를 유발했다고 확정할 수 없습니다. 같은 상품코드도 옵션·쇼핑몰·할인 구성이 달라질 수 있습니다.');
 lines.push('• 단가·수량 효과는 전년 단가를 고정한 분해입니다. 각 항목을 원 단위로 반올림하면 1원 차이가 날 수 있습니다.');
 lines.push(c.mode==='weekday'?'• 동일 요일 비교: 전년 동일 날짜에서 가장 가까운 같은 요일(±3일)을 시작일로 잡고 동일 일수를 비교합니다. 명절·공휴일 효과까지 보정하는 방식은 아닙니다.':'• 동일 날짜 비교: 같은 월·일을 비교하며 요일·명절 배치가 다를 수 있습니다.');
 lines.push('• 반품·취소·이익·노출·재고 등은 원본의 정의와 추가 자료를 확인하세요.');
 lines.push('• 쇼핑몰 미선택 시 현재 조건 내 모든 쇼핑몰 합산입니다. 다른 탭의 상세 쇼핑몰 선택은 이 보고서에 자동 적용되지 않습니다.');
 return {text:lines.join('\n'),eligible,summary:{ra,rb,qa,qb},brands:summaries.brand,malls:summaries.mall};
}
function report(c){
 const malls=[...new Set(c.a.concat(c.b).map(r=>r.mall))].sort();if(reportMall!=='all'&&!malls.includes(reportMall))reportMall='all';
 const result=makeReport(c,{mall:reportMall,top:reportTop,minQty:reportMinQty,format:reportFormat,details:reportIncludeDetails,products:reportIncludeProducts,flatPct:reportFlatPct});reportText=result.text;
 $('view').innerHTML=panel('보고서 자동 생성',`<div class="toolbar"><label>보고서 형식<select id="report-format"><option value="category" ${reportFormat==='category'?'selected':''}>분류별 요약 (기존 형식)</option><option value="detailed" ${reportFormat==='detailed'?'selected':''}>상품 중심 상세</option></select></label><label>보고서 쇼핑몰<select id="report-mall"><option value="all">전체 쇼핑몰</option>${malls.map(m=>`<option value="${esc(m)}" ${m===reportMall?'selected':''}>${esc(m)}</option>`).join('')}</select></label><label>증감별 표시 개수<select id="report-top">${[3,5,10].map(n=>`<option value="${n}" ${n===reportTop?'selected':''}>${n}개</option>`).join('')}</select></label><label>동일 상품 최소 수량 (각 연도)<select id="report-min">${[1,3,5,10].map(n=>`<option value="${n}" ${n===reportMinQty?'selected':''}>${n}개</option>`).join('')}</select></label><label style="display:inline-flex;flex-direction:row;align-items:center"><input id="report-details" type="checkbox" ${reportIncludeDetails?'checked':''}>세분류 포함</label><label style="display:inline-flex;flex-direction:row;align-items:center"><input id="report-products" type="checkbox" ${reportIncludeProducts?'checked':''}>동일 상품명 분석 포함</label><label>매출 유사 범위<select id="report-flat">${[3,5,10].map(n=>`<option value="${n}" ${reportFlatPct===n?'selected':''}>±${n}%</option>`).join('')}</select></label><button id="report-name-csv">동일 상품명 비교 CSV</button><button id="report-html">서식 있는 HTML 다운로드</button><button id="report-copy" class="primary">보고서 복사</button><button id="report-txt">TXT 다운로드</button><button id="report-print">인쇄 / PDF 저장</button></div><div class="notice">중분류 → 소분류 → 세분류 순서로 판매량 변화와 증가·감소 브랜드·쇼핑몰을 정리합니다. 상단 채널·분류·기간과 위 쇼핑몰 조건으로 작성한 초안입니다. 동일 상품의 매출, 평균 판매단가, 판매수량을 나누어 분석합니다. 표본이 적은 상품은 최소 수량을 낮춰 확인할 수 있습니다.<br>직접 편집한 내용은 조건 변경·탭 이동 시 초기화되므로 먼저 복사하거나 내려받으세요.</div><div id="report-status" role="status"></div><div id="report-rich" style="background:white;padding:18px;border:1px solid var(--line);border-radius:8px;line-height:1.9">${reportMarkup(reportText)}</div><details id="report-editor"><summary>보고서 문장 직접 편집</summary><textarea id="report-text" aria-label="자동 생성 보고서 편집" spellcheck="false" style="width:100%;min-height:900px;resize:vertical;padding:20px;border:1px solid var(--line);border-radius:8px;font:13px/1.9 system-ui;color:var(--ink)">${esc(reportText)}</textarea></details><small>텍스트를 직접 편집할 수 있습니다. 조건을 바꾸면 자동 생성 내용으로 다시 작성되므로 편집한 내용은 먼저 복사하거나 내려받으세요. 보고서 탭을 벗어나도 편집 내용은 초기화됩니다.</small>`);
 for(const [id,apply] of [['report-format',v=>reportFormat=v],['report-mall',v=>reportMall=v],['report-top',v=>reportTop=+v],['report-min',v=>reportMinQty=+v],['report-flat',v=>reportFlatPct=+v]])$(id).onchange=e=>{apply(e.target.value);render();};
 $('report-name-csv').onclick=()=>$('csv').click();
 $('report-details').onchange=e=>{reportIncludeDetails=e.target.checked;render();};$('report-products').onchange=e=>{reportIncludeProducts=e.target.checked;render();};
 $('report-text').oninput=()=>{$('report-rich').innerHTML=reportMarkup($('report-text').value);};
 $('report-html').onclick=()=>download(`가구침구_매출보고서_${c.mode}_${c.s}_${c.e}.html`,reportDocument($('report-text').value),'text/html;charset=utf-8');
 $('report-copy').onclick=async()=>{const text=$('report-text').value;try{await navigator.clipboard.writeText(text);$('report-status').textContent='보고서를 복사했습니다.';}catch(e){$('report-editor').open=true;$('report-text').focus();$('report-text').select();const ok=document.execCommand('copy');$('report-status').textContent=ok?'보고서를 복사했습니다.':'복사가 제한돼 있습니다. 선택된 텍스트를 Ctrl+C 또는 ⌘C로 복사하세요.';}};
 $('report-txt').onclick=()=>download(`가구침구_매출보고서_${c.mode}_${c.s}_${c.e}.txt`,'\ufeff'+$('report-text').value,'text/plain;charset=utf-8');
 $('report-print').onclick=()=>{const text=$('report-text').value,w=window.open('','_blank');if(!w){$('report-status').textContent='인쇄 창을 열 수 없습니다. 팝업 허용 후 다시 시도하거나 TXT로 내려받으세요.';return;}w.document.open();w.document.write(reportDocument(text));w.document.close();w.focus();w.print();};
 setExport(['채널','상품명','브랜드','매칭기준','전년매출','당년매출','증감액','전년수량','당년수량','전년평균단가','당년평균단가'],(result.sameName?.eligible||result.eligible).map(r=>[cname(r.sample.channel),r.sample.name,r.sample.brand,r.sample.matchType,r.a,r.b,r.diff,r.qa,r.qb,r.a/r.qa,r.b/r.qb]));
}

let internalCurrent='',internalPrevious='',internalLevel='mid',internalDraft='',internalParsed=null;

function internalNum(value){let s=String(value??'').replace(/\u00a0/g,' ').trim().replace(/,/g,'').replace(/원$/,'').trim();if(/^\(\d+(\.\d+)?\)$/.test(s))s='-'+s.slice(1,-1);if(!/^-?\d+(\.\d+)?$/.test(s))throw Error('판매액·판매량·주문량은 숫자가 필요합니다: '+String(value));const n=Number(s);if(!Number.isFinite(n))throw Error('숫자가 너무 큽니다.');return n;}
function parseInternal(input){
 const text=String(input).replace(/&#xA0;|&#160;|&nbsp;/gi,' ').replace(/\u00a0/g,' ');
 let grid;if(/<table[\s>]/i.test(text)){const doc=new DOMParser().parseFromString(text,'text/html');grid=Array.from(doc.querySelectorAll('tr')).map(r=>Array.from(r.querySelectorAll('th,td')).map(c=>c.textContent.trim()));}
 else grid=text.split(/\r?\n/).map(line=>{if(line.includes('\t'))return line.split('\t').map(x=>x.trim());if(line.includes('|'))return line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(x=>x.trim());return [line.trim()];});
 const rows=[],warnings=[],seen=new Set();
 grid.forEach((raw,i)=>{
  let cells=raw.map(x=>String(x).replace(/\*\*/g,'').trim());
  if(cells.every(x=>!x||/^:?-+:?$/.test(x)))return;
  if(cells.some(x=>/^판매액$|^판매량$|^주문량$/.test(x)))return;
  // The internal site inserts a blank spacer between each column in some clipboard formats.
  if(cells.length===13&&cells.filter((_,j)=>j%2===1).every(x=>!x))cells=cells.filter((_,j)=>j%2===0);
  if(cells.length!==7)throw Error((i+1)+'행: 대·중·소·세분류와 판매액·판매량·주문량의 7열이 필요합니다. 엑셀 표를 그대로 복사하거나 | 표를 붙여넣으세요.');
  if(cells.slice(0,4).some(x=>/^(총\s*합계|합계|총계)$/.test(x))){warnings.push((i+1)+'행 합계는 중복 합산을 막기 위해 제외했습니다.');return;}
  const [major,mid,sub,det]=cells;if(!major||(!mid&&(sub||det))||(!sub&&det))throw Error((i+1)+'행: 상위 분류 이름이 비어 있습니다. 병합 셀의 상위 이름을 채워 주세요.');
  const rev=internalNum(cells[4]),qty=internalNum(cells[5]),orders=internalNum(cells[6]);if(!Number.isInteger(qty)||!Number.isInteger(orders)||qty<0||orders<0)throw Error((i+1)+'행: 판매량·주문량은 0 이상의 정수여야 합니다.');
  const path=[major,mid,sub,det],key=JSON.stringify(path);if(seen.has(key))throw Error((i+1)+'행: 같은 카테고리가 중복됐습니다. 중복 행을 확인해 주세요.');seen.add(key);
  rows.push({major,mid,sub,det,rev,qty,orders});
 });
 if(!rows.length)throw Error('읽을 수 있는 실적 행이 없습니다.');if(rows.length>10000)throw Error('한 번에 10,000행까지 저장할 수 있습니다.');
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const a=rows[i],b=rows[j];let prefix=true;for(const k of INTERNAL_KEYS){if(!a[k]||!b[k]){if(prefix)throw Error('상위 합계와 하위 실적이 함께 있습니다. 같은 집계 단계의 행만 붙여넣어 주세요.');break;}if(a[k]!==b[k]){prefix=false;break;}}}
 return {rows,warnings};
}
function validateInternal(snapshots){
 if(!Array.isArray(snapshots)||snapshots.length>100)throw Error('카테현황 백업 형식·건수를 확인하세요.');const ids=new Set();
 for(const s of snapshots){if(typeof s.id!=='string'||ids.has(s.id)||typeof s.name!=='string'||!['danawa','enuri','all','unassigned'].includes(s.channel)||!goodDate(s.start)||!goodDate(s.end)||s.start>s.end||!Array.isArray(s.rows)||!s.rows.length)throw Error('카테현황의 이름·채널·기간·자료를 확인하세요.');ids.add(s.id);
  const raw=s.rows.map(r=>[...INTERNAL_KEYS.map(k=>r[k]||''),r.rev,r.qty,r.orders].join('\t')).join('\n');parseInternal(raw);
 }
}
function internalGroup(snapshot,level){const index=INTERNAL_KEYS.indexOf(level),map=new Map();for(const r of snapshot.rows){const path=INTERNAL_KEYS.slice(0,index+1).map(k=>r[k]||'하위 코드 없음'),key=JSON.stringify(path);if(!map.has(key))map.set(key,{key,label:path.join(' / '),rev:0,qty:0,orders:0});const x=map.get(key);x.rev+=r.rev;x.qty+=r.qty;x.orders+=r.orders;}return map;}
function internalLabel(s){return `${s.name} · ${s.start}~${s.end} · ${s.channel==='all'?'채널 합산':s.channel==='unassigned'?'채널 미지정':cname(s.channel)}`;}
function internalView(){if(!IS_EDITOR){internalPublicView();return;}
 if(internalCurrent&&!internalSnapshots.some(s=>s.id===internalCurrent))internalCurrent='';if(!internalCurrent&&internalSnapshots.length){internalCurrent=internalSnapshots.at(-1).id;if(!internalPrevious)internalPrevious=internalSnapshots.at(-1).previousSnapshotId||'';}
 const current=internalSnapshots.find(s=>s.id===internalCurrent),previous=internalSnapshots.find(s=>s.id===internalPrevious);
 $('view').innerHTML=internalPairForm()+panel('내부 거래액 · 카테현황',`<p>내부 사이트에서 복사한 대분류·중분류·소분류·세분류·판매액·판매량·주문량 표를 붙여넣으세요. XLS 파일 자료와 별도 보관하며 값을 덮어쓰지 않습니다.</p><div class="toolbar"><label>자료 이름<input id="internal-name" placeholder="예: 10월 1~15일 내부 실적"></label><label>자료의 채널<select id="internal-channel"><option value="unassigned">채널 미지정</option><option value="danawa">다나와</option><option value="enuri">에누리</option><option value="all">두 채널 합산</option></select></label><label>실제 집계 시작일<input id="internal-start" type="date"></label><label>실제 집계 종료일<input id="internal-end" type="date"></label></div><textarea id="internal-paste" aria-label="내부 카테고리 표 붙여넣기" style="width:100%;min-height:190px;font:13px/1.7 system-ui" placeholder="여기에 표를 붙여넣으세요. 엑셀 탭 구분, HTML 표, | 구분 표를 지원합니다.">${esc(internalDraft)}</textarea><p><button id="internal-preview" class="primary">붙여넣기 내용 확인</button> <button id="internal-backup">전체 데이터 JSON 백업</button></p><div id="internal-preview-area"></div>`)+
 panel('저장된 카테고리 실적',`<div class="toolbar"><label>조회 자료<select id="internal-current"><option value="">자료 선택</option>${internalSnapshots.map(s=>`<option value="${esc(s.id)}" ${s.id===internalCurrent?'selected':''}>${esc(internalLabel(s))}</option>`).join('')}</select></label><label>비교 자료 (선택)<select id="internal-previous"><option value="">비교하지 않음</option>${internalSnapshots.filter(s=>s.id!==internalCurrent).map(s=>`<option value="${esc(s.id)}" ${s.id===internalPrevious?'selected':''}>${esc(internalLabel(s))}</option>`).join('')}</select></label><label>집계 단계<select id="internal-level">${[['major','대분류'],['mid','중분류'],['sub','소분류'],['det','세분류']].map(([v,l])=>`<option value="${v}" ${v===internalLevel?'selected':''}>${l}</option>`).join('')}</select></label>${current?'<button id="internal-delete">조회 자료 삭제</button>':''}</div><div id="internal-result"></div>`);
 $('internal-paste').oninput=e=>{internalDraft=e.target.value;internalParsed=null;$('internal-preview-area').innerHTML='';};
 $('internal-paste').onpaste=e=>{const html=e.clipboardData?.getData('text/html');if(html&&/<table[\s>]/i.test(html)){e.preventDefault();const doc=new DOMParser().parseFromString(html,'text/html');internalDraft=Array.from(doc.querySelectorAll('tr')).map(r=>Array.from(r.querySelectorAll('td,th')).map(c=>c.textContent.trim()).join('\t')).join('\n');$('internal-paste').value=internalDraft;internalParsed=null;$('internal-preview-area').innerHTML='';}};
 $('internal-preview').onclick=internalPreview;bindInternalPair();
 $('internal-backup').onclick=()=>download('가구침구_전체백업.json',JSON.stringify({version:30,rows:data,audit,internalSnapshots},null,2),'application/json');
 $('internal-current').onchange=e=>{internalCurrent=e.target.value;if(internalCurrent===internalPrevious)internalPrevious='';internalView();};
 $('internal-previous').onchange=e=>{internalPrevious=e.target.value;internalView();};$('internal-level').onchange=e=>{internalLevel=e.target.value;internalView();};
 if(current)$('internal-delete').onclick=()=>{if(confirm('선택한 내부 자료를 삭제할까요? 파일 업로드 자료는 그대로 유지됩니다.')){internalSnapshots=internalSnapshots.filter(s=>s.id!==current.id);internalCurrent='';if(internalPrevious===current.id)internalPrevious='';saveData();internalView();}};
 if(current)renderInternalResult(current,previous&&previous.id!==current.id?previous:null);else{$('internal-result').innerHTML='<div class="empty">저장된 내부 자료가 없습니다. 표를 붙여넣고 채널·기간을 지정해 저장하세요.</div>';setExport([],[]);}
}
function internalPreview(){
 const el=$('internal-preview-area');$('error').textContent='';try{
  internalDraft=$('internal-paste').value;internalParsed=parseInternal(internalDraft);const rows=internalParsed.rows;
  el.innerHTML=`<div class="notice">${rows.length}개 분류 · 판매액 ${won(sum(rows))}원 · 판매량 ${won(sum(rows,'qty'))}개 · 주문량 ${won(sum(rows,'orders'))}건</div>${internalParsed.warnings.map(t=>`<div class="notice warn">${esc(t)}</div>`).join('')}`+table(['대분류','중분류','소분류','세분류','판매액','판매량','주문량'],rows.map(r=>[esc(r.major),esc(r.mid),esc(r.sub),esc(r.det),won(r.rev),won(r.qty),won(r.orders)]))+'<p><button id="internal-save" class="primary">확인한 내부 자료 저장</button></p>';
  $('internal-save').onclick=()=>{
   $('error').textContent='';try{const start=$('internal-start').value,end=$('internal-end').value,name=$('internal-name').value.trim(),channel=$('internal-channel').value;if(!name||!goodDate(start)||!goodDate(end)||start>end)throw Error('자료 이름과 실제 집계 시작일·종료일을 입력해 주세요.');
    const existing=internalSnapshots.find(s=>s.channel===channel&&s.start===start&&s.end===end&&s.name===name);
    if(existing&&!confirm('이름·채널·기간이 같은 내부 자료를 교체할까요?'))return;
    const snapshot={id:existing?.id||'internal-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),name,channel,start,end,rows:internalParsed.rows,updatedAt:new Date().toISOString()};
    const next=internalSnapshots.filter(s=>s.id!==snapshot.id).concat(snapshot);validateInternal(next);internalSnapshots=next;internalCurrent=snapshot.id;internalDraft='';internalParsed=null;const saved=saveData();internalView();if(!saved)$('error').textContent='현재 화면에는 반영했지만 브라우저 저장이 실패했습니다. 전체 데이터 JSON 백업을 받아 주세요.';
   }catch(e){$('error').textContent=e.message;}
  };
 }catch(e){internalParsed=null;el.innerHTML='<div class="notice warn">'+esc(e.message)+'</div>';}
}
function renderInternalResult(current,previous){
 const rows=internalGroup(current,internalLevel),prior=previous?internalGroup(previous,internalLevel):new Map(),total=sum(current.rows),qty=sum(current.rows,'qty'),orders=sum(current.rows,'orders');
 const comparable=previous&&current.channel===previous.channel,days=s=>(Date.parse(s.end)-Date.parse(s.start))/DAY_MS+1;
 const sameScope=previous&&rows.size===prior.size&&[...rows.keys()].every(k=>prior.has(k));
 const aggregateOK=comparable&&sameScope,base=previous?{rev:sum(previous.rows),qty:sum(previous.rows,'qty'),orders:sum(previous.rows,'orders')}:null;
 const yoyLabel=previous&&+current.start.slice(0,4)===+previous.start.slice(0,4)+1?'전년 대비':'비교 자료 대비';
 const change=(a,b)=>a===null||b===null?'—':percent(ratio(a,b));
 const summary=(key,val,unit)=>!previous?'내부 자료 기준':aggregateOK?`${yoyLabel} ${percent(ratio(base[key],val))} · ${signed(val-base[key])}${unit}`:'채널·분류 범위가 달라 전체 증감은 계산하지 않음';
 const keys=[...new Set([...rows.keys(),...prior.keys()])].sort((a,b)=>(rows.get(b)?.rev||0)-(rows.get(a)?.rev||0));
 const cells=keys.map(k=>{const a=rows.get(k),b=prior.get(k),ok=a&&b&&comparable;return [esc((a||b).label),a?won(a.rev):'자료 없음',a?won(a.qty):'—',a?won(a.orders):'—',a&&a.qty>0?won(a.rev/a.qty):'—',a&&a.orders>0?won(a.rev/a.orders):'—',a&&total>0?(a.rev/total*100).toFixed(1)+'%':'—',...(previous?[b?won(b.rev):'자료 없음',ok?signed(a.rev-b.rev):'비교 불가',ok?change(b.rev,a.rev):'—',b?won(b.qty):'—',ok?change(b.qty,a.qty):'—',b?won(b.orders):'—',ok?change(b.orders,a.orders):'—',ok&&a.qty>0&&b.qty>0?change(b.rev/b.qty,a.rev/a.qty):'—',ok&&a.orders>0&&b.orders>0?change(b.rev/b.orders,a.rev/a.orders):'—']:[])];});
 let body=`<p><b>${esc(internalLabel(current))}</b></p><div class="cards">${kpi('붙여넣은 분류 판매액',won(total)+'원',summary('rev',total,'원'))}${kpi('판매량',won(qty)+'개',summary('qty',qty,'개'))}${kpi('주문량',won(orders)+'건',summary('orders',orders,'건'))}${kpi('객단가',won(orders>0?total/orders:null)+'원',aggregateOK?yoyLabel+' '+change(base.orders>0?base.rev/base.orders:null,orders>0?total/orders:null):'판매액 ÷ 카테고리별 주문량 합계')}</div><small>평균 판매단가 = 판매액 ÷ 판매량. 객단가 = 판매액 ÷ 주문량. 한 주문이 여러 카테고리에 걸치면 주문량 합계에 중복될 수 있어, 전체 고유 주문 기준 객단가와 다를 수 있습니다. 집계 기간의 일부 날짜만 잘라 보거나 동일 요일로 재배분할 수 없는 집계 자료입니다.</small>`;
 if(previous){body+=`<div class="notice ${!comparable||!sameScope||days(current)!==days(previous)?'warn':''}">${yoyLabel}: ${esc(internalLabel(previous))}<br>당년 ${days(current)}일 / 비교 ${days(previous)}일 · ${!comparable?'채널이 달라 증감 계산하지 않음':!sameScope?'분류 범위가 다릅니다. 양쪽에 있는 분류만 증감을 계산하고 자료 없는 분류는 0원으로 간주하지 않습니다.':'동일 분류 범위'}${days(current)!==days(previous)?'<br>집계 일수가 달라 직접 비교에 주의하세요.':''}</div>`;}
 body+=table(['카테고리','판매액','판매량','주문량','평균 판매단가','객단가','매출 비중',...(previous?['비교 판매액','판매액 증감액','판매액 증감률','비교 판매량','판매량 증감률','비교 주문량','주문량 증감률','평균단가 증감률','객단가 증감률']:[])],cells);
 $('internal-result').innerHTML=body;
 setExport(['자료명','채널','시작일','종료일','카테고리','판매액','판매량','주문량','평균판매단가','객단가',...(previous?['비교자료명','비교시작일','비교종료일','비교판매액','판매액증감액','판매액증감률(%)','비교판매량','판매량증감률(%)','비교주문량','주문량증감률(%)']:[])],keys.map(k=>{const a=rows.get(k),b=prior.get(k),ok=a&&b&&comparable;return [current.name,current.channel,current.start,current.end,(a||b).label,a?.rev??'',a?.qty??'',a?.orders??'',a&&a.qty>0?a.rev/a.qty:'',a&&a.orders>0?a.rev/a.orders:'',...(previous?[previous.name,previous.start,previous.end,b?.rev??'',ok?a.rev-b.rev:'',ok?ratio(b.rev,a.rev)??'':'',b?.qty??'',ok?ratio(b.qty,a.qty)??'':'',b?.orders??'',ok?ratio(b.orders,a.orders)??'':'']:[])];}));
}
let internalPairDraft={name:'내부 카테현황',channel:'danawa',priorStart:'',priorEnd:'',currentStart:'',currentEnd:'',priorText:'',currentText:''};
function internalPairForm(){
 const d=internalPairDraft;
 const side=(prefix,title)=>`<div><h3>${title}</h3><div class="toolbar"><label>시작일<input id="pair-${prefix}-start" type="date" value="${esc(d[prefix+'Start'])}"></label><label>종료일<input id="pair-${prefix}-end" type="date" value="${esc(d[prefix+'End'])}"></label></div><textarea id="pair-${prefix}-text" aria-label="${title} 붙여넣기" style="width:100%;min-height:210px;font:13px/1.7 system-ui" placeholder="${title} 표를 여기에 붙여넣으세요.">${esc(d[prefix+'Text'])}</textarea></div>`;
 return panel('전년 · 당년 자료를 함께 넣고 비교',`<div class="toolbar"><label>비교 이름<input id="pair-name" value="${esc(d.name)}"></label><label>두 자료의 채널<select id="pair-channel">${[['danawa','다나와'],['enuri','에누리'],['all','두 채널 합산']].map(([v,n])=>`<option value="${v}" ${v===d.channel?'selected':''}>${n}</option>`).join('')}</select></label></div><div class="grid">${side('prior','전년 자료 (예: 2025년)')}${side('current','당년 자료 (예: 2026년)')}</div><div class="notice">전년·당년의 실제 집계 기간을 각각 지정하세요. 동일 요일 비교라면 예를 들어 전년 2025-10-02~10-16, 당년 2026-10-01~10-15 자료를 붙여넣습니다. 집계 자료의 날짜를 자동으로 바꾸거나 일수를 보정하지 않습니다.</div><button id="pair-preview" class="primary">두 자료 확인 · 전년 비교</button><div id="pair-result"></div>`);
}
function bindInternalPair(){
 const fields={'pair-name':'name','pair-channel':'channel','pair-prior-start':'priorStart','pair-prior-end':'priorEnd','pair-current-start':'currentStart','pair-current-end':'currentEnd','pair-prior-text':'priorText','pair-current-text':'currentText'};
 for(const [id,key] of Object.entries(fields))$(id).oninput=e=>{internalPairDraft[key]=e.target.value;$('pair-result').innerHTML='';};
 for(const prefix of ['prior','current'])$('pair-'+prefix+'-text').onpaste=e=>{const html=e.clipboardData?.getData('text/html');if(html&&/<table[\s>]/i.test(html)){e.preventDefault();const doc=new DOMParser().parseFromString(html,'text/html'),text=Array.from(doc.querySelectorAll('tr')).map(r=>Array.from(r.querySelectorAll('td,th')).map(c=>c.textContent.trim()).join('\t')).join('\n');internalPairDraft[prefix+'Text']=text;$('pair-'+prefix+'-text').value=text;$('pair-result').innerHTML='';}};
 $('pair-preview').onclick=()=>{
  $('error').textContent='';try{
   for(const [id,key] of Object.entries(fields))internalPairDraft[key]=$(id).value;
   const d=internalPairDraft;if(!d.name.trim())throw Error('비교 이름을 입력해 주세요.');
   for(const prefix of ['prior','current'])if(!goodDate(d[prefix+'Start'])||!goodDate(d[prefix+'End'])||d[prefix+'Start']>d[prefix+'End'])throw Error('전년·당년의 집계 시작일과 종료일을 모두 지정해 주세요.');
   if(+d.currentStart.slice(0,4)!==+d.priorStart.slice(0,4)+1)throw Error('당년 시작일은 전년 시작일의 다음 연도여야 합니다.');
   const parsed={prior:parseInternal(d.priorText),current:parseInternal(d.currentText)};
   const snapshots=['prior','current'].map(prefix=>{const start=d[prefix+'Start'],end=d[prefix+'End'],name=start.slice(0,4)+' '+d.name.trim(),existing=internalSnapshots.find(s=>s.name===name&&s.channel===d.channel&&s.start===start&&s.end===end);return {id:existing?.id||'internal-'+Date.now()+'-'+prefix+'-'+Math.random().toString(36).slice(2,8),name,channel:d.channel,start,end,rows:parsed[prefix].rows,updatedAt:new Date().toISOString()};});
   const [a,b]=snapshots;b.previousSnapshotId=a.id;const days=s=>(Date.parse(s.end)-Date.parse(s.start))/DAY_MS+1;
   const preview=table(['자료','집계 기간','분류 수','판매액','판매량','주문량'],snapshots.map(s=>[esc(s.name),s.start+' ~ '+s.end,won(s.rows.length),won(sum(s.rows)),won(sum(s.rows,'qty')),won(sum(s.rows,'orders'))]));
   const keys=s=>new Set(s.rows.map(r=>JSON.stringify(INTERNAL_KEYS.map(k=>r[k])))),ka=keys(a),kb=keys(b),same=ka.size===kb.size&&[...ka].every(k=>kb.has(k));
   $('pair-result').innerHTML=preview+`<div class="notice ${!same||days(a)!==days(b)?'warn':''}">전년 ${days(a)}일 / 당년 ${days(b)}일 · ${same?'동일 분류 범위 · 판매액 '+percent(ratio(sum(a.rows),sum(b.rows)))+' 변화':'분류 범위가 다릅니다. 저장 후 양쪽에 있는 분류만 증감을 계산합니다.'}${days(a)!==days(b)?'<br>기간 일수가 다르므로 직접 비교에 주의하세요.':''}</div>`+Object.values(parsed).flatMap(x=>x.warnings).map(t=>`<div class="notice warn">${esc(t)}</div>`).join('')+'<p><button id="pair-save" class="primary">두 자료 저장하고 전년 대비 보기</button></p>';
   $('pair-save').onclick=()=>{
    try{const replacements=snapshots.filter(s=>internalSnapshots.some(x=>x.id===s.id));if(replacements.length&&!confirm('동일한 이름·채널·기간으로 저장된 '+replacements.length+'개 자료를 교체할까요?'))return;
     const ids=new Set(snapshots.map(s=>s.id)),next=internalSnapshots.filter(s=>!ids.has(s.id)).concat(snapshots);validateInternal(next);internalSnapshots=next;internalPrevious=a.id;internalCurrent=b.id;const saved=saveData();internalPairDraft={...d,priorText:'',currentText:''};internalView();$('internal-result').scrollIntoView({behavior:'smooth',block:'start'});if(!saved)$('error').textContent='화면에는 반영했지만 브라우저 저장에 실패했습니다. 전체 데이터 JSON 백업을 받아 주세요.';
    }catch(e){$('error').textContent=e.message;}
   };
  }catch(e){$('pair-result').innerHTML='<div class="notice warn">'+esc(e.message)+'</div>';}
 };
}


function compactMoney(n){const abs=Math.abs(n),prefix=n<0?'-':'';if(abs>=1e8)return prefix+(abs/1e8).toFixed(2)+'억원';if(abs>=1e4)return prefix+Math.round(abs/1e4).toLocaleString('ko-KR')+'만원';return prefix+won(abs)+'원';}
function compactSigned(n){return (n>0?'+':'')+compactMoney(n);}
function categoryDrivers(a,b,key,top){
 const rows=compare(a,b,key),up=rows.filter(r=>r.diff>0).sort((x,y)=>y.diff-x.diff||String(x.key).localeCompare(String(y.key),'ko')),down=rows.filter(r=>r.diff<0).sort((x,y)=>x.diff-y.diff||String(x.key).localeCompare(String(y.key),'ko'));
 const item=r=>`${r.key}(${r.rowsA.length===0?'당년만 판매':r.rowsB.length===0?'당년 판매 없음':reportPct(r.a,r.b)}, ${compactSigned(r.diff)})`;
 const format=list=>{if(!list.length)return '해당 없음';const shown=list.slice(0,top).map(item),rest=list.slice(top);if(rest.length)shown.push(`외 ${rest.length}개 ${key==='brand'?'브랜드':'쇼핑몰'}(${compactSigned(rest.reduce((s,r)=>s+r.diff,0))})`);return shown.join(', ');};
 return {rows,up,down,upText:format(up),downText:format(down)};
}
function categoryNode(a,b,name,depth,top){
 const ra=sum(a),rb=sum(b),qa=sum(a,'qty'),qb=sum(b,'qty'),diff=rb-ra,prefix=depth===0?'':depth===1?'  ':'    ',lines=[];
 if(depth===0)lines.push(`${name} YoY ${reportPct(ra,rb)}, ${compactSigned(diff)}`);
 else lines.push(`${prefix}${depth===1?'■':'※'} ${name} YoY ${reportPct(ra,rb)}, ${compactSigned(diff)}`);
 lines.push(`${prefix}전체: ${compactMoney(ra)} → ${compactMoney(rb)} | 판매량 ${won(qa)}개 → ${won(qb)}개 (${signed(qb-qa)}개, ${reportPct(qa,qb)})`);
 if(qa>0&&qb>0)lines.push(`${prefix}◆ 평균 판매단가: ${compactMoney(ra/qa)} → ${compactMoney(rb/qb)} (${reportPct(ra/qa,rb/qb)})`);
 const brand=categoryDrivers(a,b,'brand',top),mall=categoryDrivers(a,b,'mall',top);
 lines.push(`${prefix}▲ 브랜드 증가: ${brand.upText}`,`${prefix}▼ 브랜드 감소: ${brand.downText}`,`${prefix}▲ 쇼핑몰 증가: ${mall.upText}`,`${prefix}▼ 쇼핑몰 감소: ${mall.downText}`);
 let decomposition=null;
 if(qa>0&&ra>=0&&rb>=0&&(qb>0||rb===0)){
  const vol=(qb-qa)*(ra/qa),price=diff-vol;
  let verdict;if(vol*price<0)verdict='판매량 변화와 평균단가 변화의 영향이 반대 방향(일부 상쇄)';else if(vol===0&&price===0)verdict='매출 변화 없음';else if(Math.abs(vol)>=Math.abs(price)*1.8)verdict=vol>=0?'판매량 증가가 주원인':'판매량 감소가 주원인';else if(Math.abs(price)>=Math.abs(vol)*1.8)verdict=price>=0?'평균단가 상승이 주원인':'평균단가 하락이 주원인';else verdict='판매량과 평균단가 변화가 함께 작용';
  decomposition={vol,price,diff};lines.push(`${prefix}◈ 매출 분해: ${compactSigned(diff)} = 판매량 변화 ${compactSigned(vol)} + 평균단가 변화 ${compactSigned(price)} → ${verdict} (상품 구성 변화 포함)`);
 }else lines.push(`${prefix}◈ 매출 분해: 양년의 유효한 판매수량·매출이 부족하거나 음수 조정액이 있어 해석하지 않음`);
 const ca=structureRanking(a,'brand',5),cb=structureRanking(b,'brand',5);if(ca.share!==null&&cb.share!==null){const d=cb.share-ca.share;lines.push(`${prefix}▣ 집중도: 상위 5개 브랜드 비중 ${ca.share.toFixed(1)}% → ${cb.share.toFixed(1)}% (${d>=0?'+':''}${d.toFixed(1)}%p${d>=3?' · 쏠림 심화':d<=-3?' · 분산':''}; 양수 매출 기준)`);}
 return {name,depth,ra,rb,qa,qb,diff,brand,mall,decomposition,lines};
}
function makeReport(c,options={}){
 if(options.format==='detailed'){const result=makeDetailedReport(c,options),sameName=analyzeSameNames(c,options);if(options.products!==false)result.text=result.text.replace('4. 동일 상품',sameName.text+'\n\n4. 동일 상품');return {...result,sameName};}
 const top=options.top??5,mall=options.mall??'all',details=options.details??true,products=options.products??true;
 const a=mall==='all'?c.a:c.a.filter(r=>r.mall===mall),b=mall==='all'?c.b:c.b.filter(r=>r.mall===mall);
 const lines=['가구·침구 분류별 매출 보고서',`당년 ${c.s} ~ ${c.e} / 전년 ${c.ps} ~ ${c.pe} (${c.label}, 각 ${c.days}일)`,`분석 조건: ${$('channel').selectedOptions[0].text} / ${$('section').value==='all'?'전체 분류':$('section').value} / ${subcategoryLabel()} / ${mall==='all'?'전체 쇼핑몰':mall}`,`브랜드·쇼핑몰 증감별 상위 ${top}개 + 나머지 증감 합계 · 금액은 반올림 표시`,''],nodes=[];
 const channels=[...new Set(a.concat(b).map(r=>r.channel))].sort(),ordered=(ra,rb,key)=>compare(ra,rb,key).sort((x,y)=>y.b-x.b||y.a-x.a||String(x.key).localeCompare(String(y.key),'ko'));
 for(const channel of channels){const aa=a.filter(r=>r.channel===channel),bb=b.filter(r=>r.channel===channel);
  for(const mid of ordered(aa,bb,'mid')){
   const ma=aa.filter(r=>r.mid===mid.key),mb=bb.filter(r=>r.mid===mid.key),node=categoryNode(ma,mb,`[${cname(channel)}] ${mid.key}`,0,top);nodes.push({...node,channel,mid:mid.key});lines.push(...node.lines,'');
   for(const sub of ordered(ma,mb,'sub')){
    const sa=ma.filter(r=>r.sub===sub.key),sb=mb.filter(r=>r.sub===sub.key),sn=categoryNode(sa,sb,sub.key,1,top);nodes.push({...sn,channel,mid:mid.key,sub:sub.key});lines.push(...sn.lines,'');
    if(details)for(const det of ordered(sa,sb,'det')){
     const da=sa.filter(r=>r.det===det.key),db=sb.filter(r=>r.det===det.key),dn=categoryNode(da,db,det.key,2,top);nodes.push({...dn,channel,mid:mid.key,sub:sub.key,det:det.key});lines.push(...dn.lines,'');
    }
   }
  }
 }
 if(!nodes.length)lines.push('선택 조건에 해당하는 데이터가 없습니다.');
 lines.push('※ 해석 기준','• 판매량 단위는 판매수량(개)이며 주문 건수가 아닙니다. 당년만 판매·당년 판매 없음은 선택 기간의 자료 상태이며 신규 출시·단종으로 단정하지 않습니다.','• 증가·감소는 매출 증감액 순서입니다. 미확인 브랜드는 별도 묶음이며 실제 브랜드로 해석하지 않습니다.','• 평균단가 변화에는 상품 구성·옵션·쇼핑몰·할인 변화가 포함됩니다. 가격 변화가 수량 변화를 유발했다고 단정하지 않습니다.','• 매출 분해는 전년 평균단가를 고정한 수량 효과와 나머지 평균단가 효과입니다. 만원·억원 반올림으로 표시 합계에 차이가 날 수 있습니다.','• 집중도는 양수 판매 행 기준입니다. 각 중분류·소분류·세분류는 상위·하위 관계이므로 서로 더하지 않습니다.');
 const com=commonRange();if(com.missing.length)lines.push('• 자료 누락: '+com.missing.join(', '));if(outsideCoverage(c))lines.push('• 선택 기간이 일부 파일의 실제 거래일 범위를 벗어납니다. 미판매와 자료 누락을 구분할 수 없습니다.');
 lines.push(c.mode==='weekday'?'• 동일 요일 비교이며 명절·공휴일 차이를 보정하지 않습니다.':'• 동일 날짜 비교이므로 요일·명절 배치 차이를 고려하세요.');
 const detailed=makeDetailedReport(c,options);
 const sameName=analyzeSameNames(c,options);if(products)lines.push('','══════════════════════════════════════',sameName.text);
 return {...detailed,text:lines.join('\n'),nodes,sameName};
}
function reportMarkup(text){return String(text).split('\n').map(line=>{const s=line.trim();let color='#253447',weight='400',size='14px';if(s.startsWith('▲'))color='#14715a';else if(s.startsWith('▼'))color='#c33f3f';else if(/^[◈▣◆]/.test(s))color='#687586';if(/^\[/.test(s)){weight='700';size='18px';}else if(s.startsWith('■')){weight='700';size='16px';}else if(s.startsWith('※')||s.startsWith('가구·침구'))weight='600';return `<div style="white-space:pre-wrap;overflow-wrap:anywhere;color:${color};font-weight:${weight};font-size:${size};min-height:1em">${esc(line)}</div>`;}).join('');}
function reportDocument(text){return '<!doctype html><html lang="ko"><meta charset="utf-8"><title>가구침구 매출 보고서</title><style>body{font:14px/1.9 system-ui;margin:28px}@page{size:A4;margin:16mm}</style><body>'+reportMarkup(text)+'</body></html>';}

function normalizedProductName(value){return String(value??'').trim().replace(/\s+/g,' ');}
function analyzeSameNames(c,options={}){
 const minQty=options.minQty??3,top=options.top??5,flatPct=options.flatPct??5,mall=options.mall??'all';
 const a=mall==='all'?c.a:c.a.filter(r=>r.mall===mall),b=mall==='all'?c.b:c.b.filter(r=>r.mall===mall);
 const unknown=new Set(['','미확인','기타','확인중','[불명]','-']);
 const named=rows=>rows.filter(r=>!unknown.has(normalizedProductName(r.name)));
 const key=r=>JSON.stringify([r.channel,r.mid,r.sub,normalizedProductName(r.name)]);
 const matched=compare(named(a),named(b),key).filter(r=>r.rowsA.length&&r.rowsB.length),ambiguous=[],eligible=[];
 for(const r of matched){
  const all=r.rowsA.concat(r.rowsB),brands=[...new Set(all.map(x=>x.brand).filter(x=>!unknown.has(x)))];if(brands.length>1){ambiguous.push(r);continue;}
  if(r.qa<minQty||r.qb<minQty||r.a<=0||r.b<=0)continue;
  const name=normalizedProductName(r.sample.name),pa=r.a/r.qa,pb=r.b/r.qb,pricePct=ratio(pa,pb),qtyPct=ratio(r.qa,r.qb),revPct=ratio(r.a,r.b),flat=Math.abs(revPct)<=flatPct;
  let pattern;if(pricePct>=1&&qtyPct<=-1)pattern='단가 상승 · 판매량 감소';else if(pricePct<=-1&&qtyPct>=1&&flat)pattern='단가 하락 · 판매량 증가 · 매출 유사';else if(pricePct<=-1&&qtyPct>=1)pattern='단가 하락 · 판매량 증가';else if(pricePct<=-1&&qtyPct<=-1)pattern='단가·판매량 모두 감소';else if(pricePct>=1&&qtyPct>=1)pattern='단가·판매량 모두 증가';else pattern='기타 단가·판매량 변화';
  const codes=rows=>[...new Set(rows.map(x=>x.pid||x.sid).filter(Boolean))].sort();const codesA=codes(r.rowsA),codesB=codes(r.rowsB),codeChanged=JSON.stringify(codesA)!==JSON.stringify(codesB)||codesA.length>1||codesB.length>1;
  eligible.push({...r,name,pa,pb,pricePct,qtyPct,revPct,flat,pattern,codesA,codesB,codeChanged,sample:{...r.sample,name,brand:brands[0]||'미확인',matchType:'동일 상품명 (채널·중분류·소분류 내 공백 정리 후 일치)',pid:'',sid:''}});
 }
 const ra=sum(a),rb=sum(b),coveredA=eligible.reduce((s,r)=>s+r.a,0),coveredB=eligible.reduce((s,r)=>s+r.b,0),lines=['동일 상품명 기준 평균 판매단가·판매량 분석',`전년·당년 상품명이 일치하는 상품 ${matched.length}개 / 분석 가능 ${eligible.length}개 / 브랜드 충돌 제외 ${ambiguous.length}개`,`분석 기준: 같은 채널·중분류·소분류, 앞뒤·연속 공백 정리 후 상품명 일치. 상품코드가 달라도 비교하며 양년 각각 수량 ${minQty}개 이상·매출 양수 조건입니다.`,`분석 상품의 매출 비중: 전년 ${ra>0?(coveredA/ra*100).toFixed(1)+'%':'—'} / 당년 ${rb>0?(coveredB/rb*100).toFixed(1)+'%':'—'}`,`단가·수량 변화는 각각 1% 이상, 매출 유사는 전년 대비 ±${flatPct}% 이내로 구분합니다.`, ''];
 const patterns=['단가 상승 · 판매량 감소','단가 하락 · 판매량 증가 · 매출 유사','단가 하락 · 판매량 증가','단가·판매량 모두 감소','단가·판매량 모두 증가','기타 단가·판매량 변화'];
 for(const pattern of patterns){const rs=eligible.filter(r=>r.pattern===pattern).sort(pattern.includes('매출 유사')?(x,y)=>y.b-x.b:(x,y)=>Math.abs(y.diff)-Math.abs(x.diff));lines.push(`[${pattern}] ${rs.length}개`);
  if(!rs.length)lines.push('조건에 해당하는 상품 없음');
  for(const r of rs.slice(0,top)){
   lines.push(`• ${r.name} / ${r.sample.brand} / ${cname(r.sample.channel)} / ${r.sample.mid} > ${r.sample.sub}`,
    `  평균 판매단가: ${reportMove(r.pa,r.pb)}`,
    `  판매량: ${reportMove(r.qa,r.qb,'개')}`,
    `  판매액: ${reportMove(r.a,r.b)}`);
   const vol=(r.qb-r.qa)*r.pa,price=(r.pb-r.pa)*r.qb;
   if(r.pattern==='단가 하락 · 판매량 증가 · 매출 유사')lines.push(`  해석: 평균단가는 낮아지고 판매량은 늘었지만, 두 효과가 대체로 상쇄돼 판매액은 전년 대비 ${percent(r.revPct)}로 유사한 수준(±${flatPct}% 이내)입니다.`);
   else if(r.pattern==='단가 상승 · 판매량 감소')lines.push(`  해석: 평균단가 상승과 판매량 감소가 함께 나타났으며, 판매액은 ${r.flat?'유사한 수준':r.diff>0?'증가':r.diff<0?'감소':'동일'}입니다. 가격 상승이 판매량 감소의 원인인지는 행사·노출·재고 등의 확인이 필요합니다.`);
   else if(r.pattern==='단가 하락 · 판매량 증가')lines.push(`  해석: 평균단가 하락과 판매량 증가가 함께 나타났고, ${r.diff>=0?'판매량 증가 효과가 단가 하락을 상쇄해 판매액이 증가했습니다.':'판매량이 늘어도 단가 하락 효과를 상쇄하지 못해 판매액은 감소했습니다.'}`);
   else lines.push(`  해석: 평균단가 ${percent(r.pricePct)}, 판매량 ${percent(r.qtyPct)}, 판매액 ${percent(r.revPct)}가 함께 관찰됐습니다.`);
   lines.push(`  매출 증감 분해: 판매량 효과 ${signed(vol)}원 + 평균단가 효과 ${signed(price)}원 = ${signed(r.diff)}원`);
   if(r.codeChanged)lines.push(`  확인: 동일 상품명이나 상품코드가 연도별로 다르거나 여러 개입니다. 전년 ${r.codesA.join(', ')||'코드 없음'} / 당년 ${r.codesB.join(', ')||'코드 없음'}. 옵션·동명이품 여부를 확인하세요.`);
  }
  if(rs.length>top)lines.push(`  나머지 ${rs.length-top}개는 동일 상품명 분석 CSV에 포함됩니다.`);lines.push('');
 }
 lines.push('※ 같은 상품명도 옵션·구성·판매 쇼핑몰·할인 조건이 다를 수 있습니다. 위 내용은 동반 변화의 관찰이며 인과관계를 확정하지 않습니다. 서로 다른 확인된 브랜드가 같은 이름을 쓴 경우는 제외했습니다. 동일 상품코드 기준의 기존 분석은 상품 중심 상세 형식과 상품 분석 탭에서 볼 수 있습니다.');
 return {text:lines.join('\n'),eligible,matched:matched.length,ambiguous:ambiguous.length,coveredA,coveredB};
}

function renderWebWelcome(){
 $('period-info').innerHTML='<div class="notice">'+(IS_EDITOR?'현재 화면은 로컬 편집 초안입니다. GitHub 파일을 교체하기 전에는 다른 사람에게 반영되지 않습니다.':'GitHub에 공개된 자료를 조회합니다. 서버 자료를 변경하는 기능은 없습니다.')+'</div>';
 if(!IS_EDITOR){$('view').innerHTML=panel(publicReady?'아직 공개된 파일 분석 자료가 없습니다.':'공개 자료를 불러오고 있습니다.',`<p>자료가 게시되면 이 주소에서 같은 최신 실적을 볼 수 있습니다. 내부 카테현황이 등록돼 있다면 해당 탭에서 조회하세요.</p><p><a href="editor.html">자료 업데이트 준비 화면</a></p>`);setExport([],[]);return;}
 $('view').innerHTML=panel('공개 자료 업데이트 준비',`<p>기존 JSON 백업 또는 새 매출 파일을 불러와 편집합니다. 변경은 이 브라우저에만 저장됩니다.</p><p><button id="web-load-json" class="primary">기존 JSON 백업 불러오기</button> <button id="web-load-files">매출 파일 선택</button> <button id="web-use-internal">내부 카테현황 입력</button></p><div class="notice">편집을 마치면 상단에서 <b>공개 자료용 JSON 다운로드</b>를 누르고, 본인 GitHub 계정으로 <b>data/public.json</b>을 교체하세요.</div>`);
 $('web-load-json').onclick=()=>{tab='upload';render();$('restore').click();};$('web-load-files').onclick=()=>{tab='upload';render();$('files').click();};$('web-use-internal').onclick=()=>{tab='internal';render();};setExport([],[]);
}

function currentPayload(){return {version:30,rows:data,audit,internalSnapshots};}
function checkPublicPayload(value){if(!value||![26,27,30].includes(value.version))throw Error('지원하는 JSON 백업 형식이 아닙니다.');validateRows(value.rows);validateInternal(value.internalSnapshots||[]);if(!Array.isArray(value.audit??[]))throw Error('파일 목록 형식이 올바르지 않습니다.');return {version:30,rows:value.rows,audit:value.audit||[],internalSnapshots:value.internalSnapshots||[]};}
function updatePublicStatus(text,isError=false){const el=$('public-status');el.textContent=text;el.style.color=isError?'var(--red)':'var(--muted)';}
function renderPublicControls(){
 $('public-mode-title').textContent=IS_EDITOR?'자료 업데이트 준비 · 이 브라우저의 초안':'공개 매출 대시보드 · 조회 전용';
 $('public-actions').innerHTML=IS_EDITOR?'<button id="public-reload">공개 자료로 다시 시작</button> <button id="public-export" class="primary">공개 자료용 JSON 다운로드</button> <a href="https://github.com/fvhdf2z22k-sudo/sales-dashboard/upload/main/data" target="_blank" rel="noopener">GitHub에 JSON 올리기</a> · <a href="index.html">공개 조회 화면</a>':'<button id="public-reload">최신 자료 새로고침</button> <a href="editor.html">자료 업데이트 준비</a>';
 $('public-reload').onclick=()=>loadPublishedData(true);
 if(IS_EDITOR)$('public-export').onclick=()=>{try{const payload=checkPublicPayload(currentPayload());if(!confirm(`파일 분석 ${payload.rows.length.toLocaleString()}행과 내부 카테현황 ${payload.internalSnapshots.length}개를 공개 자료용 JSON으로 내려받을까요? 이 파일을 GitHub data/public.json으로 올리면 누구나 읽을 수 있습니다.`))return;download('public.json',JSON.stringify(payload,null,2),'application/json');updatePublicStatus('public.json을 내려받았습니다. 본인 GitHub 계정으로 data/public.json을 교체해야 공개됩니다.');}catch(e){updatePublicStatus(e.message,true);}};
}
async function loadPublishedData(force=false){
 if(publicLoading)return;
 if(IS_EDITOR&&draftDirty){if(!force){updatePublicStatus('이 브라우저에 미공개 편집 초안이 있습니다. 공개 자료로 다시 시작하면 초안이 교체됩니다.');return;}if(!confirm('미공개 초안을 공개 자료로 교체할까요? 필요한 변경은 먼저 JSON으로 내려받으세요.'))return;}
 publicLoading=true;
 try{
  const url=new URL(PUBLIC_DATA_URL);url.searchParams.set('_t',String(Date.now()));const response=await fetch(url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('공개 자료를 불러오지 못했습니다. GitHub data/public.json과 배포 상태를 확인하세요. (HTTP '+response.status+')');
  const text=await response.text();if(new Blob([text]).size>90*1024*1024)throw Error('공개 JSON은 90MB 이내로 준비해 주세요.');const payload=checkPublicPayload(JSON.parse(text));
  const changed=text!==publishedText||!publicReady;publicReady=true;
  if(changed||force){
   const prior={};for(const id of ['channel','section','subcategory','current','previous','comparison','start','end'])prior[id]=$(id).value;
   data=payload.rows.map(clean);audit=payload.audit;internalSnapshots=payload.internalSnapshots;publishedText=text;draftDirty=false;
   if(IS_EDITOR)localStorage.removeItem(DRAFT_KEY);
   setupSelectors();
   for(const id of ['channel','section']){if(Array.from($(id).options).some(o=>o.value===prior[id]))$(id).value=prior[id];}updateSubcategories();
   for(const id of ['subcategory','current','previous','comparison'])if(Array.from($(id).options).some(o=>o.value===prior[id]))$(id).value=prior[id];
   if(goodDate(prior.start)&&goodDate(prior.end)&&prior.start<=prior.end&&prior.start.slice(0,4)===$('current').value){$('start').value=prior.start;$('end').value=prior.end;}else{const range=commonRange();$('start').value=range.startFull||'';$('end').value=range.endFull||'';}
   render();
  }
  updatePublicStatus(`공개 자료 ${data.length.toLocaleString()}행 · 내부 자료 ${internalSnapshots.length}개 · 확인 ${new Date().toLocaleTimeString('ko-KR')}`+(IS_EDITOR?' · 수정은 이 브라우저에만 저장됩니다.':''));
 }catch(e){updatePublicStatus(e.message,true);}finally{publicLoading=false;}
}
function internalPublicView(){
 if(!internalSnapshots.some(s=>s.id===internalCurrent)){internalCurrent=internalSnapshots.at(-1)?.id||'';internalPrevious=internalSnapshots.at(-1)?.previousSnapshotId||'';}
 const current=internalSnapshots.find(s=>s.id===internalCurrent),previous=internalSnapshots.find(s=>s.id===internalPrevious&&s.id!==internalCurrent);
 $('view').innerHTML=panel('공개 카테현황 · 조회 전용',`<div class="toolbar"><label>조회 자료<select id="internal-current"><option value="">자료 선택</option>${internalSnapshots.map(s=>`<option value="${esc(s.id)}" ${s.id===internalCurrent?'selected':''}>${esc(internalLabel(s))}</option>`).join('')}</select></label><label>비교 자료<select id="internal-previous"><option value="">비교하지 않음</option>${internalSnapshots.filter(s=>s.id!==internalCurrent).map(s=>`<option value="${esc(s.id)}" ${s.id===internalPrevious?'selected':''}>${esc(internalLabel(s))}</option>`).join('')}</select></label><label>집계 단계<select id="internal-level">${[['major','대분류'],['mid','중분류'],['sub','소분류'],['det','세분류']].map(([v,l])=>`<option value="${v}" ${v===internalLevel?'selected':''}>${l}</option>`).join('')}</select></label></div><div id="internal-result"></div>`);
 $('internal-current').onchange=e=>{internalCurrent=e.target.value;if(internalPrevious===internalCurrent)internalPrevious='';internalPublicView();};$('internal-previous').onchange=e=>{internalPrevious=e.target.value;internalPublicView();};$('internal-level').onchange=e=>{internalLevel=e.target.value;internalPublicView();};
 if(current)renderInternalResult(current,previous);else{$('internal-result').innerHTML='<div class="empty">아직 공개된 내부 카테현황 자료가 없습니다.</div>';setExport([],[]);}
}
renderPublicControls();loadPublishedData();
if(!IS_EDITOR){setInterval(()=>{if(!document.hidden)loadPublishedData();},60000);window.addEventListener('focus',()=>loadPublishedData());}
window.addEventListener('beforeunload',e=>{if(IS_EDITOR&&draftDirty){e.preventDefault();e.returnValue='';}});

const SEASON_SUMMER=['냉감','쿨','시어서커','여름'];
const SEASON_WINTER=['구스','극세사','겨울','울','양모'];
const SEASON_NAMES={summer:'여름',winter:'겨울',mixed:'여름·겨울 혼합',other:'키워드 미일치'};
let seasonSelection='summer',seasonScope='bedding',seasonOrder='sales';
function seasonMatchName(value){
 const name=String(value??'').normalize('NFKC').toLowerCase();
 const summer=SEASON_SUMMER.filter(k=>name.includes(k));
 // '울'은 소재명만 분류하도록 명백한 다른 단어 속의 울을 먼저 제외한다.
 const woolText=name.replace(/겨울|서울|방울|거울|저울|울트라|울산|울릉|울타리/g,' ');
 const winter=SEASON_WINTER.filter(k=>k==='울'?woolText.includes(k):name.includes(k));
 return {summer,winter,keywords:[...summer,...winter],group:summer.length&&winter.length?'mixed':summer.length?'summer':winter.length?'winter':'other'};
}
function seasonScopeRows(rows,scope=seasonScope){return rows.filter(r=>r.mid==='침구/커튼/카페트'&&(scope==='all-bedding'||r.sub==='침구'));}
function seasonTake(rows,selection=seasonSelection){return rows.filter(r=>{const g=seasonMatchName(r.name).group;return selection==='all'?g!=='other':g===selection;});}
function seasonAnalysis(c,selection=seasonSelection,scope=seasonScope){
 const baseA=seasonScopeRows(c.a,scope),baseB=seasonScopeRows(c.b,scope),a=seasonTake(baseA,selection),b=seasonTake(baseB,selection);
 const groups=['summer','winter','mixed','other'].map(key=>{const aa=baseA.filter(r=>seasonMatchName(r.name).group===key),bb=baseB.filter(r=>seasonMatchName(r.name).group===key);return {key,a:sum(aa),b:sum(bb),qa:sum(aa,'qty'),qb:sum(bb,'qty'),rowsA:aa.length,rowsB:bb.length};});
 return {baseA,baseB,a,b,groups,ra:sum(a),rb:sum(b),qa:sum(a,'qty'),qb:sum(b,'qty')};
}
function seasonKeywordBrands(a,b,keyword,p,y){
 const matching=rows=>rows.filter(r=>seasonMatchName(r.name).keywords.includes(keyword));
 const aa=matching(a),bb=matching(b);
 const yearly=(rows,year)=>{
  const total=sum(rows),brands=[...group(rows,'brand')].map(([name,v])=>({name,rev:v.rev})).filter(r=>r.rev>0).sort((a,b)=>b.rev-a.rev||a.name.localeCompare(b.name,'ko')).slice(0,5);
  return panel(year+'년 브랜드 TOP5',`<p>키워드 판매액 합계: <b>${won(total)}원</b></p>`+table(['순위','브랜드','판매액','판매액 비중'],brands.map((r,i)=>[i+1,esc(r.name),won(r.rev)+'원',total>0?(r.rev/total*100).toFixed(1)+'%':'—'])));
 };
 return `<p><b>${esc(keyword)} · 브랜드별 판매액 비중</b></p><small>각 연도의 해당 키워드 전체 판매액을 분모로 계산하며, TOP5 합계 기준이 아닙니다. 양수 판매액 브랜드 중 상위 5개를 표시하고 미확인 브랜드도 포함합니다. 음수 조정도 전체 판매액에 포함하므로 비중이 100%를 넘을 수 있고, 합계가 0원 이하이면 비중은 —로 표시합니다.</small><div class="grid">${yearly(aa,p)}${yearly(bb,y)}</div>`;
}
function season(c){
 const m=seasonAnalysis(c),{a,b,ra,rb,qa,qb}=m,diff=rb-ra;
 const sort=rows=>rows.sort(seasonOrder==='down'?(x,y)=>x.diff-y.diff:seasonOrder==='up'?(x,y)=>y.diff-x.diff:(x,y)=>y.b-x.b);
 const dim=key=>{const rows=sort(compare(a,b,key));return table(['항목',c.p+'년 매출',c.y+'년 매출','증감액','증감률','전년 수량','당년 수량'],rows.map(r=>[esc(key==='channel'?cname(r.key):r.key),won(r.a),won(r.b),`<span class="${cls(r.diff)}">${signed(r.diff)}</span>`,percent(ratio(r.a,r.b)),won(r.qa),won(r.qb)]));};
 const products=sort(compare(a,b,'productKey'));
 const hits=rows=>[...new Set(rows.flatMap(r=>seasonMatchName(r.name).keywords))].join(', ')||'—';
 const rowGroups=rows=>[...new Set(rows.map(r=>SEASON_NAMES[seasonMatchName(r.name).group]))].join(', ')||'—';
 const productRows=products.map(r=>[esc(r.sample.name),esc(r.sample.brand),cname(r.sample.channel),won(r.a),won(r.b),`<span class="${cls(r.diff)}">${signed(r.diff)}</span>`,percent(ratio(r.a,r.b)),won(r.qa)+' → '+won(r.qb),r.qa>0?won(r.a/r.qa):'—',r.qb>0?won(r.b/r.qb):'—',esc(hits(r.rowsA)),esc(hits(r.rowsB))]);
 const keywords=[...SEASON_SUMMER,...SEASON_WINTER].map(keyword=>{const aa=a.filter(r=>seasonMatchName(r.name).keywords.includes(keyword)),bb=b.filter(r=>seasonMatchName(r.name).keywords.includes(keyword));return {keyword,a:sum(aa),b:sum(bb),qa:sum(aa,'qty'),qb:sum(bb,'qty')};});
 const baseRevenueA=sum(m.baseA),baseRevenueB=sum(m.baseB),shareA=baseRevenueA>0?ra/baseRevenueA*100:null,shareB=baseRevenueB>0?rb/baseRevenueB*100:null;
 $('view').innerHTML=panel('시즌상품 · 상품명 키워드 분석',`<div class="toolbar"><label>시즌<select id="season-choice">${[['summer','여름 상품 (혼합 제외)'],['winter','겨울 상품 (혼합 제외)'],['mixed','여름·겨울 키워드 혼합'],['all','전체 시즌상품 (중복 없이)']].map(([v,l])=>`<option value="${v}" ${seasonSelection===v?'selected':''}>${l}</option>`).join('')}</select></label><label>분석 범위<select id="season-scope"><option value="bedding" ${seasonScope==='bedding'?'selected':''}>침구 소분류만</option><option value="all-bedding" ${seasonScope==='all-bedding'?'selected':''}>침구/커튼/카페트 전체</option></select></label><label>브랜드·쇼핑몰·상품 정렬<select id="season-order">${[['sales','당년 매출 큰 순'],['down','감소액 큰 순'],['up','증가액 큰 순']].map(([v,l])=>`<option value="${v}" ${seasonOrder===v?'selected':''}>${l}</option>`).join('')}</select></label><button id="season-reset-filter">상단 필터를 침구 전체로</button></div><p><b>여름:</b> ${SEASON_SUMMER.join(', ')}<br><b>겨울:</b> ${SEASON_WINTER.join(', ')}</p><div class="notice">상단 채널·중분류·소분류·기간·비교 기준을 반영합니다. 상품명에서 키워드를 찾으며 판매월로 시즌을 정하지 않습니다. 양 시즌 키워드가 함께 있으면 혼합으로 분리해 중복 합산하지 않습니다.</div><small>울은 겨울·서울·방울·거울·저울·울트라·울산·울릉·울타리 속의 문자를 제외하고 소재 키워드로 찾습니다. 키워드 분류는 실제 소재·용도의 확정이 아니므로 상품별 매칭 단어를 확인하세요. 상품명 정보가 없는 행은 미일치로 남습니다.</small>`)+
 (!m.baseA.length&&!m.baseB.length?'<div class="notice warn">현재 상단 필터와 분석 범위에 해당하는 침구 자료가 없습니다. 침실가구·매트리스 등을 선택했다면 위의 침구 전체 필터 버튼을 눌러 주세요.</div>':'')+
 `<div class="cards">${kpi('선택 시즌 당년 매출',won(rb)+'원',`<span class="${cls(diff)}">${percent(ratio(ra,rb))} · ${signed(diff)}원</span>`)}${kpi('선택 시즌 판매량',won(qb)+'개',`${won(qa)}개 → ${won(qb)}개 · ${percent(ratio(qa,qb))}`)}${kpi('평균 판매단가',won(qb>0?rb/qb:null)+'원',`${won(qa>0?ra/qa:null)}원 → ${won(qb>0?rb/qb:null)}원`)}${kpi('분석 범위 내 매출 비중',shareB===null?'—':shareB.toFixed(1)+'%',`${c.p}년 ${shareA===null?'—':shareA.toFixed(1)+'%'} · ${c.y}년 ${shareB===null?'—':shareB.toFixed(1)+'%'}`)}</div>`+
 panel('여름·겨울·혼합·미일치 실적',`<small>각 행은 중복되지 않습니다. 합계는 현재 분석 범위의 전체 실적과 일치합니다. 음수·0원 조정 행도 제외하지 않습니다.</small>`+table(['시즌 분류',c.p+'년 매출',c.y+'년 매출','증감액','증감률','전년 수량','당년 수량','당년 매출 비중'],m.groups.map(r=>[SEASON_NAMES[r.key],won(r.a),won(r.b),signed(r.b-r.a),percent(ratio(r.a,r.b)),won(r.qa),won(r.qb),baseRevenueB>0?(r.b/baseRevenueB*100).toFixed(1)+'%':'—'])))+
 panel('선택 시즌 일별 매출 · '+c.label,'<div class="chart"><canvas id="season-daily"></canvas></div>')+
 `<div class="grid">${panel('선택 시즌 브랜드별 실적',dim('brand'))}${panel('선택 시즌 쇼핑몰별 실적',dim('mall'))}</div>`+
 panel('선택 시즌 상품별 실적','<small>선택 시즌으로 분류된 판매 행만 비교합니다. 전년에 해당 시즌의 행이 없으면 0원으로 표시되며, 신규 출시·단종을 의미하지 않습니다. 같은 상품이라도 상품명·시즌 키워드가 바뀌면 전체 상품 매출 증감과 다를 수 있습니다.</small>'+table(['상품명','브랜드','채널',c.p+'년 매출',c.y+'년 매출','증감액','증감률','전년→당년 수량','전년 평균단가','당년 평균단가','전년 매칭 키워드','당년 매칭 키워드'],productRows))+
 panel('선택 시즌 키워드별 실적',`<small>한 상품명에 냉감·여름 등 여러 키워드가 있으면 각 키워드에 표시됩니다. 이 표는 서로 중복되므로 행을 합산하지 마세요. 키워드를 누르면 전년·당년 브랜드 TOP5와 판매액 비중을 볼 수 있습니다.</small>`+table(['키워드',c.p+'년 매출',c.y+'년 매출','증감액','전년 수량','당년 수량'],keywords.map(r=>[`<button type="button" class="season-keyword-toggle" data-keyword="${esc(r.keyword)}" aria-expanded="false">${esc(r.keyword)} <span aria-hidden="true">▾</span></button>`,won(r.a),won(r.b),signed(r.b-r.a),won(r.qa),won(r.qb)])));
 document.querySelectorAll('.season-keyword-toggle').forEach(button=>button.onclick=()=>{
  const row=button.closest('tr'),open=button.getAttribute('aria-expanded')==='true';
  document.querySelectorAll('.season-keyword-detail').forEach(r=>r.remove());
  document.querySelectorAll('.season-keyword-toggle').forEach(b=>b.setAttribute('aria-expanded','false'));
  if(open)return;
  button.setAttribute('aria-expanded','true');
  row.insertAdjacentHTML('afterend',`<tr class="season-keyword-detail"><td colspan="6">${seasonKeywordBrands(a,b,button.dataset.keyword,c.p,c.y)}</td></tr>`);
 });
 $('season-choice').onchange=e=>{seasonSelection=e.target.value;render();};$('season-scope').onchange=e=>{seasonScope=e.target.value;render();};$('season-order').onchange=e=>{seasonOrder=e.target.value;render();};
 $('season-reset-filter').onclick=()=>{const wanted='침구/커튼/카페트';if(!Array.from($('section').options).some(o=>o.value===wanted)){$('error').textContent='선택한 채널에 침구/커튼/카페트 자료가 없습니다.';return;}$('section').value=wanted;updateSubcategories();$('subcategory').value='all';render();};
 const labels=[],va=[],vb=[];for(let t=Date.parse(c.s);t<=Date.parse(c.e);t+=DAY_MS){const dt=new Date(t).toISOString().slice(0,10),pd=shiftDate(c.ps,(t-Date.parse(c.s))/DAY_MS);labels.push(dt.slice(5)+' ↔ '+pd.slice(5));va.push(sum(a.filter(r=>r.date===pd)));vb.push(sum(b.filter(r=>r.date===dt)));}
 chart('season-daily',labels,[{label:String(c.p),data:va},{label:String(c.y),data:vb}],'line');
 setExport(['선택시즌','분석범위','당년시작일','당년종료일','전년시작일','전년종료일','상품명','브랜드','채널','상품코드','전년시즌분류','당년시즌분류','전년매칭키워드','당년매칭키워드','전년매출','당년매출','증감액','전년수량','당년수량','전년평균단가','당년평균단가'],products.map(r=>[seasonSelection==='all'?'전체 시즌상품':SEASON_NAMES[seasonSelection],seasonScope==='bedding'?'침구 소분류만':'침구/커튼/카페트 전체',c.s,c.e,c.ps,c.pe,r.sample.name,r.sample.brand,cname(r.sample.channel),r.sample.pid||r.sample.sid||'',rowGroups(r.rowsA),rowGroups(r.rowsB),hits(r.rowsA),hits(r.rowsB),r.a,r.b,r.diff,r.qa,r.qb,r.qa>0?r.a/r.qa:'',r.qb>0?r.b/r.qb:'']));
}
