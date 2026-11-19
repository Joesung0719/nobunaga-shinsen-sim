// 用詳細戰報的普通攻擊事件擬合傷害公式 base、statDiv（只看普攻：loss ≈ √攻方當下兵力 × base × (1+(武勇−統率)/statDiv) × 相剋）。
// 用法：node tools/report-fit.mjs <battles2.json>   （私人資料，不進 repo）
// battles2.json：[{id,L:[名],R:[名],att:[{a,t,loss,ta}]}]；單數場擬合、雙數場回測。假設雙方 Lv50 滿紅。
import fs from 'node:fs';
import {fullRedStats,bestArm,COUNTER} from '../slg/engine.js';
const D=JSON.parse(fs.readFileSync(new URL('../land.json',import.meta.url)));
const B=JSON.parse(fs.readFileSync(process.argv[2]));
const S=[];
B.forEach((b,bi)=>{
  const side=n=>b.L.includes(n)?b.L:b.R.includes(n)?b.R:null;
  const memo={};const info=n=>memo[n]??=(()=>{const t=side(n);if(!t||!t.every(x=>D.stats[x]))return null;const arm=bestArm(D,t)||'槍';return{arm,st:fullRedStats(D,n,t,arm,50)}})();
  for(const e of b.att){const A=info(e.a),T=info(e.t);if(!A||!T||b.L.includes(e.a)===b.L.includes(e.t)||e.ta<500||e.loss<=0)continue;
    const c=COUNTER[A.arm]?.includes(T.arm)?1.15:COUNTER[T.arm]?.includes(A.arm)?.87:1;
    S.push({bi,x:Math.sqrt(e.ta)*c,d:A.st.武勇-T.st.統率,y:e.loss})}
});
const err=(set,base,sd)=>{const l=set.map(s=>Math.abs(Math.log(Math.max(1,s.x*base*Math.min(3,Math.max(.3,1+s.d/sd)))/s.y)));l.sort((a,b)=>a-b);return l[l.length>>1]};
const fit=set=>{let best=null;for(let base=2;base<=7;base+=.1)for(const sd of [120,160,200,240,280,340,420,600,1000]){const e=err(set,base,sd);if(!best||e<best.e)best={base:+base.toFixed(1),sd,e}}return best};
for(const[name,f]of[['單數場擬合→雙數場回測',s=>s.bi%2===1],['雙數場擬合→單數場回測',s=>s.bi%2===0]]){
  const tr=S.filter(f),te=S.filter(s=>!f(s)),b=fit(tr);
  console.log(JSON.stringify({split:name,samples:S.length,train:tr.length,test:te.length,fit:{base:b.base,sd:b.sd},trainErr:+b.e.toFixed(3),testErr:+err(te,b.base,b.sd).toFixed(3),currentK:{trainErr:+err(tr,4.2,280).toFixed(3),testErr:+err(te,4.2,280).toFixed(3)}}));
}
const a=fit(S);console.log(JSON.stringify({all:S.length,fit:{base:a.base,sd:a.sd},err:+a.e.toFixed(3),currentErr:+err(S,4.2,280).toFixed(3)}));
