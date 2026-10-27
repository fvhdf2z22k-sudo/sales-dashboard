
// 에누리 코드: 대분류 / 중분류 / 소분류 / 미분류. 미등록 코드의 이름을 추정하지 않는다.
function _decodeCatStr(value){
 const s=String(value??'').trim(),parts=s.match(/.{1,2}/g)||[];
 const [major='',mid='',sub='',det='']=parts;
 const midMap={'02':'침대/매트리스','08':'침구/커튼/카페트'};
 const subMap={'02':{'04':'매트리스','11':'침대','02':'침대'},'08':{'01':'커튼/블라인드','08':'커튼/블라인드','13':'카페트/대자리','28':'침구'}};
 const detMap={'02/04':{'06':'스프링','07':'라텍스','08':'메모리폼/폼매트'},'02/11':{'01':'싱글(S)','05':'슈퍼싱글(SS)','18':'유아침대','26':'더블(D)','27':'패밀리침대','28':'모션베드','30':'침대소품','31':'돌/침대.소파','33':'퀸(Q)','34':'킹(K)','35':'2단/2층침대'},'08/28':{'02':'이불/패드/커버','08':'베개'},'08/01':{'00':'커튼/블라인드'},'08/08':{'00':'커튼/블라인드'},'08/13':{'00':'카페트/대자리'}};
 const unknown=(x)=>x?'미확인 ('+x+')':'코드 없음';
 if(!/^\d{2}(?:\d{2}){0,3}$/.test(s))return {major:'코드 오류',mid:'코드 오류',sub:'코드 오류',det:'코드 오류',parts,known:false};
 const validMajor=major==='12',mn=validMajor?midMap[mid]:null,sn=mn?(subMap[mid]||{})[sub]:null,dn=sn?(detMap[mid+'/'+sub]||{})[det]:null;
 return {major:validMajor?'가구':unknown(major),mid:mn||unknown(mid),sub:sn||unknown(sub),det:dn||unknown(det),parts,known:!!(validMajor&&mn&&sn&&dn)};
}

