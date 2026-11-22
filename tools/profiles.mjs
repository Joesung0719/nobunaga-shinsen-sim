// 武將檔案：對每位金將（5★）建立檔案（能力、特性、固有戰法與代價、兵種、可傳承戰法、兵學樹），
// 再由檔案「單人」推導第 2、3 戰法與兵學方向，附理由；並拿官方編制（玩家配法）回測吻合率、列出判斷不了的資料缺口。
// 用法：node tools/profiles.mjs   → profiles.json、audit/profiles-backtest.md
import fs from 'node:fs';
import * as L from './recommend-lib.mjs';
import {makeKit} from '../slg/teamlib.js';
import {bestArm,fullRedStats,innateOf} from '../slg/engine.js';
import {adviseBingaku,advisePoints,armReason} from '../slg/advisor.js';
import {hasTree} from '../slg/bingaku.js';
const {D}=L,J=f=>JSON.parse(fs.readFileSync(new URL('../'+f,import.meta.url)));
const OFF=J('official.json'),POWER=J('skillpower.json'),FIELD=J('field.json');
const kit=makeKit(D,{power:POWER,field:FIELD,official:OFF.map(t=>({...t,gens:[]}))});   // 規則版：不看官方先驗（官方只用來回測）
const FULL={co:10,arm:5,ka:3,same:true},A={足輕:'槍',弓兵:'弓',騎兵:'騎',鐵炮:'鐵炮'};
const ARMN={槍:'足輕',弓:'弓兵',騎:'騎兵',鐵炮:'鐵炮',器械:'器械'};
const ps=s=>kit.ps(s),gaps={};
const gap=(k,who)=>{(gaps[k]??=new Set()).add(who)};
// 固有戰法的「代價」與「觸發條件」，全由說明文字判斷
function innateInfo(n){
  const s=innateOf(D,n),T=D.skillText?.[s]||{},x=T.text||'',p=ps(s);
  const cost=[];
  for(const m of x.matchAll(/自身(武勇|智略|統率|速度)(降低|下降|減少)(\d+%?)/g))cost.push(`會降低自身${m[1]}（${m[3]}）`);
  if(/自身[^，。]{0,6}(損失|扣除|消耗)[^，。]{0,6}兵力/.test(x))cost.push('會損失自身兵力');
  if(/無法行動|無法普通攻擊|自身[^，。]{0,4}(混亂|麻痺)/.test(x))cost.push('可能讓自己無法行動');
  const trig=[];
  if(T.kind==='突擊')trig.push('普通攻擊命中後才判定（要多打普攻）');
  if(T.kind==='主動'){const m=x.match(/準備(\d)回合/);trig.push(m?`主動，需準備 ${m[1]} 回合`:'主動戰法，每回合機率發動')}
  if(T.kind==='指揮')trig.push('指揮技：開場生效');
  if(T.kind==='被動')trig.push('被動：條件成立自動生效');
  if(/受到(普通攻擊|兵刃傷害|傷害)時/.test(x))trig.push('被打才觸發（被打型）');
  const sc=x.match(/受(智略|統率|武勇|速度)影響/g);
  return{skill:s,kind:T.kind||null,tags:T.tags||'',rate:T.rate||'',text:x,boss:T.boss||'',cost,trig,scales:[...new Set((sc||[]).map(z=>z.slice(1,3)))],modeled:p?.modeled||null};
}
const SRCS=kit.SRC;   // 技能→可傳授來源武將
const GENS=Object.keys(D.stats).filter(n=>D.stats[n].c>0&&(D.stats[n].r||5)===5&&D.skillText?.[innateOf(D,n)]);
const profiles={};
function derive(n,arm,names){
  const st=[{n,red:0,st:fullRedStats(D,n,names||[n],arm,50,0,FULL)}],res={};
  const cand=[],why=[];
  for(let r=0;r<3;r++){   // 每輪取 2 招並保留起來，下一輪取次佳 2 招 → 前 6 名候選
    const pl=kit.pick(st,null,res,{arm,assumeCover:true});   // 單人檔案：假設另外兩位隊友已補齊補血／減傷／控制，這位只看自己的需求
    for(const s of pl.sel[0]){cand.push(s);res[s]=kit.count(s)}
    if(r===0)why.push(...(pl.why?.[0]||[]).slice(0,10));
  }
  return{sel:cand.slice(0,2),cand,why,st:st[0].st};
}
for(const n of GENS){
  const S=D.stats[n],inn=innateInfo(n),arm=bestArm(D,[n])||'槍';
  const d=derive(n,arm),skills=[inn.skill,...d.sel].filter(Boolean);
  const top=Object.entries(S.st).filter(([k])=>k!=='政務'&&k!=='魅力').sort((a,b)=>b[1][0]-a[1][0]);
  // 需求（由固有戰法與特性說明文字推導）
  const need=[];
  const F=kit.feat?.(n);
  if(inn.kind==='突擊')need.push('固有是突擊技：第 2、3 戰法要帶連擊／能觸發普攻的技能，主動戰法對他加成小');
  if(inn.trig.some(t=>/被打型/.test(t)))need.push('被打型：偏好減傷、反擊、被打才觸發的戰法');
  if(inn.trig.some(t=>/需準備/.test(t)))need.push('固有要準備：可搭「跳過準備／準備中也有效」類戰法');
  if(inn.cost.length)need.push(`固有有代價（${inn.cost.join('、')}）：吃同一能力的戰法與他互斥`);
  if(inn.scales.length)need.push(`固有受${inn.scales.join('、')}影響：這項能力是他的輸出來源`);
  if(!need.length)need.push('固有沒有特別限制：依能力強項與隊伍補位選戰法');
  const bg=hasTree(n)?adviseBingaku(kit,D,n,5,skills,d.st):null;
  if(!bg)gap('兵學樹資料缺（沒有這位的兵學截圖）',n);
  for(const s of d.sel){const p=ps(s);if(p?.modeled!=='text')gap(`戰法「${s}」引擎沒有建模（只能憑說明判斷）`,n)}
  if(ps(inn.skill)?.modeled!=='text')gap('固有戰法引擎沒有建模（只能憑說明文字判斷其效果與代價）',n)
  if(!D.skillText?.[inn.skill]?.text)gap('固有戰法說明缺',n);
  profiles[n]={n,faction:S.f,cost:S.c,season:S.season||null,traits:(S.traits||[]).map(t=>({n:t,t:D.traitText?.[n]?.[t]||''})),
    stats:Object.fromEntries(Object.entries(S.st).map(([k,v])=>[k,v[0]])),topStat:top.slice(0,2).map(x=>x[0]),
    role:S.st.武勇.length&&S.st.武勇[0]>=S.st.智略[0]?'物理（武勇型）':'謀略（智略型）',
    arm:ARMN[arm],armWhy:armReason(D,arm,[n])||'依特性與能力推算',innate:inn,
    teaches:Object.entries(SRCS).filter(([s,a])=>a.includes(n)).map(([s])=>s),
    need,rec:{skills:d.sel,alt:d.cand.slice(2),why:d.why},bingaku:bg?{dir:bg.sel.d,sel:bg.sel,why:bg.why}:null,
    points:advisePoints(d.st,10).why};
}
// ===== 回測：檔案推導（單人）vs 官方配法 =====
const T=OFF.filter(t=>t.gens.length===3&&t.gens[0].s[0]);
let tot=0,hit=0,full=0,gn=0,hit6=0,miss={};const per={},bySec={};
for(const t of T){
  const names=t.gens.map(g=>g.n),arm=A[t.arm]||bestArm(D,names)||'槍';
  for(const g of t.gens){
    const P=profiles[g.n];if(!P)continue;
    const d=derive(g.n,arm,names),h=g.s.filter(s=>d.sel.includes(s)).length;
    hit+=h;hit6+=g.s.filter(s=>d.cand.includes(s)).length;tot+=2;gn++;if(h===2)full++;
    (per[g.n]??={h:0,t:0,sk:{}});per[g.n].h+=h;per[g.n].t+=2;g.s.forEach(s=>per[g.n].sk[s]=(per[g.n].sk[s]||0)+1);
    for(const s of g.s)if(!d.sel.includes(s))miss[s]=(miss[s]||0)+1;
  }
}
const rate=hit/tot;
const md=[`# 武將檔案推導 vs 官方配法回測`,``,`方法：每位武將只看自己的檔案（能力、特性、固有戰法、兵種）單人推導第 2、3 戰法，不看官方先驗，再與官方 ${T.length} 隊裡該武將實際帶的 2 招比對。`,``,
 `- 戰法命中率：**${(rate*100).toFixed(1)}%**（${hit}/${tot} 個戰法位）；前 6 名候選（首選 2＋備選 4）涵蓋官方 2 招的比例 **${(hit6/tot*100).toFixed(1)}%**；兩招全中的武將次數 ${full}/${gn}（${(full/gn*100).toFixed(1)}%）`,
 `- 對照：同一套規則但放進隊伍情境（舊「規則版」）22.9%；「每位只背官方最常帶 2 招」上限 45.8%`,``,`## 最常漏掉的官方戰法（檔案推導沒選到）`,``,
 ...Object.entries(miss).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([s,c])=>`- ${s}：漏 ${c} 次（${ps(s)?.kind||'?'}・${(D.skillText?.[s]?.text||'').slice(0,50)}）`),``,
 `## 資料缺口（判斷不了的）`,``,...Object.entries(gaps).sort((a,b)=>b[1].size-a[1].size).map(([k,v])=>`- ${k}：${v.size} 位${v.size<=12?`（${[...v].join('、')}）`:''}`)].join('\n');
fs.writeFileSync(new URL('../audit/profiles-backtest.md',import.meta.url),md);
fs.writeFileSync(new URL('../profiles.json',import.meta.url),JSON.stringify({gens:profiles,backtest:{rate:+rate.toFixed(3),rate6:+(hit6/tot).toFixed(3),hit,tot,full,gn},per:Object.fromEntries(Object.entries(per).map(([k,v])=>[k,{h:v.h,t:v.t,sk:v.sk}])),gaps:Object.fromEntries(Object.entries(gaps).map(([k,v])=>[k,[...v]]))}));
console.log(md.slice(0,2500));console.log(Object.keys(profiles).length,'位');
