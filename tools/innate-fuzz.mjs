// 固有戰法補建模後的煙霧測試：每位金將當大將帶隨機隊友打 Lv9/10 守軍，確認引擎不丟例外（2026-11-23）。用法：node tools/innate-fuzz.mjs
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
import {makeKit} from '../slg/teamlib.js';
import {battle,innateOf} from '../slg/engine.js';
const {D}=L,J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const OFF=J('official.json');const kit=makeKit(D,{power:J('skillpower.json'),field:J('field.json'),official:OFF.map(t=>({...t,gens:[]}))});
const FAC={co:10,arm:5,ka:3,same:true},R=L.rng(3);
const gens=Object.keys(D.stats).filter(n=>D.stats[n].r===5||D.stats[n].inn);
let n=0,err=0,w=0;const names=gens.slice();
for(const g0 of names){const team=[g0,names[Math.floor(R()*names.length)],names[Math.floor(R()*names.length)]];if(new Set(team).size<3)continue;
 try{const arm='騎';const st=L.teamStats(team,arm,50,5,FAC);const pl=kit.pick(team.map((nm,i)=>({n:nm,red:5,st:st[i]})),null,{},{arm});const my=L.myTeam(team,arm,st,pl.sel,10000);
  for(const k of ['l10a','l10b','l9c']){const r=battle(L.clone(my),L.garrison(k,k.startsWith('l10')?10:9),R);n++;if(r.res==="W")w++;if(!["W","D","L"].includes(r.res)||r.log.some(e=>e.tg?.some(x=>x&&(Number.isNaN(x.v)||Number.isNaN(x.left)))))throw new Error("NaN/結果異常 "+team.join("/"))}}catch(e){err++;if(err<5)console.log(team.join('/'),e.stack.split('\n').slice(0,3).join(' | '))}}
console.log('battles',n,'errors',err,'win',Math.round(w/n*100)+'%');
