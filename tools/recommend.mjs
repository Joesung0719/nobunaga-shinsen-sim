// 開荒隊伍推薦 v3：總 Cost 15～20 的所有三人組合 → 引擎模擬打各級土地守軍 → 輸出 recommend.json。
// 戰法由 slg/teamlib.js 評估（武將特性、勢力／一門、發動機率、干擾、紅度＋戰報實戰紀錄），同隊戰法依「數量」不重複。
// 假設（頁面也會寫出來）：武將 Lv50、0 紅（最省資源）、戰法滿級、設施 協力 Lv5／兵種營 Lv5、每人 9900 兵。
// 用法：node tools/recommend.mjs     （先跑過 tools/skill-power.mjs 與 tools/mine-reports.py）
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
import {makeKit} from '../slg/teamlib.js';
import {battle,statsAt} from '../slg/engine.js';
const {D,CARDS}=L,J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url)));
const POWER=J('skillpower.json'),FIELD=J('field.json'),EX=J('generals_extra.json');
const TAGS=Object.fromEntries(Object.entries(EX).map(([k,v])=>[k,v.tags||[]]));
const CARD=new Map(CARDS.map(c=>[c.n,c]));
const RATE={5:0.0016,4:0.009,3:0.0344};
const pulls=n=>1/(CARD.get(n)?.s1/100||RATE[L.rarityOf(n)]||RATE[5]);
const kit=makeKit(D,{power:POWER,tags:TAGS,pulls,field:FIELD,official:J('official.json')});
const CMIN=15,CMAX=20,FAC={co:10,arm:5,ka:3,same:true},TROOPS=9900,LV=50,LANDS=[4,5,6,7,8,9,10];
const R=L.rng(20261120),t0=Date.now(),log=m=>console.error(`[${((Date.now()-t0)/1000).toFixed(0)}s] ${m}`);
// Joe 2026-11-21：第六季，玩家已有大部分武將、差在紅度，沒人用紫將 → 戰法滿級（Lv10）、兵學不計；只推金將（5★），不算抽數／取得成本
const GEN=Object.keys(D.stats).filter(n=>D.stats[n].season!=='限定'&&L.rarityOf(n)===5),cost=L.costOf;
const sumT=t=>t.gens.reduce((a,g)=>a+Math.max(0,g.troops),0),sumM=t=>t.gens.reduce((a,g)=>a+g.max,0);
const mrg=(my,foe)=>{const A=L.clone(my),B=L.clone(foe);const r=battle(A,B,R);return(sumT(A)/sumM(A)-sumT(B)/sumM(B))+(r.res==='W'?.3:r.res==='L'?-.3:0)};
const FOE8=L.garrisonsAt(8).map(k=>L.garrison(k,8)),FOE9=L.garrisonsAt(9).map(k=>L.garrison(k,9));
// 原始屬性代理分（Lv50）：先篩掉明顯弱的組合
const raw={};for(const n of GEN){const s=statsAt(D,n,LV,L.rarityOf(n));raw[n]=Math.max(s.武勇,s.智略)+s.統率*.7+s.速度*.5}
const defArm=names=>[...L.armsWithSynergy(names)][0]||'騎';
const mkTeam=(names,arm,sk,slv=null)=>{const st=L.teamStats(names,arm,LV,0,FAC);return{st,team:L.myTeam(names,arm,st,sk,TROOPS,slv)}};
function plan(names,arm){   // 組出戰法：回傳 sel、why
  const st=L.teamStats(names,arm,LV,0,FAC);
  const tm=names.map((n,i)=>({n,red:0,st:st[i]})),pl=kit.pick(tm,null,{},{arm});
  return{...pl,q:kit.quality(tm,pl.sel,arm)};
}
// ---- 階段 1：全部組合，代理分取前段 ----
const cand=[];
for(let i=0;i<GEN.length;i++)for(let j=i+1;j<GEN.length;j++)for(let k=j+1;k<GEN.length;k++){
  const c=cost(GEN[i])+cost(GEN[j])+cost(GEN[k]);if(c<CMIN||c>CMAX)continue;
  cand.push({names:[GEN[i],GEN[j],GEN[k]],c,p:raw[GEN[i]]+raw[GEN[j]]+raw[GEN[k]]})}
log(`組合 ${cand.length}`);
const pre=[];for(let c=CMIN;c<=CMAX;c++)pre.push(...cand.filter(x=>x.c===c).sort((a,b)=>b.p-a.p).slice(0,3500));
// 戰報實戰分高的也入選
for(const x of cand){const f=kit.fieldScore(x.names);x.f=f.score}
for(let c=CMIN;c<=CMAX;c++)pre.push(...cand.filter(x=>x.c===c).sort((a,b)=>b.f-a.f).slice(0,400));
// 合盟情境：三個不同勢力的組合也要入選（合盟需三勢力各不同，同勢力組合吃協力）
const mixed=cand.filter(x=>new Set(x.names.map(n=>D.stats[n].f)).size===3);
for(let c=CMIN;c<=CMAX;c++)pre.push(...mixed.filter(x=>x.c===c).sort((a,b)=>(b.p+b.f*20)-(a.p+a.f*20)).slice(0,1500));
const uniq=new Map();for(const x of pre)uniq.set(x.names.join('|'),x);
log(`階段 1 入選 ${uniq.size}`);
// ---- 階段 2：每隊排大將 × 兵種，擇優；再算各級土地勝率 ----
const ARMS=['騎','弓','槍','鐵炮'];
const mid=[];let done=0,rej=0;
for(const x of uniq.values()){
  let best=null;
  // 大將由規則決定（大將技 > Cost > 指揮型 > 政務，見 teamlib leaderFirst），不再靠 4 次隨機模擬挑——那樣大將位幾乎是雜訊，Cost6 常被排到大將
  { const names=kit.leaderFirst(x.names);
    for(const arm of ARMS){
      const pl=plan(names,arm);if(!pl.q.ok){rej++;continue}   // 搭配不合格的直接不入榜
      const{team}=mkTeam(names,arm,pl.sel);let a=0;
      for(let q=0;q<4;q++)a+=mrg(team,FOE8[q%FOE8.length]);
      if(!best||a>best.a)best={a,a2:a,names,arm,pl}
    }
  }
  if(best)mid.push({x,...best});
  if(++done%2000===0)log(`階段 2 ${done}/${uniq.size}`);
}
// 每個 Cost 留粗篩前 400，再細算（24 次）
const fin=[];
for(let c=CMIN;c<=CMAX;c++)fin.push(...mid.filter(m=>m.x.c===c).sort((a,b)=>b.a-a.a).slice(0,330));
const _unused=(names,sk)=>{const src=new Set();for(const s of sk.flat()){const so=kit.SRC[s]||[];if(!so.length)continue;const g=so.reduce((a,x)=>pulls(x)<pulls(a)?x:a);if(!names.includes(g))src.add(g)}return src};
const teams=[];let k2=0;
for(const m of fin){
  const names=m.names,sk=m.pl.sel,{team}=mkTeam(names,m.arm,sk);
  const w={};for(const lv of LANDS){const r=marchPct(team,lv,24);w[lv]=r}
  const src=[],gen=0,ks=0;   // 不再計抽數
  const f=kit.fieldScore(names);
  teams.push({q:m.pl.q.score,n:names,a:m.arm,s:sk,c:m.x.c,r:[gen,ks,src],w,f:[+f.score.toFixed(3),f.n,f.each,f.pairs,f.trio],why:m.pl.why});
  if(++k2%300===0)log(`細算 ${k2}/${fin.length}`);
}
function marchPct(my,lv,reps){
  const keys=L.garrisonsAt(lv),w=D.levels[lv].waves||1;let win=0,left=0;
  for(let i=0;i<reps;i++){const ks=[...keys].sort(()=>R()-.5).slice(0,w);const me=L.clone(my);let ok=true;
    for(const k of ks){const r=battle(me,L.garrison(k,lv),R);if(r.res!=='W'){ok=false;break}}
    if(ok){win++;left+=sumT(me)/sumM(me)}}
  return[Math.round(win/reps*100),win?Math.round(left/win*100):0]
}
const names=new Set(teams.flatMap(t=>[...t.n,...t.r[2]]));
const info=n=>({r:L.rarityOf(n),c:cost(n),f:D.stats[n].f,season:D.stats[n].season,inn:L.innateOf(D,n),tags:TAGS[n]||[],pulls:Math.round(pulls(n)),st:Object.fromEntries(['武勇','智略','統率','速度'].map(k=>[k,Math.round(statsAt(D,n,LV,L.rarityOf(n))[k])]))});
const gens=Object.fromEntries([...names].map(n=>[n,info(n)]));
const assumptions={cost:[CMIN,CMAX],lands:LANDS,lv:LV,red:0,troops:TROOPS,fac:FAC,built:new Date().toISOString().slice(0,10),
  note:'武將 Lv50、0 紅、戰法滿級、協力 Lv5／兵種營 Lv5、每人 9900 兵；打下一級土地 = 依序打完該級所有守軍隊（兵力不補、平局算失敗），24 次模擬；兵學、裝備未計。只推金將（5★），假設已擁有大部分武將、差在紅度，不計抽數／取得成本；升級路線＝Cost 提高後用繼承券換將（最少更換 1 位／全面換血）。'};
// ---- 升級路線：Cost 提高後用繼承券換將 ----
// 最少更換＝只換一位（繼承券 1 張，其餘兩人沿用）；全面換血＝不顧資源，直接換成該 Cost 內最強的另一組。
const sc=t=>(t.w[9][0]+t.w[10][0])/2;
const better=(a,b)=>(b.q||0)-(a.q||0)||sc(b)-sc(a)||b.w[10][1]-a.w[10][1];
teams.forEach(t=>{
  const up=[];
  for(let c=t.c+1;c<=CMAX;c++){
    const cs=teams.filter(u=>u.c===c);
    const one=cs.filter(u=>u.n.filter(x=>t.n.includes(x)).length===2).sort(better)[0];
    const full=cs.filter(u=>u.n.filter(x=>t.n.includes(x)).length<=1).sort(better)[0];
    if(one||full)up.push([c,one?teams.indexOf(one):-1,full?teams.indexOf(full):-1]);
  }
  if(up.length)t.up=up;
});
fs.writeFileSync(new URL('../recommend.json',import.meta.url),JSON.stringify({assumptions,gens,teams}));
log(`搭配不合格排除 ${rej} 種（隊伍×兵種）；輸出 ${teams.length} 隊，${(fs.statSync(new URL('../recommend.json',import.meta.url)).size/1e6).toFixed(2)}MB`);
