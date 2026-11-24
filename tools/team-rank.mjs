// 榜單 rank.json（2026-11-24 重做，問題總表 R4、R5）：Cost 15～20 的金將三人組互打，依勝率排名。
// 用法：node tools/team-rank.mjs        （0 紅、5 紅各算一份，約 5～10 分鐘）
// 和 AI 配隊（slg/aisearch.js makeAI.buildMe）用同一個建隊函式：特性戰鬥效果、兵學全開、戰法 Lv10、兵種依特性（slg/rules.js chooseArm）、設施全滿（家門不勾）。
// 和舊版不同：
//  · 不再要求「和官方編制共用 2 人」、戰法不限官方出現過（Joe 2026-11-22：官方只當參考）。
//  · 不再給同勢力／官方熟悉度加分；同勢力、三勢力（合盟）、兩勢力混搭分層取樣，各層公平比勝率。
//  · 每個 Cost（15～20）各列 8 隊，同一位武將在同一份榜單最多出現 4 次，避免被少數武將佔滿。
import fs from 'node:fs';
import {battle,innateOf} from '../slg/engine.js';
import {makeKit} from '../slg/teamlib.js';
import {makeAI} from '../slg/aisearch.js';
import {chooseArm,facType} from '../slg/rules.js';

const J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url)));
const D=J('land.json');
const kit=makeKit(D,{power:J('skillpower.json'),field:J('field.json'),official:J('official.json')});
const ai=makeAI(D,kit);
const CMIN=15,CMAX=20,PER_COST=8,MAX_USE=4,REDS=[0,5];
let seed=2026;const R=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const shuffle=a=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b};
const t0=Date.now(),log=m=>console.error(`[${((Date.now()-t0)/1000).toFixed(0)}s] ${m}`);
const cost=n=>D.stats[n]?.c||0;
const GEN=Object.keys(D.stats).filter(n=>D.stats[n].c&&(D.stats[n].r||5)===5&&D.stats[n].season!=='限定'&&innateOf(D,n));

// 階段 0：所有 Cost 15～20 三人組，依 Cost × 勢力型態分層，層內覆蓋取樣（每位武將出現次數接近）
const strata={};
for(let i=0;i<GEN.length;i++)for(let j=i+1;j<GEN.length;j++)for(let k=j+1;k<GEN.length;k++){
  const ns=[GEN[i],GEN[j],GEN[k]],c=cost(ns[0])+cost(ns[1])+cost(ns[2]);if(c<CMIN||c>CMAX)continue;
  const key=c+'|'+facType(D,ns);(strata[key]??=[]).push(ns)}
const QUOTA={same:180,alliance:180,mixed:90};
const seeds=[];
for(const[key,arr]of Object.entries(strata)){const want=Math.min(arr.length,QUOTA[key.split('|')[1]]);
  if(arr.length<=want){seeds.push(...arr);continue}
  const sh=shuffle(arr),use={},got=new Set();let t=1;
  while(got.size<want&&t<500){for(let i=0;i<sh.length&&got.size<want;i++){if(got.has(i))continue;if(sh[i].every(n=>(use[n]||0)<t)){got.add(i);sh[i].forEach(n=>use[n]=(use[n]||0)+1)}}t++}
  for(const i of got)seeds.push(sh[i])}
log(`三人組 ${Object.values(strata).reduce((a,v)=>a+v.length,0)}，取樣 ${seeds.length}`);

function rank(red){
  const ents=[];
  for(const ns0 of seeds){const ns=kit.leaderFirst(ns0),aa=chooseArm(D,ns),arm=aa.arms[0],t=ai.buildMe(ns,arm,red);
    if(t)ents.push({names:ns,arm,why:aa.why,type:facType(D,ns),cost:ns.reduce((a,n)=>a+cost(n),0),t,w:0,n:0})}
  log(`${red} 紅：可建隊 ${ents.length}`);
  const duel=(a,b,k)=>{let w=0;for(let i=0;i<k;i++){const r=battle(structuredClone(a.t),{...structuredClone(b.t),side:1},R).res;w+=r==='W'?1:r==='D'?.5:0}return w};
  const play=(list,field,k)=>{for(const e of list)for(const f of field){if(f===e)continue;e.w+=duel(e,f,k);e.n+=k}};
  const sc=e=>e.n?e.w/e.n:0;
  // 階段 1：對 16 支隨機隊各打 2 場
  play(ents,shuffle(ents).slice(0,16),2);
  // 階段 2：每個 Cost × 型態取前 1/4（至少 10 隊），對「階段 1 前 60 名」各打 4 場
  const top60=[...ents].sort((a,b)=>sc(b)-sc(a)).slice(0,60);
  const by={};for(const e of ents)(by[e.cost+'|'+e.type]??=[]).push(e);
  const r2=Object.values(by).flatMap(a=>a.sort((x,y)=>sc(y)-sc(x)).slice(0,Math.max(10,Math.ceil(a.length/4))));
  for(const e of r2){e.w=0;e.n=0}play(r2,top60,4);
  log(`${red} 紅：第二輪 ${r2.length} 隊`);
  // 階段 3：每個 Cost 取前 20，對第二輪前 40 名各打 10 場（獨立重算，避免挑選偏差）
  const strong=[...r2].sort((a,b)=>sc(b)-sc(a)).slice(0,40);
  const fin=[];for(let c=CMIN;c<=CMAX;c++)fin.push(...r2.filter(e=>e.cost===c).sort((a,b)=>sc(b)-sc(a)).slice(0,20));
  for(const e of fin){e.w=0;e.n=0}play(fin,strong,10);
  // 挑榜：每個 Cost 8 隊，同勢力／合盟／混搭至少各 2 隊（有的話），同一位武將整份榜最多 4 次
  const use={},out=[];
  for(let c=CMIN;c<=CMAX;c++){const cs=fin.filter(e=>e.cost===c).sort((a,b)=>sc(b)-sc(a)),got=[];
    const ok=e=>!got.includes(e)&&e.names.every(n=>(use[n]||0)<MAX_USE);
    const take=e=>{got.push(e);e.names.forEach(n=>use[n]=(use[n]||0)+1)};
    for(const ty of['same','alliance','mixed'])cs.filter(e=>e.type===ty&&ok(e)).slice(0,2).forEach(take);
    for(const e of cs){if(got.length>=PER_COST)break;if(ok(e))take(e)}
    out.push(...got.sort((a,b)=>sc(b)-sc(a)))}
  return out.sort((a,b)=>sc(b)-sc(a)).map(e=>({team:e.names,cost:e.cost,winRate:+sc(e).toFixed(3),score:+sc(e).toFixed(3),arm:e.arm,armWhy:e.why,type:e.type,
    skills:Object.fromEntries(e.names.map((n,i)=>[n,e.t.sel[i].filter(Boolean)])),   // 只放兩個傳授戰法（固有戰法頁面自己補，和 recommend.json 一致）
    seasons:e.names.map(n=>D.stats[n].season)}));
}
const res={};for(const r of REDS)res[r]=rank(r);
fs.writeFileSync(new URL('../rank.json',import.meta.url),JSON.stringify(res));
for(const r of REDS){const a=res[r],ty={};a.forEach(x=>ty[x.type]=(ty[x.type]||0)+1);const g=new Set(a.flatMap(x=>x.team));
  console.log(`${r} 紅：${a.length} 隊、${g.size} 位武將、型態 ${JSON.stringify(ty)}；前 5：`);a.slice(0,5).forEach(x=>console.log(`  ${x.team.join('、')} ${x.arm} ${x.type} 勝率 ${x.winRate} Cost ${x.cost}`))}
log('完成');
