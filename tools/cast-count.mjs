// 戰法發動次數檢查：每場各武將各戰法「真正發動」次數（持續傷害結算、兵學不算），與合理上限比較（Joe 2026-11-23：每次發動算 1 次；準備型 8 回合頂多約 4 次）。用法：node tools/cast-count.mjs
import {FAC_FULL} from '../slg/rules.js';
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
import {makeKit} from '../slg/teamlib.js';
import {battle} from '../slg/engine.js';
const {D}=L,J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const OFF=J('official.json');const kit=makeKit(D,{power:J('skillpower.json'),field:J('field.json'),official:OFF.map(t=>({...t,gens:[]}))});
const FAC=FAC_FULL,R=L.rng(7);
const gens=Object.keys(D.stats).filter(n=>D.stats[n].r===5||D.stats[n].inn),mx={},bad=[];
for(const g0 of gens){const team=[g0,gens[Math.floor(R()*gens.length)],gens[Math.floor(R()*gens.length)]];if(new Set(team).size<3)continue;
 try{const arm='騎',st=L.teamStats(team,arm,50,5,FAC),pl=kit.pick(team.map((nm,i)=>({n:nm,red:5,st:st[i]})),null,{},{arm}),my=L.myTeam(team,arm,st,pl.sel,10000);
  const r=battle(L.clone(my),L.garrison('l10a',10),R),c={};
  for(const e of r.log)if(e.type==='skill'&&e.kind!=='持續'&&e.kind!=='兵學'){const k=e.side+'|'+e.i+'|'+e.skill;c[k]=(c[k]||0)+1}
  for(const[k,v]of Object.entries(c)){const nm=k.split('|')[2];mx[nm]=Math.max(mx[nm]||0,v);
    const t=D.skillText?.[nm],prep=/準備(\d)回合/.exec(t?.text||''),cap=prep?Math.ceil(r.rounds/(+prep[1]+1)):r.rounds;
    if(v>cap)bad.push(`${nm}（${t?.kind}${prep?'・準備'+prep[1]:''}）一場 ${v} 次 > 上限 ${cap}`)}
 }catch(e){}}
console.log('超過上限：',[...new Set(bad)].slice(0,40));
console.log('次數最多的前15：',Object.entries(mx).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k,v])=>k+'×'+v).join('、'));
