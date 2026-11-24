// 戰法強度表 skillpower.json：每個可傳授戰法裝在「武勇型／智略型」武將身上，用戰鬥引擎打 Lv8／Lv9 守軍，平均比沒裝多贏多少兵力比例（推估）。
// 用法：node tools/skill-power.mjs   （約 1～2 分鐘）。slg/teamlib.js 的推薦戰法以此為基礎分。
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
import {makeKit} from '../slg/teamlib.js';
import {battle} from '../slg/engine.js';
import {FAC_FULL} from '../slg/rules.js';
const {D}=L;const OFFI=JSON.parse(fs.readFileSync(new URL('../official.json',import.meta.url)));const kit=makeKit(D,{official:OFFI});
const R=L.rng(20261120),FAC=FAC_FULL,TROOPS=10000;
const GEN=Object.keys(D.stats).filter(n=>D.stats[n].season!=='限定');
const sumT=t=>t.gens.reduce((a,g)=>a+Math.max(0,g.troops),0),sumM=t=>t.gens.reduce((a,g)=>a+g.max,0);
const phys=n=>{const s=D.stats[n].st;return s.武勇[0]+s.武勇[1]*40>=s.智略[0]+s.智略[1]*40};
const top=[...GEN].sort((a,b)=>L.costOf(b)-L.costOf(a)),rr=L.rng(7),REFS=[];
const NREF=+(process.env.NREF||32),NREP=+(process.env.NREP||3);   // 2026-11-24：參考隊 16→32、每場 2→3 次，降低雜訊
for(let i=0;i<NREF;i++){const g=[];while(g.length<3){const n=top[Math.floor(rr()*60)];if(!g.includes(n))g.push(n)}REFS.push(g)}
const FOES=[8,9].flatMap(lv=>L.garrisonsAt(lv).map(k=>L.garrison(k,lv)));
const mrg=(my,foe)=>{const A=L.clone(my),B=L.clone(foe);const r=battle(A,B,R);return(sumT(A)/sumM(A)-sumT(B)/sumM(B))+(r.res==='W'?.3:r.res==='L'?-.3:0)};
const score=(names,extra,arm='騎')=>{const st=L.teamStats(names,arm,50,0,FAC),sk=names.map(()=>[]);if(extra)sk[extra[0]].push(extra[1]);
  const my=L.myTeam(names,arm,st,sk,TROOPS);let a=0;for(const f of FOES)for(let i=0;i<NREP;i++)a+=mrg(my,f);return a/(FOES.length*NREP)};
const baseBy={},baseOf=(arm,ri)=>(baseBy[arm]??=REFS.map(r=>score(r,null,arm)))[ri],out={};
for(const s of kit.POOL){out[s]={};for(const[k,isP]of[['p',true],['m',false]]){let a=0,c=0;
  REFS.forEach((r,ri)=>r.forEach((n,i)=>{if(phys(n)===isP){{const arm=kit.ps(s).arm||'騎';a+=score(r,[i,s],arm)-baseOf(arm,ri);c++}}}));out[s][k]=c?+(a/c).toFixed(4):0}}
fs.writeFileSync(new URL('../skillpower.json',import.meta.url),JSON.stringify(out));
const top5=k=>Object.entries(out).sort((a,b)=>b[1][k]-a[1][k]).slice(0,6).map(x=>x[0]+x[1][k]);
console.log(kit.POOL.length,'skills; phys',top5('p'),'mag',top5('m'));
