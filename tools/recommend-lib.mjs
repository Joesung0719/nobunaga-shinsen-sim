// 開荒隊伍推薦用的共用函式：組隊數值（含紅度、兵種營、協力）、守軍隊伍、戰鬥勝率
import fs from 'node:fs';
import {battle,parseSkill,statsAt,bestArm,innateOf,ST4,traitBattle,fullRedStats} from '../slg/engine.js';
import {armTraits} from '../slg/rules.js';

export const D=JSON.parse(fs.readFileSync(new URL('../land.json',import.meta.url)));
export const CARDS=JSON.parse(fs.readFileSync(new URL('../data.json',import.meta.url)));
const CARD=new Map(CARDS.map(c=>[c.n,c]));
export const INNATE=new Set([...Object.values(D.innate),...Object.values(D.stats).map(x=>x.inn).filter(Boolean)]);
const PSK=new Map();export const ps=n=>{if(!PSK.has(n))PSK.set(n,parseSkill(n,D));return PSK.get(n)};
// 稀有度只有一個來源：武將資料庫（D.stats.r → 卡池 data.json）；守軍隊伍裡的 r 只在資料庫沒有這位武將時才用（曾經讓真田昌幸 5★ 顯示成 4★）
export const rarityOf=n=>D.stats[n]?.r||CARD.get(n)?.r||(D.stats[n]?5:Object.values(D.teams).flat().find(g=>g.n===n)?.r)||5;
export const costOf=n=>D.stats[n]?.c??CARD.get(n)?.c??0;

// 組隊數值、特性、兵種、協力：和網頁、引擎同一份（slg/engine.js fullRedStats → slg/rules.js）。以前這裡有自己一份 teamStats，勢力不認老獪／老狐狸。
export function teamStats(names,arm,lv,red,fac){return names.map(n=>fullRedStats(D,n,names,arm,lv,red,fac))}
export const armsWithSynergy=names=>{const o=new Set();for(const n of names)for(const k in armTraits(D,n).o)o.add(k);return o};
const PSL=new Map();export const psAt=(n,lv)=>{if(lv==null)return ps(n);const k=n+'@'+lv;if(!PSL.has(k))PSL.set(k,parseSkill(n,D,lv));return PSL.get(k)};
export const myTeam=(names,arm,st,skills,troops,slv=null,red=0)=>{const tb=traitBattle(D,names,red);return{name:names[0]+'隊',side:0,arm,study:true,terrain:'平',
  gens:names.map((n,i)=>({n,f:D.stats[n]?.f||'',st:{...st[i]},troops,max:troops,tr:tb[i].tr,trTm:tb[i].tm,tcIn:tb[i].tc,skills:[innateOf(D,n),...skills[i]].filter(Boolean).map(x=>psAt(x,slv)),bg:null}))}};
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
