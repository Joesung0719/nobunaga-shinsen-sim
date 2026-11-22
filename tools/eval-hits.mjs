// 快速命中率評估（不做戰力模擬）：官方 123 隊（規則版／含先驗）＋ Joe 四隊。用法：node tools/eval-hits.mjs
// 供調整 teamlib TU 權重時掃參數用；也可 import {evalAll} 後先改 TU 再跑。
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
import {makeKit,TU} from '../slg/teamlib.js';
import {bestArm,fullRedStats} from '../slg/engine.js';
import {JOE} from './joe-teams.mjs';
const {D}=L,J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url)));
const OFF=J('official.json'),POWER=J('skillpower.json'),FIELD=J('field.json');
const FULL={co:10,arm:5,ka:3,same:true},A={足輕:'槍',弓兵:'弓',騎兵:'騎',鐵炮:'鐵炮'};
const T=OFF.filter(t=>t.gens.length===3&&t.gens[0].s[0]);
const sig=t=>t.gens.map(g=>g.n).sort().join('|');
export function evalAll(){
  const kitRule=makeKit(D,{power:POWER,field:FIELD,official:OFF.map(t=>({...t,gens:[]}))}),kitFull=makeKit(D,{power:POWER,field:FIELD,official:OFF});
  const armOf=(t,names)=>A[t.arm]||t.gens.flatMap(g=>g.s).map(s=>kitFull.ps(s).arm).find(Boolean)||bestArm(D,names)||'槍';
  const run=(kit,loo)=>{let hit=0,tot=0;for(const t of T){const names=t.gens.map(g=>g.n),arm=armOf(t,names);
    const st=names.map(n=>({n,red:0,st:fullRedStats(D,n,names,arm,50,0,FULL)}));
    const pl=kit.pick(st,null,{},{arm,loo:loo?{gens:OFF.filter(o=>sig(o)===sig(t)).flatMap(o=>o.gens)}:null});
    t.gens.forEach((g,i)=>{hit+=g.s.filter(s=>pl.sel[i].includes(s)).length;tot+=2})}return hit/tot};
  let jh=0,jt=0;for(const t of JOE){const names=t.gens.map(g=>g[0]);const st=names.map(n=>({n,red:0,st:fullRedStats(D,n,names,t.arm,50,0,FULL)}));
    const pl=kitRule.pick(st,null,{},{arm:t.arm});t.gens.forEach(([n,s],i)=>{jh+=s.filter(x=>pl.sel[i].includes(x)).length;jt+=2})}
  return{official規則版:+run(kitRule,false).toFixed(3),official含先驗:+run(kitFull,true).toFixed(3),Joe四隊:+(jh/jt).toFixed(3)};
}
if(import.meta.url===process.argv[1]?'file://'+process.argv[1]:import.meta.url.endsWith('eval-hits.mjs')&&process.argv[1]?.endsWith('eval-hits.mjs'))console.log(JSON.stringify(evalAll()));
