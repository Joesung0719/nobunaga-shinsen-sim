// 行動順序檢查（2026-11-26）：逐回合戰報裡「開始行動」必須照速度由快到慢（先攻除外），
// 指揮／被動的回合開始效果（例：豐臣秀吉【千成瓢簞】治療）要在第一位行動前、不算在任何人的行動裡。用法：node tools/turn-order-test.mjs
import {FAC_FULL} from '../slg/rules.js';
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
import {makeKit} from '../slg/teamlib.js';
import {battle} from '../slg/engine.js';
const {D}=L,J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const kit=makeKit(D,{power:J('skillpower.json'),field:J('field.json'),official:J('official.json').map(t=>({...t,gens:[]}))});
const R=L.rng(11);let bad=0,battles=0,pre=0,turns=0;
for(const [team,arm] of [[['豐臣秀吉','加藤嘉明','蜂須賀小六'],'足輕'],[['武田信玄','山本勘助','飯富虎昌'],'騎']]){
  const st=L.teamStats(team,arm,50,5,FAC_FULL),pl=kit.pick(team.map((n,i)=>({n,red:5,st:st[i]})),null,{},{arm});
  for(let k=0;k<100;k++){const my=L.myTeam(team,arm,st,pl.sel,10000),r=battle(my,L.garrison('l10a',10),R);battles++;
    let round=0,seq=[],seen=false;
    const check=()=>{for(let j=1;j<seq.length;j++)if(!seq[j-1].first&&!seq[j].first&&seq[j].spd>seq[j-1].spd+0.01){bad++;if(bad<5)console.log('順序錯',round,seq.map(x=>x.spd))}};
    for(const e of r.log){
      if(e.type==='round'){check();round=e.round;seq=[];seen=false;continue}
      if(e.type==='turn'){seen=true;turns++;seq.push({spd:e.spd,first:e.first});continue}
      if(round>0&&!seen&&e.type==='skill'&&e.skill==='千成瓢簞')pre++;
      if(e.type==='atk'&&!seen){bad++;console.log('普攻出現在任何人行動前',round)}}
    check()}}
console.log({battles,turns,回合開始的千成瓢簞:pre,錯誤:bad});
if(bad)process.exit(1);
