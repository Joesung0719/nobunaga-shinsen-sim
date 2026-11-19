// 開荒隊伍推薦：在「總 Cost ≤ 15、3 人一隊」的所有組合裡，用 slg/engine.js 的戰鬥引擎模擬打各級土地守軍，
// 找出「資源花最少、勝率夠高」的隊伍，輸出 recommend.json 給 recommend.html 用。
// 用法：node tools/recommend.mjs [Cost上限=15]
// 全部是推估：Cost 定義、戰法滿、資源（以登用期望抽數計）的假設寫在輸出檔 assumptions 裡，改常數重跑即可。
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
const {D,CARDS}=L;
const COST_CAP=+process.argv[2]||15;
const FAC={co:5,arm:5};          // 協力 Lv5（2.5%）、兵種營 Lv5（開荒初期設施不會太高）
const TROOPS=9900;               // 每位武將兵力（沿用組隊頁預設）
const PROFILES=[[30,0],[40,0],[50,0],[50,5]];   // [武將等級, 每人紅度]
const LANDS=[5,6,7,8,9,10];
const R=L.rng(20261119);
const t0=Date.now(),log=m=>console.error(`[${((Date.now()-t0)/1000).toFixed(0)}s] ${m}`);

// ---- 資源：登用期望抽數（單張）----
const CARD=new Map(CARDS.map(c=>[c.n,c]));
const RATE={5:0.0016,4:0.009,3:0.0344};   // 公告沒有個別機率的武將用同星級基準（0.16% / 0.90% / 3.44%）
const pulls=n=>1/(CARD.get(n)?.s1/100||RATE[L.rarityOf(n)]||RATE[5]);

// ---- 武將池：有數值、非限定 ----
const GEN=Object.keys(D.stats).filter(n=>D.stats[n].season!=='限定');
const cost=n=>L.costOf(n);

// ---- 戰法：可傳授戰法（每位武將一個）、有文字可模擬、非內政／兵種 ----
const SRC={};   // skill → [來源武將]
for(const [g,s] of Object.entries(D.teach))(SRC[s]??=[]).push(g);
const SKILLS=Object.keys(SRC).filter(n=>{const p=L.ps(n);return p.modeled==='text'&&!['內政','兵種'].includes(p.kind)&&!L.INNATE.has(n)});
// 來源的最低星級決定戰法取得難度；INNATE 判斷：固有戰法不可傳授，teach 本來就不含固有，這裡只是保險
const srcR=s=>Math.min(...SRC[s].map(L.rarityOf)),srcCheapest=s=>SRC[s].reduce((a,g)=>pulls(g)<pulls(a)?g:a);
const TIERS=[['cheap',3],['mid',4],['any',5]];
log(`武將 ${GEN.length}、可傳授戰法 ${SKILLS.length}`);

// ---- 戰法強度：把戰法裝在參考武將上打 Lv8 守軍，看相對基準的兵力差 ----
import {battle} from '../slg/engine.js';
const sumT=t=>t.gens.reduce((a,g)=>a+Math.max(0,g.troops),0),sumM=t=>t.gens.reduce((a,g)=>a+g.max,0);
function mrg(my,foe){const A=L.clone(my),B=L.clone(foe);const r=battle(A,B,R);return (sumT(A)/sumM(A)-sumT(B)/sumM(B))+(r.res==='W'?.3:r.res==='L'?-.3:0)}
const phys=n=>{const s=L.D.stats[n].st;return s.武勇[0]+s.武勇[1]*40>=s.智略[0]+s.智略[1]*40};
const REFS=(()=>{const top=[...GEN].sort((a,b)=>cost(b)-cost(a));const rr=L.rng(7),out=[];
  for(let i=0;i<14;i++){const g=[];while(g.length<3){const n=top[Math.floor(rr()*60)];if(!g.includes(n))g.push(n)}out.push(g)}return out})();
const FOES=L.garrisonsAt(8).map(k=>L.garrison(k,8));
const skillPower={phys:{},mag:{}};
function refScore(names,extra){   // extra: [slot, skill] 或 null
  const arm='騎',st=L.teamStats(names,arm,50,0,FAC);
  const sk=names.map(()=>[]);if(extra)sk[extra[0]].push(extra[1]);
  const my=L.myTeam(names,arm,st,sk,TROOPS);let a=0;for(const f of FOES)for(let i=0;i<2;i++)a+=mrg(my,f);return a/(FOES.length*2)}
for(const grp of ['phys','mag']){
  const base=REFS.map(r=>refScore(r,null));
  for(const s of SKILLS){let a=0,c=0;REFS.forEach((r,ri)=>r.forEach((n,i)=>{if(phys(n)===(grp==='phys')){a+=refScore(r,[i,s])-base[ri];c++}}));skillPower[grp][s]=c?a/c:0}
}
log('戰法強度完成');

// ---- 組隊 ----
const eq=(names,tier)=>{   // 每人依類型挑本階層可用的最強兩個戰法（隊內不重複）
  const lim=TIERS.find(t=>t[0]===tier)[1],used=new Set(),out=[];
  for(const n of names){
    const own=L.innateOf(D,n),pool=SKILLS.filter(s=>srcR(s)<=lim&&s!==own&&!used.has(s)).sort((a,b)=>skillPower[phys(n)?'phys':'mag'][b]-skillPower[phys(n)?'phys':'mag'][a]);
    const pick=pool.slice(0,2);pick.forEach(s=>used.add(s));out.push(pick)}
  return out};
const defArm=names=>[...L.armsWithSynergy(names)][0]||'騎';

function resource(names,tier,red,sk){
  const gen=names.reduce((a,n)=>a+pulls(n),0)*(1+red);
  const src=new Set();for(const s of sk.flat()){const g=srcCheapest(s);if(!names.includes(g))src.add(g)}
  return{gen:Math.round(gen),skill:Math.round([...src].reduce((a,g)=>a+pulls(g),0)),srcs:[...src]};
}
// 一次「進攻」：依序打該土地所有守軍隊，兵力沿用不補，全勝才算打下
function march(my,lv,reps){
  const keys=L.garrisonsAt(lv),w=D.levels[lv].waves||1;let win=0,left=0;
  for(let i=0;i<reps;i++){
    const ks=[...keys].sort(()=>R()-.5).slice(0,w);const me=L.clone(my);let ok=true;
    for(const k of ks){const r=battle(me,L.garrison(k,lv),R);if(r.res!=='W'){ok=false;break}}
    if(ok){win++;left+=sumT(me)/sumM(me)}
  }
  return[win/reps,win?left/win:0];
}
const mk=(names,arm,lv,red,sk)=>L.myTeam(names,arm,L.teamStats(names,arm,lv,red,FAC),sk,TROOPS);

// ---- 第一階段：全部組合，用 Lv40 紅0、可用任何戰法，打 Lv8 守軍粗篩 ----
const ARMS=['騎','弓','槍','鐵炮'];
const FOE1=L.garrisonsAt(8).map(k=>L.garrison(k,8));
const cand=[];let tried=0;
for(let i=0;i<GEN.length;i++)for(let j=i+1;j<GEN.length;j++)for(let k=j+1;k<GEN.length;k++){
  const c=cost(GEN[i])+cost(GEN[j])+cost(GEN[k]);if(c>COST_CAP)continue;
  const names=[GEN[i],GEN[j],GEN[k]].sort((a,b)=>D.stats[b].st.統率[0]-D.stats[a].st.統率[0]);
  const tier='any',sk=eq(names,tier),arm=defArm(names);
  const my=mk(names,arm,40,0,sk);
  let a=0;for(let q=0;q<2;q++)a+=mrg(my,FOE1[Math.floor(R()*FOE1.length)]);
  cand.push({names,c,s:a/2});tried++;
}
log(`第一階段 ${tried} 組`);
// 入選：整體前 1500，加上各資源區間（以武將抽數計）各自前 250，確保便宜的組合也被細算
const pr=n=>n.reduce((a,x)=>a+pulls(x),0);
cand.forEach(x=>x.p=pr(x.names));
const pick=new Map();const add=x=>pick.set(x.names.join('|'),x);
[...cand].sort((a,b)=>b.s-a.s).slice(0,1500).forEach(add);
for(const [lo,hi] of [[0,300],[300,600],[600,1000],[1000,1700],[1700,3000],[3000,6000],[6000,1e9]])
  cand.filter(x=>x.p>=lo&&x.p<hi).sort((a,b)=>b.s-a.s).slice(0,250).forEach(add);
log(`入選 ${pick.size} 組細算`);

// ---- 第二階段：每組合試 3 位大將 × 4 兵種 × 3 戰法階層，Lv50 紅0 打 Lv8 選最佳；再算各情境打下各級土地的機率 ----
const out=[];let done=0;
for(const x of pick.values()){
  const variants=[];
  for(const tier of TIERS.map(t=>t[0])){
    const sk0=eq(x.names,tier);
    let best=null;
    for(let li=0;li<3;li++){
      const names=[x.names[li],...x.names.filter((_,i)=>i!==li)];const sk=[sk0[li],...sk0.filter((_,i)=>i!==li)];
      for(const arm of ARMS){
        const my=mk(names,arm,40,0,sk);let a=0;for(let q=0;q<6;q++)a+=mrg(my,FOE1[q%FOE1.length]);a/=6;
        if(!best||a>best.a)best={a,names,sk,arm};
      }
    }
    variants.push({tier,...best});
  }
  // 不同階層若挑到一樣的戰法就只留較便宜的
  const seen=new Set();
  for(const v of variants){
    const key=v.names+'|'+v.arm+'|'+v.sk.flat();if(seen.has(key))continue;seen.add(key);
    const prof={};
    for(const [lv,red] of PROFILES){const my=mk(v.names,v.arm,lv,red,v.sk);prof[lv+'_'+red]=Object.fromEntries(LANDS.map(l=>{const[w,left]=march(my,l,24);return[l,[Math.round(w*100),Math.round(left*100)]]}))}
    out.push({names:v.names,arm:v.arm,tier:v.tier,sk:v.sk,c:x.names.reduce((a,n)=>a+cost(n),0),
      res:resource(v.names,v.tier,0,v.sk),res5:resource(v.names,v.tier,5,v.sk),prof});
  }
  if(++done%200===0)log(`細算 ${done}/${pick.size}`);
}
// ---- 輸出 ----
const info=n=>({n,r:L.rarityOf(n),c:cost(n),f:D.stats[n].f,season:D.stats[n].season,pulls:Math.round(pulls(n)),inn:L.innateOf(D,n),arm:[...L.armsWithSynergy([n])]});
const names=new Set(out.flatMap(t=>[...t.names,...t.res.srcs]));
const gens=Object.fromEntries([...names].map(n=>[n,info(n)]));
const skills=Object.fromEntries([...new Set(out.flatMap(t=>t.sk.flat()))].map(s=>[s,{g:D.skillText[s]?.g,kind:D.skillText[s]?.kind,text:D.skillText[s]?.text,src:srcCheapest(s),sr:srcR(s)}]));
const assumptions={
  costCap:COST_CAP,team:'3 人一隊，總 Cost ≤ '+COST_CAP,fac:FAC,troops:TROOPS,
  skills:'每位武將固有戰法 + 兩個可傳授戰法，全部以滿級計（戰法文字取「滿級」數值）；只用有說明文字、能模擬的戰法',
  resource:'資源 = 登用期望抽數（1 ÷ 個別機率，不計保底與每 5 抽必得 4★），紅度每 +1 再多一張；戰法來源武將若不在隊內，另計一張；PK／S2／S3／常駐以外的取得管道未計',
  winrate:'打下一級土地 = 依序打完該級所有守軍隊（兵力不補、平局算失敗），24 次模擬的比例；兵學、裝備、設施以外的加成未計',
  profiles:PROFILES.map(([lv,red])=>({lv,red})),lands:LANDS,built:new Date().toISOString().slice(0,10)};
fs.writeFileSync(new URL('../recommend.json',import.meta.url),JSON.stringify({assumptions,gens,skills,teams:out}));
log(`輸出 ${out.length} 隊`);
