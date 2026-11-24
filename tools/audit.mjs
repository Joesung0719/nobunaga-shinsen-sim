// 全庫自動檢查（2026-11-24 起，每次改資料或規則都要跑）：node tools/audit.mjs
//   錯誤（會讓推薦出錯，必須是 0，否則結束碼 1）＋提醒（已知缺口，數量只能變少）。
//   完整名單寫到 tools/audit-result.json。
import fs from 'node:fs';
import {parseSkill,innateOf,TRAIT_TODO} from '../slg/engine.js';
import {EST,hasTree} from '../slg/bingaku.js';
const J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url)));
const D=J('land.json'),CARDS=J('data.json');
const CARD=new Map(CARDS.map(c=>[c.n,c]));
const FAC6=['織田','豐臣','德川','武田','上杉','群雄'];
const UNITS=new Set(['弓足輕','槍足輕','鐵炮足輕','偵察騎兵']);
const names=Object.keys(D.stats).filter(n=>D.stats[n].c&&!UNITS.has(n));
const rOf=n=>D.stats[n]?.r||CARD.get(n)?.r;
const err={},warn={};const E=(k,v)=>(err[k]??=[]).push(v),W=(k,v)=>(warn[k]??=[]).push(v);
for(const n of names){const s=D.stats[n];
  if(!rOf(n))E('沒有稀有度',n);
  if(D.stats[n].r&&CARD.get(n)?.r&&D.stats[n].r!==CARD.get(n).r)E('稀有度兩處不一致',`${n} land.json ${D.stats[n].r} / data.json ${CARD.get(n).r}`);
  if(!FAC6.includes(s.f))E('勢力不在六勢力內',`${n}：${s.f}`);
  const inn=innateOf(D,n);if(!inn)E('沒有固有戰法',n);else if(!D.skillText[inn])E('固有戰法沒有說明文字',`${n}：${inn}`);
  if(rOf(n)===5&&(s.traits||[]).length!==4)E('金將特性不足 4 個',`${n}`);
  for(const t of s.traits||[])if(!D.traitText?.[n]?.[t])W('特性沒有說明文字',`${n}「${t}」`);
  for(const k of['武勇','智略','統率','速度'])if(!s.st?.[k])E('能力值缺漏',`${n} ${k}`);
  const b=D.skillText?.[inn]?.boss;
  if(b!=null&&/^\s*（?發動機率[\d.%→]+）?\s*$/.test(b))E('大將技欄只有發動機率（不是大將技）',`${n}「${inn}」`);
  if(rOf(n)===5&&!hasTree(n))W('金將沒有兵學樹',n);
}
for(const n in EST||{})W('兵學方向是推估',`${n}：${EST[n].join('、')}`);
const INN=new Set(names.map(n=>innateOf(D,n)).filter(Boolean));
for(const s of new Set([...INN,...Object.values(D.teach||{})])){const t=D.skillText[s];if(!t){W('戰法沒有說明文字',s);continue}
  if(t.kind==='內政')continue;const p=parseSkill(s,D,10),who=INN.has(s)?'固有':'傳授';
  if(p.modeled!=='text')W(`${who}戰法引擎沒有模擬`,s);else if(p.partial)W(`${who}戰法只模擬一部分`,s)}
for(const[t,x]of Object.entries(TRAIT_TODO(D)))W('特性引擎沒有模擬',`${t}：${x.slice(0,30)}`);
for(const[k,t]of Object.entries(D.teams||{}))for(const g of t)for(const s of g.s||[]){if(!D.skillText[s])W('守軍戰法沒有說明（引擎用推估值）',`${k} ${g.n}：${s}`);else if(parseSkill(s,D).modeled!=='text')W('守軍戰法引擎沒有模擬',`${k} ${g.n}：${s}`)}
fs.writeFileSync(new URL('./audit-result.json',import.meta.url),JSON.stringify({err,warn},null,1));
const nE=Object.values(err).reduce((a,v)=>a+v.length,0);
console.log(`錯誤 ${nE} 筆`);for(const[k,v]of Object.entries(err))console.log(`  ✗ ${k}：${v.length}（${v.slice(0,5).join('、')}${v.length>5?'…':''}）`);
console.log('提醒（已知缺口）');for(const[k,v]of Object.entries(warn))console.log(`  · ${k}：${v.length}`);
process.exit(nE?1:0);
