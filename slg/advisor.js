// 玩家建議：每位武將的兵學方向／節點、自由配點、兵種，並附理由。瀏覽器與 node 都能用。
// 全部是推估：沒有官方公式，權重來自戰報歸納（突擊傷害占贏方輸出 18%／輸方 10%、普攻約 21～25%、主動 17～25%）與引擎的傷害公式。
import {TREES,DIRS,RULE,capOf,dirOf,hasTree,cleanSel} from './bingaku.js';
import {innateOf} from './engine.js?v=47';

// 兵學節點效果鍵 → 權重（1 = 造成傷害 +1%）。依這位武將的戰法組成調整。
function weights(kit,D,g,skills){
  const ks=skills.map(s=>kit.kindOf(s)),nRush=ks.filter(k=>k==='突擊').length,nAct=ks.filter(k=>k==='主動').length;
  const prep=skills.filter(s=>kit.ps(s).prep).length,phys=g.st.武勇>=g.st.智略;
  const atkShare=nRush?.3:.25;   // 有突擊戰法時，普攻命中次數＝突擊觸發次數，普攻強化更值錢
  return{
    w:{dmg:1,dmgAtk:atkShare+.1*nRush,dmgAct:.1+.12*nAct,dmgPrep:.08*prep,dmgRush:.12+.2*nRush,dmgBlade:phys?.8:.05,dmgStrat:phys?.05:.8,
      crit:phys?.45:0,critS:phys?0:.45,critSDmg:phys?0:.15,taken:1,takenBlade:.45,takenStrat:.4,takenAct:.2,takenAtkRush:.4,takenCmd:.1,
      evade:.5,healIn:.15,heal:.3,spd:.06,spd1:.03,rushRate:.35*nRush,rateAct:.25*nAct,ally:.3,shield:.6,rushGuard:.1},
    phys,nRush,nAct};
}
// 「奇」節點只有文字：用關鍵字給分
function qiScore(t,W){
  const x=t.t||'';let v=1;
  if(/連擊/.test(x))v+=W.nRush?2.5:1.2;
  if(/免疫封擊/.test(x))v+=W.nRush?1.4:.6;
  if(/突擊/.test(x))v+=W.nRush?2:-.5;
  if(/主動戰法/.test(x))v+=W.nAct?1.5:-.3;
  if(/恢復|治療/.test(x))v+=.8;
  if(/謀略|奇謀|智略/.test(x))v+=W.phys?-.3:1.2;
  if(/兵刃|武勇|會心/.test(x))v+=W.phys?1.2:-.3;
  return v;
}
const nodeVal=(fx,W)=>Object.entries(fx||{}).reduce((a,[k,v])=>a+(W.w[k]||0)*v,0);

// 回傳 {sel, dirs:[{id,score}], why:[...]}；沒有兵學樹或 3★ 以下回 null
export function adviseBingaku(kit,D,n,r,skills,st){
  const cap=capOf(r);if(!cap||!hasTree(n))return null;
  const W=weights(kit,D,{st},skills);
  const rank=[];
  for(const d of DIRS){
    const t=dirOf(d.id,n);if(!t.zheng.length&&!t.qi.length)continue;
    // 正：每項 2 級、每級 1 點，邊際效益由高到低貪婪分配
    const mg=[];
    for(const z of t.zheng){let prev=0;z.fx.forEach((f,i)=>{const v=nodeVal(f,W);mg.push({n:z.n,lv:i+1,v:v-prev,node:z});prev=v})}
    mg.sort((a,b)=>b.v-a.v||a.lv-b.lv);
    const take={};let left=cap,sum=0;
    for(const m of mg){if(left<=0)break;if(m.lv>1&&!take[m.n])continue;take[m.n]=m.lv;left--;sum+=m.v}
    const qs=t.qi.map(q=>({q,s:qiScore(q,W)})).sort((a,b)=>b.s-a.s)[0];
    rank.push({id:d.id,score:sum+(qs?qs.s*1.2:0),take,qi:qs?.q.n||null,qiWhy:qs?.q.t||'',t});
  }
  rank.sort((a,b)=>b.score-a.score);
  const b=rank[0];if(!b)return null;
  const sel=cleanSel({d:b.id,q:b.qi,z:b.take},r,n);
  const why=[`方向「${b.id}」（${b.t.sub}）：這位武將${W.nRush?`有 ${W.nRush} 個突擊戰法，突擊傷害與普攻強化最值錢`:W.nAct?`以 ${W.nAct} 個主動戰法輸出為主`:'沒有主動／突擊輸出，偏重傷害與防禦加成'}，${W.phys?'屬於武勇型（兵刃）':'屬於智略型（謀略）'}，四個方向裡這個加成總值最高`];
  for(const[nm,lv]of Object.entries(sel.z)){const z=b.t.zheng.find(x=>x.n===nm);why.push(`「${nm}」Lv${lv}：${z.t[lv-1]}`)}
  if(sel.q)why.push(`奇「${sel.q}」（不花點）：${b.qiWhy}`);
  return{sel,why,alt:rank.slice(1,3).map(x=>x.id)};
}

// 自由配點：全部加在主要輸出屬性（武勇型加武勇、智略型加智略）。
// 理由：傷害係數 = 1 + (攻方屬性 − 守方屬性) ÷ 280，輸出屬性每 +1 點，傷害約 +0.35%；速度只影響出手順序，統率只減少兵刃傷害，輸出主力優先堆輸出屬性。
export function advisePoints(st,pool){
  const k=st.武勇>=st.智略?'武勇':'智略';
  return{pts:{[k]:pool},why:`${pool} 點全加${k}：${k==='武勇'?'兵刃（普攻、突擊多為兵刃）':'謀略'}傷害與${k}成正比，其他屬性邊際效益較低`};
}

// 兵種：隊伍兵種（bestArm 的結果）＋哪些武將的特性提供兵種等級、有哪些兵種技可以搭
export function adviseArm(kit,D,arm,names,armWhy){
  const skills=kit.POOL.filter(s=>kit.ps(s).kind==='兵種'&&kit.ps(s).arm===arm);
  return{arm,why:`${arm}兵：${armWhy||'隊伍特性提供的兵種等級最高'}${skills.length?`；可搭兵種技：${skills.join('、')}（開場直接生效）`:''}`,skills};
}

const ARMW={騎:'騎兵',弓:'弓兵',槍:'足輕',鐵炮:'鐵炮',器械:'器械'};
// 哪些武將的特性提供這個兵種的等級（滿紅）；回傳一句說明
export function armReason(D,arm,names){
  const parts=[];
  for(const n of names)for(const t of D.stats?.[n]?.traits||[]){
    const x=D.traitText?.[n]?.[t]||'',m=x.match(/^部隊的(.+?)等級上升(\d)級/);
    if(m&&m[1].split('、').includes(ARMW[arm]))parts.push(`${n}「${t}」+${m[2]}`);
    const m2=t.match(/^([馬弓槍炮器]+)術(I{1,3})$/);
    if(m2&&[...m2[1]].some(c=>({馬:'騎',弓:'弓',槍:'槍',炮:'鐵炮',器:'器械'})[c]===arm))parts.push(`${n}「${t}」+${m2[2].length}`);
  }
  return parts.length?`兵種等級加成：${parts.join('、')}`:'';
}
