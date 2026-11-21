// 開荒隊伍推薦：在 Cost 上限內列舉 3 人隊，用 slg/engine.js 對戰，找出勝率最高的隊伍。
// 用法：node tools/team-rank.mjs [cost上限=15] [紅度=0..5=0] [輸出筆數=15] [等級=50]
//   環境變數 POOL=normal（預設，不含限定／PK）| all；SIMS=每場模擬次數
// 假設（與回測一致，數值為推估）：
//  · 每人 3 個戰法 = 固有 + 2 個傳授戰法（取各戰法「傷害率×發動率×目標數」估值最高、且該武將自己沒有的）；戰法滿級。
//  · 兵種 = 隊伍特性算出的最佳兵種（bestArm）；兵種營 Lv5；沒有兵學（兵學只收錄阿江）。
//  · 兩階段：20000 隊粗篩→前 300 名循環賽→前 40 名各對 300 強再打 12 場，排名看平均勝率（平手算 0.5 勝）。
import fs from 'node:fs';
import {battle,parseSkill,innateOf,fullRedStats,bestArm} from '../slg/engine.js';
import {makeKit} from '../slg/teamlib.js';

const FULL={co:10,arm:5,ka:3,same:true};   // 設施全滿（Joe）
const D=JSON.parse(fs.readFileSync(new URL('../land.json',import.meta.url)));
const [CAP=15,RED=0,TOP=15,LV=50]=process.argv.slice(2).map(Number);
const SIMS=+(process.env.SIMS||2),POOL=process.env.POOL||'normal';
let seed=2026;const rng=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const PS=new Map(),ps=n=>{if(!PS.has(n))PS.set(n,parseSkill(n,D));return PS.get(n)};
const val=s=>{const x=ps(s);if(x.modeled!=='text'||!['主動','突擊','指揮','被動'].includes(x.kind))return 0;
  return (x.rate||0)*((x.dmg||0)*(x.n?(x.n[0]+x.n[1])/2:1)+(x.heal||0)*.5+(x.status?.p||0)*.6)*(x.prep?.8:1)};
const INN=new Set([...Object.values(D.innate),...Object.values(D.stats).map(x=>x.inn).filter(Boolean)]);
const POOLSK=Object.keys(D.skillText).filter(s=>!INN.has(s)).map(s=>[s,val(s)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
// 傳授戰法：用組隊推薦（slg/teamlib.js pick）依「這一隊」搭配，不再每人都拿全域最強的同兩招：
// 自帶突擊要搭突擊／普攻類、主動戰法不堆太多、兵種技要符合隊伍兵種、增益要有可加成的對象，並參考戰報勝率。
const kit=makeKit(D,{power:JSON.parse(fs.readFileSync(new URL('../skillpower.json',import.meta.url))),field:JSON.parse(fs.readFileSync(new URL('../field.json',import.meta.url))),official:JSON.parse(fs.readFileSync(new URL('../official.json',import.meta.url)))});
const PLAN=new Map();
function plan(names){const key=names.join('|');let p=PLAN.get(key);if(!p){const arm=bestArm(D,names)||'槍';
  const st=names.map(n=>({n,red:RED,st:fullRedStats(D,n,names,arm,LV,RED,FULL)})),pl=kit.pick(st,null,{},{arm});p=pl.sel;p.q=kit.quality(st,pl.sel,arm);PLAN.set(key,p)}return p}

const gens=Object.entries(D.stats).filter(([n,v])=>v.c&&(POOL==='all'||!['限定','PK'].includes(v.season))).map(([n,v])=>({n,c:v.c,s:v.season}));
// 3 人組合（Cost 總和 ≤ CAP；3 人皆須有固有戰法文字）
const cands=[];
for(let i=0;i<gens.length;i++)for(let j=i+1;j<gens.length;j++)for(let k=j+1;k<gens.length;k++){
  const c=gens[i].c+gens[j].c+gens[k].c;if(c>CAP)continue;
  cands.push([gens[i].n,gens[j].n,gens[k].n]);
}
function mk(names,side,red=RED){
  const arm=bestArm(D,names)||'槍';
  return{name:names[0],side,arm,terrain:'平',gens:names.map(n=>({n,f:D.stats[n]?.f||'',st:fullRedStats(D,n,names,arm,LV,red,FULL),troops:10000,max:10000,
    skills:[innateOf(D,n),...plan(names)[names.indexOf(n)]].filter(Boolean).map(ps),bg:null}))};
}
function duel(a,b){let w=0;for(let i=0;i<SIMS;i++){const r=battle(mk(a,0),mk(b,1),rng).res;w+=r==='W'?1:r==='D'?.5:0}return w/SIMS}
const pickN=(arr,n)=>{const o=[];while(o.length<n)o.push(arr[Math.floor(rng()*arr.length)]);return o};

// 階段 0：用屬性與固有戰法估值先篩到 20000 隊（全部組合有三十多萬隊，逐一對戰太慢）
const pw=n=>{const st=fullRedStats(D,n,[n],'槍',LV,RED);return Math.max(st.武勇,st.智略)+.5*st.統率+.3*st.速度+120*val(innateOf(D,n))};
const PW=Object.fromEntries(gens.map(g=>[g.n,pw(g.n)]));
// 搭配品質是硬性門檻：戰法組不合格的隊伍（突擊沒連動、兵種技不符、主動堆太多…）不進榜
const pool0=cands.map(t=>[t,t.reduce((a,n)=>a+PW[n],0)]).sort((a,b)=>b[1]-a[1]).slice(0,60000).map(x=>x[0]).filter(t=>plan(t).q.ok).slice(0,20000);
// 階段 1：粗篩（12 支隨機隊試算）
const field=pickN(pool0,12);
const s1=pool0.map(t=>({t,w:field.reduce((a,f)=>a+duel(t,f),0)/field.length})).sort((a,b)=>b.w-a.w).slice(0,300);
// 階段 2：循環賽
const SIMS2=SIMS*2;
for(const x of s1){x.g=0;x.n=0}
for(let i=0;i<s1.length;i++)for(let j=i+1;j<s1.length;j++){
  let w=0;for(let k=0;k<SIMS2;k++){const r=battle(mk(s1[i].t,0),mk(s1[j].t,1),rng).res;w+=r==='W'?1:r==='D'?.5:0}
  s1[i].g+=w/SIMS2;s1[j].g+=1-w/SIMS2;s1[i].n++;s1[j].n++;
}
// 階段 3：前 40 名對粗篩的 300 強各打 12 場，降低雜訊
s1.sort((a,b)=>b.g/b.n-a.g/a.n);
for(const x of s1.slice(0,40)){let w=0,c=0;for(const y of s1){if(y===x)continue;for(let k=0;k<12;k++){const r=battle(mk(x.t,0),mk(y.t,1),rng).res;w+=r==='W'?1:r==='D'?.5:0;c++}}x.g=w;x.n=c}
const out=s1.slice(0,40).map(x=>({team:x.t,cost:x.t.reduce((a,n)=>a+D.stats[n].c,0),winRate:+(x.g/x.n).toFixed(3),arm:bestArm(D,x.t),
  skills:Object.fromEntries(x.t.map((n,i)=>[n,[innateOf(D,n),...plan(x.t)[i]]])),seasons:x.t.map(n=>D.stats[n].season)})).sort((a,b)=>b.winRate-a.winRate);
console.log(JSON.stringify({cap:CAP,red:RED,lv:LV,pool:POOL,candidates:cands.length,top:out.slice(0,TOP)},null,1));
if(process.env.OUT)fs.writeFileSync(process.env.OUT,JSON.stringify(out));
