// Joe 自己的四隊（2026-11-22 截圖）回測：不看官方先驗，用武將檔案規則單隊推導戰法，與 Joe 實際配法比對。用法：node tools/joe-teams.mjs
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
import {makeKit} from '../slg/teamlib.js';
import {fullRedStats} from '../slg/engine.js';
const {D}=L,J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url)));
const OFF=J('official.json'),POWER=J('skillpower.json'),FIELD=J('field.json');
export const kit=makeKit(D,{power:POWER,field:FIELD,official:OFF.map(t=>({...t,gens:[]}))});
const FULL={co:10,arm:5,ka:3,same:true};
export const JOE=[
 {arm:'鐵炮',gens:[['明智光秀',['囊沙之計','疑兵盜城']],['阿松',['氣炎萬丈','鐵炮僧兵隊']],['堀直政',['南蠻東渡','荷駄崩']]]},
 {arm:'槍',gens:[['立花誾千代',['御旗盾無','威風凜凜']],['立花道雪',['陣型崩毀','所向披靡']],['北條氏康',['一領具足','三河武士']]]},
 {arm:'鐵炮',gens:[['伊達政宗',['龍騎兵','攻其不備']],['龍造寺隆信',['戮力同心','誘敵深入']],['三好實休',['草木皆兵','振旅凱歌']]]},
 {arm:'騎',gens:[['武田信玄',['文武雙全','亂世戰華']],['山本勘助',['一行三昧','回天轉運']],['飯富虎昌',['越後先手組','千軍辟易']]]},
];
if(process.argv[1]?.endsWith("joe-teams.mjs")){
let hit=0,tot=0,full=0,gn=0,inpool=0;
for(const t of JOE){
  const names=t.gens.map(g=>g[0]);
  const st=names.map(n=>({n,red:0,st:fullRedStats(D,n,names,t.arm,50,0,FULL)}));
  const pl=kit.pick(st,null,{},{arm:t.arm});
  console.log('\n'+names.join('＋'),t.arm);
  t.gens.forEach(([n,s],i)=>{const h=s.filter(x=>pl.sel[i].includes(x)).length;hit+=h;tot+=2;gn++;if(h===2)full++;inpool+=s.filter(x=>kit.POOL.includes(x)).length;
    console.log(`  ${n}  Joe:${s.join('/')}  推薦:${pl.sel[i].join('/')}  中${h}`+(s.some(x=>!kit.POOL.includes(x))?`  （池外:${s.filter(x=>!kit.POOL.includes(x)).join('、')}）`:''))});
}
console.log(`\nJoe 四隊 戰法命中 ${hit}/${tot}（${(hit/tot*100).toFixed(1)}%），兩招全中 ${full}/${gn} 位，在候選池內 ${inpool}/${tot}`);
}
