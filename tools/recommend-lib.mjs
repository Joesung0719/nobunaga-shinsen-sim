// 開荒隊伍推薦用的共用函式：組隊數值（含紅度、兵種營、協力）、守軍隊伍、戰鬥勝率
import fs from 'node:fs';
import {battle,parseSkill,statsAt,bestArm,innateOf,ST4} from '../slg/engine.js';

export const D=JSON.parse(fs.readFileSync(new URL('../land.json',import.meta.url)));
export const CARDS=JSON.parse(fs.readFileSync(new URL('../data.json',import.meta.url)));
const CARD=new Map(CARDS.map(c=>[c.n,c]));
export const INNATE=new Set([...Object.values(D.innate),...Object.values(D.stats).map(x=>x.inn).filter(Boolean)]);
const PSK=new Map();export const ps=n=>{if(!PSK.has(n))PSK.set(n,parseSkill(n,D));return PSK.get(n)};
// 稀有度只有一個來源：武將資料庫（D.stats.r → 卡池 data.json）；守軍隊伍裡的 r 只在資料庫沒有這位武將時才用（曾經讓真田昌幸 5★ 顯示成 4★）
export const rarityOf=n=>D.stats[n]?.r||CARD.get(n)?.r||(D.stats[n]?5:Object.values(D.teams).flat().find(g=>g.n===n)?.r)||5;
export const costOf=n=>D.stats[n]?.c??CARD.get(n)?.c??0;

const RED_AT=[0,1,3,5],ARM_CH={馬:'騎',弓:'弓',槍:'槍',炮:'鐵炮',器:'器械'},ARM_WORD={騎兵:'騎',弓兵:'弓',足輕:'槍',鐵炮:'鐵炮',器械:'器械'},STAT_TR={武威:'武勇',智慧:'智略',領兵:'統率',靈巧:'速度'};
const CO_PCT=[0,0.5,1,1.5,2,2.5,3,4,5,6,7];
function traitFx(n,t){
  const txt=D.traitText?.[n]?.[t];let m=txt&&txt.match(/^部隊的(.+?)等級上升(\d)級/);
  if(m){const ws=m[1].split('、').filter(w=>ARM_WORD[w]),c=txt.match(/等級上限增加(\d)級/);
    return{arm:Object.fromEntries(ws.map(w=>[ARM_WORD[w],+m[2]])),cap:c?Object.fromEntries(ws.map(w=>[ARM_WORD[w],+c[1]])):null}}
  m=t.match(/^([馬弓槍炮器]+)術(I{1,3})$/);if(m)return{arm:Object.fromEntries([...m[1]].map(c=>[ARM_CH[c],m[2].length]))};
  m=t.match(/^(武威|智慧|領兵|靈巧)(I{1,3})$/);if(m)return{stat:STAT_TR[m[1]],pct:[2,2.5,3][m[2].length-1]};
  m=(txt||'').match(/^我軍全體(武勇|智略|統率|速度)提高([\d.]+)%$/);if(m)return{team:m[1],tpct:+m[2]};
  return{};
}
const active=(n,red)=>(D.stats[n]?.traits||[]).filter((_,i)=>red>=RED_AT[i]);
// 一隊（names，順序 = 大將、副將、副將）在等級 lv、每人紅度 red、兵種 arm 下的四項屬性。
// 規則同 land.html：自由點數 = 每10級10點(+特性) + 紅度×10，全加在武勇／智略較高的一項；
// 之後乘上 兵種等級×2% + 協力（同勢力三人）+ 特性自身% + 我軍全體%。
export function teamStats(names,arm,lv,red,fac){
  let lvArm=fac.arm,cap=10;const team={};
  for(const n of names)for(const t of active(n,red)){const x=traitFx(n,t);lvArm+=x.arm?.[arm]||0;cap+=x.cap?.[arm]||0;if(x.team)team[x.team]=(team[x.team]||0)+x.tpct}
  lvArm=Math.min(cap,lvArm);
  const f0=D.stats[names[0]].f,same=fac.co&&['織田','豐臣','德川','武田','上杉','群雄'].includes(f0)&&names.every(n=>D.stats[n].f===f0)?CO_PCT[fac.co]:0;
  return names.map(n=>{
    const own={};let extra=0;
    for(const t of active(n,red)){const x=traitFx(n,t);if(x.stat)own[x.stat]=(own[x.stat]||0)+x.pct;extra+=+(D.traitText?.[n]?.[t]||'').match(/每升10級，獲得(\d+)點自由屬性點/)?.[1]||0}
    const st=statsAt(D,n,lv,rarityOf(n)),k=st.武勇>=st.智略?'武勇':'智略';
    st[k]+=Math.floor(lv/10)*(10+extra)+red*10;
    return Object.fromEntries(ST4.map(x=>[x,Math.round(st[x]*(1+(lvArm*2+same+(fac.same&&fac.ka?fac.ka:0)+(own[x]||0)+(team[x]||0))/100)*10)/10]));
  });
}
export const armsWithSynergy=names=>{const o=new Set();for(const n of names)for(const t of D.stats[n]?.traits||[]){const a=traitFx(n,t).arm;for(const k in a||{})o.add(k)}return o};
export const myTeam=(names,arm,st,skills,troops)=>({name:names[0]+'隊',side:0,arm,terrain:'平',
  gens:names.map((n,i)=>({n,f:'',st:{...st[i]},troops,max:troops,skills:[innateOf(D,n),...skills[i]].filter(Boolean).map(ps),bg:null}))});
const armOfGarrison=k=>D.reports.find(r=>r.t===k&&r.ty)?.ty||'騎';
export function garrison(k,lv){
  const L=D.levels[lv],t=D.teams[k];
  return{name:t[2].n+'隊',side:1,arm:armOfGarrison(k),terrain:'城',key:k,
    gens:[t[2],t[0],t[1]].map(g=>({n:g.n,f:'',st:statsAt(D,g.n,L.glv,g.r),troops:L.per,max:L.per,skills:g.s.map(ps),bg:null}))};
}
export const garrisonsAt=lv=>Object.keys(D.teams).filter(k=>new RegExp(`^l${lv}[a-z]$`).test(k));
export const clone=t=>({...t,gens:t.gens.map(g=>({...g,st:{...g.st}}))});
// 一場：我方勝 = 1、平 = 0.5、敗 = 0（對方大將先倒才算勝）
export function duel(my,foe,R){
  const r=battle(clone(my),clone(foe),R);
  return r.res==='W'?1:r.res==='L'?0:0.5;
}
// 可重現的亂數
export function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
export {innateOf,battle};
