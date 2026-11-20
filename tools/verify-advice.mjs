// 推薦自我驗證：拿戰報裡出現過的贏隊（以及幾組常見搭配），比較「推薦戰法」與「亂配（每人兩個隨機主動）」對 Lv8／Lv9 守軍的勝率，
// 並檢查：自帶突擊的武將有沒有搭突擊／普攻類、兵種技與隊伍兵種是否相符、整隊主動戰法數。用法：node tools/verify-advice.mjs
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
import {makeKit} from '../slg/teamlib.js';
import {battle,bestArm} from '../slg/engine.js';
const {D}=L,J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url)));
const kit=makeKit(D,{power:J('skillpower.json'),field:J('field.json')});
const R=L.rng(20261121),FAC={co:10,arm:5,ka:3,same:true},TROOPS=9900;
const sumT=t=>t.gens.reduce((a,g)=>a+Math.max(0,g.troops),0),sumM=t=>t.gens.reduce((a,g)=>a+g.max,0);
const FOES=[8,9].flatMap(lv=>L.garrisonsAt(lv).map(k=>L.garrison(k,lv)));
function winrate(names,arm,sk,reps=3){const st=L.teamStats(names,arm,50,5,FAC),my=L.myTeam(names,arm,st,sk,TROOPS);let w=0,n=0,left=0;
  for(const f of FOES)for(let i=0;i<reps;i++){const A=L.clone(my),B=L.clone(f),r=battle(A,B,R);n++;if(r.res==='W')w++;left+=sumT(A)/sumM(A)}
  return[Math.round(w/n*100),Math.round(left/n*100)]}
const TEAMS=[['柿崎景家','今川義元','上杉謙信'],['山本勘助','武田信玄','馬場信春'],['德川家康','本多忠勝','本多正信'],['伊達政宗','島津義久','龍造寺隆信'],
  ['寧寧','福島正則','豐臣秀吉'],['本多正信','榊原康政','酒井忠次'],['上杉謙信','宇佐美定滿','柿崎景家'],['今川義元','壽桂尼','長宗我部元親'],['立花道雪','北條氏康','淺井長政'],['明智光秀','歸蝶','織田信長']];
const act=kit.POOL.filter(s=>kit.ps(s).kind==='主動');
let tot=[0,0],warnN=0;
for(const names of TEAMS){
  if(names.some(n=>!D.stats[n]))continue;
  const arm=bestArm(D,names)||'騎',st=names.map((n,i)=>({n,red:5,st:L.teamStats(names,arm,50,5,FAC)[i]}));
  const pl=kit.pick(st,null,{},{arm}),chk=kit.check(st,pl.sel,arm).filter(c=>c.lv==='warn');
  const rnd=names.map(()=>[act[Math.floor(R()*act.length)],act[Math.floor(R()*act.length)]]);
  const a=winrate(names,arm,pl.sel),b=winrate(names,arm,rnd);tot[0]+=a[0];tot[1]+=b[0];warnN+=chk.length;
  console.log(`${names.join('、')}（${arm}）推薦 ${a[0]}%／亂配 ${b[0]}%｜${names.map((n,i)=>`${D.stats[n].inn}+${pl.sel[i].join('/')}`).join(' ｜ ')}${chk.length?'｜⚠'+chk.map(c=>c.t).join(';'):''}`);
}
console.log(`平均勝率：推薦 ${Math.round(tot[0]/TEAMS.length)}%，亂配 ${Math.round(tot[1]/TEAMS.length)}%；規則警告 ${warnN} 個`);
