// 裝備特技逐項檢查（2026-11-25）：每個特技（取上限值）單獨套在一隊上打另一隊玩家隊（兩隊輪流當有裝備的一方），
// 確認戰報裡有觸發、勝場或殘兵有變。⚠＝完全沒差別（多半是條件沒觸發，例如沒有弓打騎），要逐一看原因。
// 用法：node tools/equip-traits-test.mjs
import {FAC_FULL} from '../slg/rules.js';
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
import {makeKit} from '../slg/teamlib.js';
import {battle} from '../slg/engine.js';
import {gearBonus,GEAR_OPTIONS,traitStatus,traitRange,traitWho} from '../slg/equipment.js';
const {D}=L,J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const OFF=J('official.json');const kit=makeKit(D,{power:J('skillpower.json'),field:J('field.json'),official:OFF.map(t=>({...t,gens:[]}))});
const FAC=FAC_FULL;
const cases=[['武田信玄','山本勘助','飯富虎昌','騎'],['宇佐美定滿','上杉謙信','直江兼續','弓']];
const prep=cases.map(([a,b,c,arm])=>{const team=[a,b,c],st=L.teamStats(team,arm,50,5,FAC),pl=kit.pick(team.map((x,i)=>({n:x,red:5,st:st[i]})),null,{},{arm});return()=>L.myTeam(team,arm,st,pl.sel,10000)});
const one=(slot,name,n)=>[{slot,name,attrs:{},trait:{n,v:traitRange(n)?.[1]??null}}];
const all=Object.entries(GEAR_OPTIONS.traits).flatMap(([sl,ts])=>ts.map(n=>[sl,null,n])).concat(Object.entries(GEAR_OPTIONS.excl).flatMap(([nm,ns])=>ns.map(n=>[Object.keys(GEAR_OPTIONS.names).find(k=>GEAR_OPTIONS.names[k].includes(nm)),nm,n])));
const out=[];
for(const [sl,nm,n] of all){
  if(traitWho(n)){out.push(`${n}：綁定 ${traitWho(n)}，這裡不測（見 PR 說明的專屬測試）`);continue}
  const st0=traitStatus(n);if(st0!=='battle'){out.push(`${n}：${st0==='off'?'不影響戰鬥':'沒有資料'}`);continue}
  let fired=0,w0=0,w1=0,l0=0,l1=0;
  for(const side of[0,1])for(let k=0;k<60;k++)for(const on of[0,1]){const R=L.rng(1000+k),my=prep[side](),foe=prep[1-side]();foe.side=1;
    if(on)my.gens.forEach(g=>{g.gear=gearBonus(one(sl,nm,n),g.n)});
    const r=battle(my,foe,R),left=my.gens.reduce((s,g)=>s+g.troops,0);
    if(on){w1+=r.res==='W';l1+=left;if(r.log.some(e=>e.skill?.startsWith(n)||e.tg?.some(t=>String(t.status||'').includes(n))))fired++}else{w0+=r.res==='W';l0+=left}}
  out.push(`${n}：勝 ${w0}→${w1}／殘兵 ${Math.round(l0/120)}→${Math.round(l1/120)}${fired?`／戰報出現 ${fired} 場`:''}${l0===l1&&w0===w1?' ⚠ 沒有任何差別':''}`);
}
console.log(out.join('\n'));
