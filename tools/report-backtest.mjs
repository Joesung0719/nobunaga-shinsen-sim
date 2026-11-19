// 戰報回測：把真實戰報的雙方陣容丟進 slg/engine.js 模擬，看預測的勝負／剩餘兵力和實際差多少。
// 用法：node tools/report-backtest.mjs <battles.json> [模擬次數=200] [等級=50]
// battles.json（私人資料，不進 repo）：[{id,res:'勝利|平局|敗北'(左方視角),L:[{n,t}],R:[{n,t}],Ltr:[剩,總],Rtr:[剩,總]}]
// 假設：雙方武將都 Lv50 滿紅、戰法＝固有＋（若戰報事件看得到）最常用的 2 個傳授戰法；沒資料的武將不補戰法。
import fs from 'node:fs';
import {battle,parseSkill,innateOf,fullRedStats,bestArm,K} from '../slg/engine.js';

const D=JSON.parse(fs.readFileSync(new URL('../land.json',import.meta.url)));
const [file,N=200,LV=50]=[process.argv[2],+(process.argv[3]||200),+(process.argv[4]||50)];
const B=JSON.parse(fs.readFileSync(file));
const PS=new Map(),ps=n=>{if(!PS.has(n))PS.set(n,parseSkill(n,D));return PS.get(n)};
const FIX={'立花辣千代':'立花誾千代','立花閣千代':'立花誾千代','啄木人為':'吸木人為'};
const norm=n=>FIX[n]||n;
// 戰報事件裡看得到的戰法（SKILLS=skills_seen.json：{武將:[戰法…]}，依出現次數排序）；沒有就只有固有戰法
const SEEN=process.env.SKILLS?JSON.parse(fs.readFileSync(process.env.SKILLS)):{};
const inh=n=>(SEEN[n]||[]).filter(s=>s!==innateOf(D,n)&&ps(s).modeled==='text'&&['主動','突擊','指揮','被動'].includes(ps(s).kind)).slice(0,2);
let seed=12345;const rng=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};

function mk(side,gens,name){
  const names=gens.map(g=>norm(g.n)),arm=bestArm(D,names)||'槍';
  return{name,side,arm,terrain:'平',gens:gens.map((g,i)=>{
    const n=names[i],st=fullRedStats(D,n,names,arm,LV);
    return{n,st,troops:g.t,max:g.t,skills:[innateOf(D,n),...inh(n)].filter(Boolean).map(ps),bg:null}})};
}
const rows=[];let skipped=0;
for(const b of B){
  const all=[...b.L,...b.R].map(g=>norm(g.n));
  if(all.some(n=>!D.stats[n])||b.L.length>3||b.R.length>3){skipped++;continue}
  let W=0,Dr=0,Ls=0,lf=0,rf=0;
  for(let i=0;i<N;i++){
    const A=mk(0,b.L,'L'),C=mk(1,b.R,'R'),r=battle(A,C,rng);
    if(r.res==='W')W++;else if(r.res==='D')Dr++;else Ls++;
    lf+=A.gens.reduce((a,g)=>a+Math.max(0,g.troops),0)/b.Ltr[1];
    rf+=C.gens.reduce((a,g)=>a+Math.max(0,g.troops),0)/b.Rtr[1];
  }
  const act={勝利:'W',平局:'D',敗北:'L'}[b.res];
  rows.push({id:b.id,act,pW:W/N,pD:Dr/N,pL:Ls/N,pl:lf/N,pr:rf/N,al:b.Ltr[0]/b.Ltr[1],ar:b.Rtr[0]/b.Rtr[1]});
}
const pick=r=>r.pW>=r.pD&&r.pW>=r.pL?'W':r.pL>=r.pD?'L':'D';
const hit=rows.filter(r=>pick(r)===r.act).length;
const brier=rows.reduce((a,r)=>a+(r.pW-(r.act==='W'))**2+(r.pD-(r.act==='D'))**2+(r.pL-(r.act==='L'))**2,0)/rows.length;
// 較有把握的對戰（預測勝率或敗率 ≥ 80%）
const conf=rows.filter(r=>Math.max(r.pW,r.pL)>=.8),chit=conf.filter(r=>pick(r)===r.act).length;
// 左右兵力剩餘比例差（預測 vs 實際）
const m=a=>a.reduce((x,y)=>x+y,0)/a.length;
const corr=(x,y)=>{const mx=m(x),my=m(y);let s=0,a=0,b=0;x.forEach((v,i)=>{s+=(v-mx)*(y[i]-my);a+=(v-mx)**2;b+=(y[i]-my)**2});return s/Math.sqrt(a*b)};
const dl=rows.map(r=>r.pl-r.pr),da=rows.map(r=>r.al-r.ar);
console.log(JSON.stringify({K:{base:K.base,statDiv:K.statDiv},lv:LV,N,battles:B.length,used:rows.length,skipped,
  outcomeAccuracy:+(hit/rows.length).toFixed(3),brier:+brier.toFixed(3),
  confident:{n:conf.length,acc:conf.length?+(chit/conf.length).toFixed(3):null},
  remainDiffCorr:+corr(dl,da).toFixed(3),
  meanAbsErr:+m(dl.map((v,i)=>Math.abs(v-da[i]))).toFixed(3),
  actualMix:Object.fromEntries(['W','D','L'].map(k=>[k,rows.filter(r=>r.act===k).length])),
  predMix:Object.fromEntries(['W','D','L'].map(k=>[k,rows.filter(r=>pick(r)===k).length]))},null,1));
if(process.env.OUT)fs.writeFileSync(process.env.OUT,JSON.stringify(rows));
