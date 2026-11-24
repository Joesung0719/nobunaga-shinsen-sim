// 一鍵推薦的底：官方大名錄編制原樣（Joe 2026-11-21：「通通都不行」→ 不再自己組新隊）。
// 產生 official-rec.json：每個官方編制（三人、戰法完整者）原配戰法、兵種（官方有標就用官方，沒標用隊伍特性推算）、Cost，
// 以及「官方編制互打」的平均模擬勝率（0 紅、5 紅各一次，Lv50、戰法滿級，只用來排序）。用法：node tools/official-rec.mjs
import {FAC_FULL} from '../slg/rules.js';
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
import {battle,parseSkill,innateOf,fullRedStats,bestArm} from '../slg/engine.js';
const {D}=L,J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url)));
const OFF=J('official.json'),FULL=FAC_FULL,A={足輕:'槍',弓兵:'弓',騎兵:'騎',鐵炮:'鐵炮'};
const T=OFF.map((t,i)=>({...t,id:i})).filter(t=>t.gens.length===3&&t.gens.every(g=>g.s[0]&&g.s[1]&&D.stats[g.n]));
let seed=20261121;const R=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const armOf=t=>A[t.arm]||bestArm(D,t.gens.map(g=>g.n))||'槍';
const mk=(t,red,side)=>{const names=t.gens.map(g=>g.n),arm=armOf(t);return{name:names[0],side,arm,terrain:'平',study:true,gens:t.gens.map(g=>({n:g.n,f:D.stats[g.n].f,st:fullRedStats(D,g.n,names,arm,50,red,FULL),troops:10000,max:10000,skills:[innateOf(D,g.n),...g.s].filter(Boolean).map(s=>parseSkill(s,D)),bg:null}))}};
const out=T.map(t=>{const names=t.gens.map(g=>g.n);let w=0,c=0;
  for(const red of[0,5])for(const o of T){if(o===t)continue;for(let k=0;k<2;k++){const r=battle(mk(t,red,0),mk(o,red,1),R).res;w+=r==='W'?1:r==='D'?.5:0;c++}}
  return{id:t.id,sec:t.sec,rank:t.rank,team:names,arm:armOf(t),armOfficial:!!A[t.arm],skills:Object.fromEntries(t.gens.map(g=>[g.n,g.s])),cost:names.reduce((a,n)=>a+D.stats[n].c,0),winRate:+(w/c).toFixed(3)}});
out.sort((a,b)=>b.winRate-a.winRate);
fs.writeFileSync(new URL('../official-rec.json',import.meta.url),JSON.stringify(out));
console.log(out.length,'隊；前 3：',out.slice(0,3).map(x=>x.team.join('、')+' '+x.winRate).join(' ｜ '));
