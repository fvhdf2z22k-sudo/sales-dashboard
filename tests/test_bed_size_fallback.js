'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert');
vm.runInThisContext(fs.readFileSync('assets/categories.js','utf8'));
for(const [token,label] of Object.entries({SS:'슈퍼싱글(SS)',Q:'퀸(Q)',D:'더블(D)',K:'킹(K)',S:'싱글(S)'})){
 assert.equal(_bedSizeFromName('12021100',`침대 ${token}[매트별도]`),label);
 assert.equal(_bedSizeFromName('12021100',`침대/${token.toLowerCase()}`),label);
}
for(const name of ['침대','침대 SS/Q','침대 S·SS','모델 D2178A','모델 SS123','침대 LK','침대 KS','침대 DS','침대 XS'])assert.equal(_bedSizeFromName('12021100',name),null,name);
for(const code of ['12021105','12021199','12020400','120211','1202','12080100'])assert.equal(_bedSizeFromName(code,'침대 Q'),null,code);
assert.equal(_decodeCatStr('12021100').det,'미확인 (00)');
const rows=JSON.parse(fs.readFileSync('data/public.json')).rows.filter(r=>r.channel==='enuri'&&r.cat==='12021100'&&r.date>='2025-11-02'&&r.date<='2025-11-23');
assert.equal(rows.length,47);assert.equal(rows.reduce((s,r)=>s+r.rev,0),30336708);
const counts={};for(const r of rows){const size=_bedSizeFromName(r.cat,r.name)||'미확인';counts[size]=(counts[size]||0)+1;}
console.log('PASS size tokens, boundaries, ambiguity, registered-code priority, unchanged raw decoding; 47-row breakdown:',counts);
