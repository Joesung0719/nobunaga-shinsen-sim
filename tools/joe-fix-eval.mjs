// Joe 2026-11-23 對 A~D 四隊的更正，當成回測答案。用法：node tools/joe-fix-eval.mjs
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
import {makeKit} from '../slg/teamlib.js';
import {fullRedStats,innateOf} from '../slg/engine.js';
import {adviseBingaku,advisePoints} from '../slg/advisor.js';
const {D}=L,J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url)));
const OFF=J('official.json'),kit=makeKit(D,{power:J('skillpower.json'),field:J('field.json'),official:OFF});
const FULL={co:10,arm:5,ka:3,same:true};
const run=(names,arm)=>{const st=names.map(n=>({n,red:0,st:fullRedStats(D,n,names,arm,50,0,FULL)}));const pl=kit.pick(st,null,{},{arm});return{st,pl,names,arm}};
const heal=s=>kit.tierOf(s).heal, sup=s=>{const o=kit.tierOf(s),q=kit.ps(s);return o.support&&(o.heal||o.tier==='cut'||q.status)};
const res=[];const ok=(name,c,info='')=>{res.push(c);console.log((c?'✓ ':'✗ ')+name+(info?`  （${info}）`:''))};
// A 原隊
{const r=run(['毛利元就','竹中半兵衛','壽桂尼'],'弓'),S=r.pl.sel;
 ok('A 半兵衛帶運勝之鼻',S[1].includes('運勝之鼻'),S[1].join('、'));
 ok('A 毛利元就不帶補血（帶主動攻擊）',!S[0].some(heal),S[0].join('、'));
 ok('A 壽桂尼補血／控場／降傷取一',S[2].filter(sup).length<=1,S[2].join('、'));
 const c=kit.check(r.st,S,r.arm);ok('A 勢力混搭有警告',c.some(x=>/勢力混搭/.test(x.t)));}
// A2：群雄同隊，壽桂尼配今川義元
{const r=run(['今川義元','毛利元就','壽桂尼'],'弓'),c=kit.check(r.st,r.pl.sel,r.arm);
 ok('A2 群雄同勢力不警告混搭',!c.some(x=>/勢力混搭/.test(x.t)));
 ok('A2 壽桂尼配兵謀＋突擊大將（義元）不警告',!c.some(x=>/離反效果會浪費/.test(x.t)),c.filter(x=>x.lv==='warn').map(x=>x.t).join('｜').slice(0,80));
 const r2=run(['毛利元就','壽桂尼','今川義元'],'弓');
 ok('A2 毛利當大將時壽桂尼有警告',kit.check(r2.st,r2.pl.sel,r2.arm).some(x=>/離反效果會浪費/.test(x.t)));}
// B
{const names=['本多忠勝','酒井忠次','石川數正'],lead=kit.leaderFirst(names);
 ok('B 大將選酒井忠次（本多是反擊將）',lead[0]==='酒井忠次',lead.join('＞'));
 const r=run(lead,'槍'),i=n=>lead.indexOf(n),S=r.pl.sel;
 ok('B 本多忠勝兩招都是突擊',S[i('本多忠勝')].every(s=>kit.kindOf(s)==='突擊'),S[i('本多忠勝')].join('、'));
 ok('B 酒井帶一力當先／主動攻擊',S[i('酒井忠次')].includes('一力當先'),S[i('酒井忠次')].join('、'));
 ok('B 石川補血／控場／降傷取一',S[i('石川數正')].filter(sup).length<=1,S[i('石川數正')].join('、'));
 ok('B 石川馬弓術在足輕隊有警告',kit.check(r.st,S,r.arm).some(x=>/石川數正的兵種特性/.test(x.t)));}
// C
{const r=run(['上杉謙信','柿崎景家','宇佐美定滿'],'騎'),S=r.pl.sel;
 ok('C 謙信不帶一力當先（軍神無法獲得亂舞）',!S[0].includes('一力當先'),S[0].join('、'));
 ok('C 景家仍是突擊／連擊類',S[1].some(s=>['威風凜凜','前後夾擊','縱橫馳突','勇猛無前'].includes(s)),S[1].join('、'));
 ok('C 宇佐美仍帶直言極諫',S[2].includes('直言極諫'),S[2].join('、'));}
// D
{const r=run(['織田信長','妻木熙子','歸蝶'],'鐵炮'),S=r.pl.sel;
 ok('D 信長帶立身之志與戮力同心',S[0].includes('立身之志')&&S[0].includes('戮力同心'),S[0].join('、'));
 const sk=[innateOf(D,'織田信長'),...S[0]],p=advisePoints(r.st[0].st,10,{kit,D,n:'織田信長',skills:sk,team:null});
 ok('D 信長配點統率',Object.keys(p.pts)[0]==='統率',JSON.stringify(p.pts));
 ok('D 妻木沒搭光秀有警告',kit.check(r.st,S,r.arm).some(x=>/內賢之助|妻木熙子的固有補血/.test(x.t)));
 const r2=run(['明智光秀','妻木熙子','歸蝶'],'鐵炮');ok('D 妻木搭光秀不警告',!kit.check(r2.st,r2.pl.sel,r2.arm).some(x=>/妻木熙子的固有補血/.test(x.t)),r2.pl.sel.map(a=>a.join('/')).join(' | '));}
console.log(`\n更正項目通過 ${res.filter(Boolean).length}/${res.length}`);
