// 隨機珍品裝備的煙霧／效果測試（2026-11-23）：同一支隊伍打 Lv10 守軍，比較有無裝備的勝率與殘兵。用法：node tools/equip-test.mjs
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
import {makeKit} from '../slg/teamlib.js';
import {battle} from '../slg/engine.js';
import {rollGear,gearBonus,gearText} from '../slg/equipment.js';
const {D}=L,J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const OFF=J('official.json');const kit=makeKit(D,{power:J('skillpower.json'),field:J('field.json'),official:OFF.map(t=>({...t,gens:[]}))});
const FAC={co:10,arm:5,ka:3,same:true},R=L.rng(7);
const team=['武田信玄','山本勘助','飯富虎昌'],arm='騎';
const st=L.teamStats(team,arm,50,5,FAC);const pl=kit.pick(team.map((nm,i)=>({n:nm,red:5,st:st[i]})),null,{},{arm});
const run=(gear,N=200)=>{let w=0,d=0,l=0,left=0;
  for(let i=0;i<N;i++){const my=L.myTeam(team,arm,st,pl.sel,10000);
    if(gear)my.gens.forEach(g=>{g.gear=gearBonus(rollGear(R))});
    const r=battle(my,L.garrison('l10a',10),R);if(r.res==='W'){w++;left+=my.gens.reduce((a,g)=>a+g.troops,0)}else if(r.res==='D')d++;else l++}
  return{勝:w,平:d,敗:l,勝時殘兵:w?Math.round(left/w):0}};
console.log('無裝備',run(false));console.log('隨機珍品',run(true));
console.log(gearText(rollGear(R)));
