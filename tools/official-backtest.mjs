// 官方編制回測：拿官方「大名錄」148 組編制（official.json）檢驗推薦邏輯。用法：node tools/official-backtest.mjs
// ① 戰法命中率：推薦邏輯對每一隊官方三人組挑戰法，和官方實際帶的比（「規則版」不看官方先驗；「含先驗版」會排除同一組三人，避免作弊）。
// ② 官方編制通過搭配品質檢查的比例，以及不通過的原因。
// ③ 戰力：官方編制、同三人用推薦戰法、隨機亂配，對一批隨機對手的模擬勝率（引擎只模擬有建模的戰法，僅供參考）。
import {FAC_FULL} from '../slg/rules.js';
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
import {makeKit} from '../slg/teamlib.js';
import {battle,bestArm,fullRedStats,innateOf,parseSkill} from '../slg/engine.js';
const {D}=L,J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url)));
const OFF=J('official.json'),POWER=J('skillpower.json'),FIELD=J('field.json');
const kitRule=makeKit(D,{power:POWER,field:FIELD,official:OFF.map(t=>({...t,gens:[]}))});   // 規則版：不給先驗，但要讓沒有來源的官方戰法進候選池
const kitFull=makeKit(D,{power:POWER,field:FIELD,official:OFF});
// 規則版的池要和含先驗版一樣大：把官方戰法名單另外塞進去
const FULL=FAC_FULL,LV=50,RED=0;
const A={足輕:'槍',弓兵:'弓',騎兵:'騎',鐵炮:'鐵炮'};
const armOf=(t,names)=>A[t.arm]||t.gens.flatMap(g=>g.s).map(s=>kitFull.ps(s).arm).find(Boolean)||bestArm(D,names)||'槍';
const T=OFF.filter(t=>t.gens.length===3&&t.gens[0].s[0]);
const sig=t=>t.gens.map(g=>g.n).sort().join('|');
const out={teams:T.length};
function evalKit(kit,label,useLoo){
  let tot=0,hit=0,full=0,gtot=0,okq=0,sc=0;const fails={},miss={};const bySec={};
  for(const t of T){
    const names=t.gens.map(g=>g.n),arm=armOf(t,names);
    const st=names.map(n=>({n,red:RED,st:fullRedStats(D,n,names,arm,LV,RED,FULL)}));
    const loo=useLoo?{gens:OFF.filter(o=>sig(o)===sig(t)).flatMap(o=>o.gens)}:null;
    const looObj=useLoo?{gens:OFF.filter(o=>sig(o)===sig(t)).flatMap(o=>o.gens)}:null;
    const pl=kit.pick(st,null,{},{arm,loo:looObj});
    t.gens.forEach((g,i)=>{gtot++;const h=g.s.filter(s=>pl.sel[i].includes(s)).length;hit+=h;tot+=2;if(h===2)full++;
      for(const s of g.s)if(!pl.sel[i].includes(s))miss[s]=(miss[s]||0)+1});
    const q=kit.quality(st,t.gens.map(g=>g.s),arm);if(q.ok)okq++;else for(const f of q.fails){const k=f.replace(/[一-鿿]{2,5}(的|自帶)/,'X$1').slice(0,22);fails[k]=(fails[k]||0)+1}
    const sec=t.sec.split(':')[0];(bySec[sec]??=[0,0]);bySec[sec][0]+=t.gens.reduce((a,g)=>a+g.s.filter(s=>pl.sel[t.gens.indexOf(g)].includes(s)).length,0);bySec[sec][1]+=6;
  }
  out[label]={戰法命中率:+(hit/tot).toFixed(3),兩招全中的武將比例:+(full/gtot).toFixed(3),官方編制通過品質檢查:`${okq}/${T.length}`,不通過原因:fails,最常漏掉:Object.entries(miss).sort((a,b)=>b[1]-a[1]).slice(0,12)};
}
evalKit(kitRule,'規則版（不看官方先驗）',false);
evalKit(kitFull,'含官方先驗（排除同三人）',true);
// ③ 戰力
let seed=20261121;const R=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const GEN=Object.keys(D.stats).filter(n=>D.stats[n].c&&D.stats[n].season!=='限定');
const ps=n=>parseSkill(n,D);
const mk=(names,arm,sk,side)=>({name:names[0],side,arm,terrain:'平',study:true,gens:names.map((n,i)=>({n,f:D.stats[n].f,st:fullRedStats(D,n,names,arm,LV,RED,FULL),troops:10000,max:10000,skills:[innateOf(D,n),...sk[i]].filter(Boolean).map(ps),bg:null}))});
const rnd=a=>a[Math.floor(R()*a.length)];
const OPP=[];while(OPP.length<80){const n=[rnd(GEN),rnd(GEN),rnd(GEN)];if(new Set(n).size<3)continue;const c=n.reduce((a,x)=>a+D.stats[x].c,0);if(c>20)continue;
  const arm=bestArm(D,n)||'槍',st=n.map(x=>({n:x,red:RED,st:fullRedStats(D,x,n,arm,LV,RED,FULL)}));OPP.push({n,arm,sk:kitFull.pick(st,null,{},{arm}).sel})}
const wr=(names,arm,sk)=>{let w=0,c=0;for(const o of OPP)for(let k=0;k<2;k++){w+=({W:1,D:.5,L:0})[battle(mk(names,arm,sk,0),mk(o.n,o.arm,o.sk,1),R).res];c++}return w/c};
const act=kitFull.POOL.filter(s=>kitFull.ps(s).kind==='主動');
let a=0,b=0,c=0,n=0;
for(const t of T){const names=t.gens.map(g=>g.n),arm=armOf(t,names);
  const st=names.map(x=>({n:x,red:RED,st:fullRedStats(D,x,names,arm,LV,RED,FULL)}));
  a+=wr(names,arm,t.gens.map(g=>g.s));b+=wr(names,arm,kitRule.pick(st,null,{},{arm}).sel);c+=wr(names,arm,names.map(()=>[rnd(act),rnd(act)]));n++}
out.戰力=`對 80 隊隨機對手的模擬勝率：官方戰法 ${(a/n*100).toFixed(1)}%｜推薦戰法 ${(b/n*100).toFixed(1)}%｜隨機主動 ${(c/n*100).toFixed(1)}%`;
console.log(JSON.stringify(out,null,1));
fs.writeFileSync(new URL('../audit/official-backtest.json',import.meta.url),JSON.stringify(out,null,1));
